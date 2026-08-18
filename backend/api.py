"""Authenticated HTTP API. Deploy behind HTTPS and a reverse proxy in production."""
import os
import secrets
from pathlib import Path

import httpx
from fastapi import Depends, FastAPI, File, HTTPException, Request, Response, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.httpsredirect import HTTPSRedirectMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

from config import Settings
from exceptions import AuthenticationError, TwoFactorRequiredError, UserManagementError
from services import UserManager, VerificationManager
from utilities import EmailSender, EmailVerifier, RateLimiter, SessionStore

settings = Settings.load()
settings.data_dir.mkdir(parents=True, exist_ok=True)
manager = UserManager(settings.data_dir / "users.json", settings.data_dir / "activity.log")
verifications = VerificationManager()
email_sender = EmailSender(settings.smtp_host, settings.smtp_port, settings.smtp_username,
                           settings.smtp_password, settings.smtp_sender, settings.smtp_tls)
sessions = SessionStore(settings.session_minutes)
login_limiter = RateLimiter(limit=5, window_seconds=60)
signup_limiter = RateLimiter(limit=3, window_seconds=300)
bearer = HTTPBearer(auto_error=False)
STORAGE_SERVER_URL = os.getenv("STORAGE_SERVER_URL", "http://127.0.0.1:8001")

# In-memory call state: call_id -> {initiator, participants, signals: {user_id -> [messages]}}
active_calls = {}
app = FastAPI(title="Social Hub API", version="2.0.0",
              docs_url="/docs" if settings.environment == "development" else None,
              redoc_url=None)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=True,
                   allow_methods=["GET", "POST", "PUT", "DELETE"], allow_headers=["Authorization", "Content-Type"])
app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.allowed_hosts)
if settings.environment == "production":
    app.add_middleware(HTTPSRedirectMiddleware)


def _storage_request(method: str, path: str, **kwargs) -> httpx.Response:
    """Forward a request to the dedicated post storage server."""
    url = f"{STORAGE_SERVER_URL}{path}"
    try:
        with httpx.Client(timeout=30.0) as client:
            return client.request(method, url, **kwargs)
    except httpx.RequestError as error:
        raise HTTPException(status_code=503, detail=f"Storage server unavailable: {error}")


class UserCreateRequest(BaseModel):
    user_id: str | None = Field(default=None, min_length=3, max_length=20,
                                description="Optional. A secure unique key is generated when omitted.")
    name: str = Field(min_length=1, max_length=80)
    email: str = Field(max_length=254)
    password: str = Field(min_length=10, max_length=128)
    role: str


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=128)
    totp_code: str | None = Field(default=None, min_length=6, max_length=6)


class SignupVerifyRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    code: str = Field(min_length=6, max_length=6)


class SignupResendRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)


class MediaItem(BaseModel):
    url: str = Field(min_length=1, max_length=500)
    kind: str = Field(min_length=1, max_length=10)
    mime_type: str = Field(min_length=1, max_length=80)
    filename: str = Field(default="", max_length=200)


class PostCreateRequest(BaseModel):
    body: str = Field(min_length=1, max_length=2000)
    media: list[MediaItem] = Field(default_factory=list, max_length=4)
    repost_of: str | None = Field(default=None, max_length=40)


class CommentCreateRequest(BaseModel):
    body: str = Field(min_length=1, max_length=1000)
    parent_id: str | None = Field(default=None, max_length=40)


class CommentEditRequest(BaseModel):
    body: str = Field(min_length=1, max_length=1000)


class CallInitiateRequest(BaseModel):
    """Initiate an audio/video call to peer(s)."""
    peer_id: str | None = Field(default=None, max_length=40, description="Single peer for 1-to-1 call")
    peer_ids: list[str] = Field(default_factory=list, max_length=20, description="Multiple peers for group call")
    call_type: str = Field(default="audio", pattern="^(audio|video)$")


class CallSignalRequest(BaseModel):
    """WebRTC signaling message (SDP offer/answer or ICE candidate)."""
    call_id: str = Field(min_length=1, max_length=60)
    from_user_id: str = Field(min_length=1, max_length=40)
    to_user_id: str = Field(min_length=1, max_length=40)
    message_type: str = Field(pattern="^(offer|answer|ice-candidate)$")
    payload: dict = Field(description="SDP offer/answer or ICE candidate data")


class CallResponseRequest(BaseModel):
    """Accept or decline incoming call."""
    call_id: str = Field(min_length=1, max_length=60)
    action: str = Field(pattern="^(accept|decline)$")


# Social features request models
class FollowRequest(BaseModel):
    target_user_id: str = Field(min_length=1, max_length=40)


class FriendRequestAction(BaseModel):
    target_user_id: str = Field(min_length=1, max_length=40)


class BlockRequest(BaseModel):
    target_user_id: str = Field(min_length=1, max_length=40)


def request_data(request: BaseModel) -> dict:
    return request.model_dump() if hasattr(request, "model_dump") else request.dict()


def api_error(error: Exception, code: int = 400) -> HTTPException:
    return HTTPException(status_code=code, detail=str(error))


def client_ip(request: Request) -> str:
    """Best-effort real client IP.

    Behind a reverse proxy or a Cloudflare tunnel every connection arrives
    from 127.0.0.1, so the original client address is read from the
    X-Forwarded-For chain (first hop = the real client).
    """
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        first = forwarded.split(",")[0].strip()
        if first:
            return first
    return request.client.host if request.client else "unknown"


def current_user(request: Request, credentials: HTTPAuthorizationCredentials | None = Depends(bearer)):
    # Browser clients use an HttpOnly cookie; Bearer is retained for controlled API clients.
    token = request.cookies.get("sums_session")
    if not token and credentials and credentials.scheme.lower() == "bearer":
        token = credentials.credentials
    if not token:
        raise api_error(Exception("Authentication required."), status.HTTP_401_UNAUTHORIZED)
    user_id = sessions.resolve(token)
    if not user_id:
        raise api_error(Exception("Session expired or invalid."), status.HTTP_401_UNAUTHORIZED)
    try:
        return manager.get_user(user_id)
    except UserManagementError:
        raise api_error(Exception("Session invalid."), status.HTTP_401_UNAUTHORIZED)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
        origin = request.headers.get("origin")
        # Browser state-changing requests must originate from an explicitly trusted UI.
        # A wildcard origin ("*") — added automatically in development — allows any
        # origin, which is required when the app is served through a public tunnel
        # (the browser origin is the tunnel domain, not localhost).
        if origin and "*" not in settings.cors_origins and origin not in settings.cors_origins:
            return Response(status_code=status.HTTP_403_FORBIDDEN, content="Blocked origin")
    # Media uploads are validated for size on the storage server (25 MB limit),
    # so they are exempt from the small JSON-body request limit applied here.
    is_media_upload = request.url.path.rstrip("/").endswith("/media/upload")
    content_length = request.headers.get("content-length")
    if not is_media_upload and content_length and (not content_length.isdigit() or int(content_length) > settings.max_request_bytes):
        return Response(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, content="Request too large")
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Cache-Control"] = "no-store"
    response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
    if settings.environment == "production":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


@app.get("/health", tags=["operations"])
def health():
    return {"status": "ok"}


def _deliver_verification_code(email: str, code: str) -> dict:
    """Send the code by email; in development without SMTP, surface it inline."""
    if email_sender.configured:
        try:
            email_sender.send_verification_code(email, code)
            return {"message": "A verification code has been sent to your email. Enter it to finish creating your account."}
        except Exception as error:
            manager.logger.log("SIGNUP_EMAIL_FAILED", email, str(error))
            raise api_error(Exception("Could not send the verification email. Try again later."),
                            status.HTTP_502_BAD_GATEWAY)
    if settings.environment == "development":
        # No SMTP relay configured — show the code so local testing still works.
        return {"message": "Email delivery is not configured. Use this code to verify.", "dev_code": code}
    raise api_error(Exception("Email delivery is not configured on this server."), status.HTTP_503_SERVICE_UNAVAILABLE)


@app.post("/auth/signup", tags=["authentication"])
def signup(http_request: Request, request: UserCreateRequest):
    """Public self-service registration. Only real, reachable email addresses
    are accepted: disposable providers, reserved domains, and domains without
    mail records are rejected. The account is created only after the user
    enters the one-time code emailed to them (/auth/signup/verify)."""
    if request.role != "User":
        raise api_error(Exception("Self-service accounts are created with the standard User role."), status.HTTP_400_BAD_REQUEST)
    client_ip_addr = client_ip(http_request)
    if not signup_limiter.allowed(client_ip_addr):
        manager.logger.log("SIGNUP_RATE_LIMITED", request.email, f"ip={client_ip_addr}")
        raise api_error(Exception("Too many signup attempts. Try again later."), status.HTTP_429_TOO_MANY_REQUESTS)
    email = request.email.strip().lower()
    # Reject fake / disposable / undeliverable addresses before anything else.
    try:
        EmailVerifier.verify_authenticity(email)
    except UserManagementError as error:
        manager.logger.log("SIGNUP_FAKE_EMAIL_REJECTED", email)
        raise api_error(error)
    # Reject duplicates early so users get a clear message.
    if any(u.email == email for u in manager.users):
        raise api_error(Exception("A user with this email already exists."), status.HTTP_409_CONFLICT)
    code = verifications.start(email, request_data(request))
    manager.logger.log("SIGNUP_VERIFICATION_STARTED", email)
    return _deliver_verification_code(email, code)


@app.post("/auth/signup/resend", tags=["authentication"])
def signup_resend(http_request: Request, request: SignupResendRequest):
    """Resend the verification code for a pending signup."""
    client_ip_addr = client_ip(http_request)
    if not signup_limiter.allowed(client_ip_addr):
        raise api_error(Exception("Too many attempts. Try again later."), status.HTTP_429_TOO_MANY_REQUESTS)
    email = request.email.strip().lower()
    try:
        code = verifications.restart_code(email)
    except ValueError as error:
        raise api_error(error)
    manager.logger.log("SIGNUP_CODE_RESENT", email)
    return _deliver_verification_code(email, code)


@app.post("/auth/signup/verify", status_code=status.HTTP_201_CREATED, tags=["authentication"])
def signup_verify(request: SignupVerifyRequest):
    """Finish registration: validate the emailed code, then create the account."""
    email = request.email.strip().lower()
    try:
        payload = verifications.confirm(email, request.code.strip())
    except ValueError as error:
        manager.logger.log("SIGNUP_VERIFICATION_FAILED", email)
        raise api_error(error, status.HTTP_400_BAD_REQUEST)
    try:
        user = manager.create_user(**payload)
    except (UserManagementError, ValueError) as error:
        raise api_error(error)
    verifications.complete(email)
    manager.logger.log("USER_SIGNED_UP", user.user_id, f"role={user.role}")
    return {"message": "Email verified. Account created. You can sign in now.", "user": user.to_dict()}


@app.post("/auth/login", tags=["authentication"])
def login(request: LoginRequest, http_request: Request, response: Response):
    client_ip_addr = client_ip(http_request)
    if not login_limiter.allowed(client_ip_addr):
        manager.logger.log("LOGIN_RATE_LIMITED", request.email, f"ip={client_ip_addr}")
        raise api_error(Exception("Too many login attempts. Try again later."), status.HTTP_429_TOO_MANY_REQUESTS)
    try:
        user = manager.authenticate_by_email(request.email, request.password, request.totp_code)
        token, expires = sessions.issue(user.user_id)
        response.set_cookie("sums_session", token, max_age=settings.session_minutes * 60, httponly=True,
                            secure=settings.cookie_secure, samesite="lax", path="/")
        return {"expires_at": expires.isoformat(), "token": token, "user": user.to_dict()}
    except TwoFactorRequiredError:
        # Password accepted — the client must resubmit with a TOTP code.
        raise api_error(Exception("Two-factor authentication code required."), status.HTTP_401_UNAUTHORIZED)
    except AuthenticationError:
        # Avoid account enumeration and do not expose lock state.
        raise api_error(Exception("Invalid user ID or password."), status.HTTP_401_UNAUTHORIZED)


@app.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT, tags=["authentication"])
def logout(response: Response, request: Request, _: object = Depends(current_user)):
    token = request.cookies.get("sums_session")
    if token:
        sessions.revoke(token)
    response.delete_cookie("sums_session", httponly=True, secure=settings.cookie_secure, samesite="lax", path="/")


@app.get("/people", tags=["people"])
def list_people(user=Depends(current_user)):
    """Public member directory. Any signed-in member can browse profiles;
    users blocked in either direction are hidden."""
    return [member.to_public_dict() for member in manager.users
            if not user.is_blocked(member.user_id) and not member.is_blocked(user.user_id)]


# ============================================================================
# SOCIAL FEATURES (Follow, Friends, Block)
# ============================================================================

@app.post("/social/follow", tags=["social"])
def follow_user(request: FollowRequest, user=Depends(current_user)):
    """Follow another user."""
    try:
        manager.follow_user(user.user_id, request.target_user_id)
        return {"message": "Successfully followed user."}
    except (UserManagementError, ValueError) as error:
        raise api_error(error)


@app.delete("/social/follow/{target_user_id}", tags=["social"])
def unfollow_user(target_user_id: str, user=Depends(current_user)):
    """Unfollow a user."""
    try:
        manager.unfollow_user(user.user_id, target_user_id)
        return {"message": "Successfully unfollowed user."}
    except (UserManagementError, ValueError) as error:
        raise api_error(error)


@app.post("/social/friend-request", tags=["social"])
def send_friend_request(request: FriendRequestAction, user=Depends(current_user)):
    """Send a friend request to another user."""
    try:
        manager.send_friend_request(user.user_id, request.target_user_id)
        return {"message": "Friend request sent."}
    except (UserManagementError, ValueError) as error:
        raise api_error(error)


@app.post("/social/friend-request/accept", tags=["social"])
def accept_friend_request(request: FriendRequestAction, user=Depends(current_user)):
    """Accept a friend request."""
    try:
        manager.accept_friend_request(user.user_id, request.target_user_id)
        return {"message": "Friend request accepted. You are now friends!"}
    except (UserManagementError, ValueError) as error:
        raise api_error(error)


@app.post("/social/friend-request/decline", tags=["social"])
def decline_friend_request(request: FriendRequestAction, user=Depends(current_user)):
    """Decline a friend request."""
    try:
        manager.decline_friend_request(user.user_id, request.target_user_id)
        return {"message": "Friend request declined."}
    except (UserManagementError, ValueError) as error:
        raise api_error(error)


@app.delete("/social/friend-request/{target_user_id}", tags=["social"])
def cancel_friend_request(target_user_id: str, user=Depends(current_user)):
    """Cancel a sent friend request."""
    try:
        manager.cancel_friend_request(user.user_id, target_user_id)
        return {"message": "Friend request cancelled."}
    except (UserManagementError, ValueError) as error:
        raise api_error(error)


@app.delete("/social/friend/{target_user_id}", tags=["social"])
def unfriend_user(target_user_id: str, user=Depends(current_user)):
    """Remove a friend (mutual unfriend)."""
    try:
        manager.unfriend_user(user.user_id, target_user_id)
        return {"message": "Successfully unfriended user."}
    except (UserManagementError, ValueError) as error:
        raise api_error(error)


@app.post("/social/block", tags=["social"])
def block_user(request: BlockRequest, user=Depends(current_user)):
    """Block a user."""
    try:
        manager.block_user(user.user_id, request.target_user_id)
        return {"message": "User blocked."}
    except (UserManagementError, ValueError) as error:
        raise api_error(error)


@app.delete("/social/block/{target_user_id}", tags=["social"])
def unblock_user(target_user_id: str, user=Depends(current_user)):
    """Unblock a user."""
    try:
        manager.unblock_user(user.user_id, target_user_id)
        return {"message": "User unblocked."}
    except (UserManagementError, ValueError) as error:
        raise api_error(error)


@app.get("/social/info", tags=["social"])
def get_social_info(user=Depends(current_user)):
    """Get social information for the current user."""
    try:
        return manager.get_social_info(user.user_id)
    except UserManagementError as error:
        raise api_error(error)


@app.get("/social/profile/{target_user_id}", tags=["social"])
def get_user_profile(target_user_id: str, user=Depends(current_user)):
    """Get a user's profile with social context from current user's perspective."""
    try:
        return manager.get_user_profile(user.user_id, target_user_id)
    except UserManagementError as error:
        raise api_error(error, status.HTTP_404_NOT_FOUND)


# ---------------------------------------------------------------------------
# Posts, comments, likes, and media uploads — proxied to the storage server
# ---------------------------------------------------------------------------

@app.post("/media/upload", tags=["posts"])
async def upload_media(file: UploadFile = File(...), user=Depends(current_user)):
    """Forward the uploaded file to the dedicated storage server."""
    content = await file.read()
    files = {"file": (file.filename or "upload", content, file.content_type or "application/octet-stream")}
    response = _storage_request("POST", "/media/upload", files=files)
    if response.status_code >= 400:
        raise api_error(Exception(response.json().get("detail", "Upload failed.")), response.status_code)
    manager.logger.log("MEDIA_UPLOADED", user.user_id, f"mime={file.content_type} bytes={len(content)}")
    return response.json()


@app.get("/posts", tags=["posts"])
def list_posts(_: object = Depends(current_user)):
    """Return the global feed from the storage server."""
    response = _storage_request("GET", "/posts")
    if response.status_code >= 400:
        raise api_error(Exception(response.json().get("detail", "Storage error.")), response.status_code)
    return response.json()


@app.get("/posts/user/{author_id}", tags=["posts"])
def list_user_posts(author_id: str, _: object = Depends(current_user)):
    response = _storage_request("GET", f"/posts/user/{author_id}")
    if response.status_code >= 400:
        raise api_error(Exception(response.json().get("detail", "Storage error.")), response.status_code)
    return response.json()


@app.get("/posts/{post_id}", tags=["posts"])
def get_post(post_id: str, _: object = Depends(current_user)):
    response = _storage_request("GET", f"/posts/{post_id}")
    if response.status_code >= 400:
        raise api_error(Exception(response.json().get("detail", "Post not found.")), response.status_code)
    return response.json()


@app.post("/posts", status_code=status.HTTP_201_CREATED, tags=["posts"])
def create_post(request: PostCreateRequest, user=Depends(current_user)):
    payload = {
        "author_id": user.user_id,
        "author_name": user.name,
        "author_role": user.role,
        "body": request.body,
        "media": [item.model_dump() for item in request.media],
        "repost_of": request.repost_of,
    }
    response = _storage_request("POST", "/posts", json=payload)
    if response.status_code >= 400:
        raise api_error(Exception(response.json().get("detail", "Could not create post.")), response.status_code)
    return response.json()


@app.delete("/posts/{post_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["posts"])
def delete_post(post_id: str, user=Depends(current_user)):
    response = _storage_request("DELETE", f"/posts/{post_id}", params={"actor_id": user.user_id, "actor_role": user.role})
    if response.status_code == 404:
        raise api_error(Exception("Post not found."), status.HTTP_404_NOT_FOUND)
    if response.status_code == 403:
        raise api_error(Exception("You can only delete your own posts."), status.HTTP_403_FORBIDDEN)
    if response.status_code >= 400:
        raise api_error(Exception(response.json().get("detail", "Storage error.")), response.status_code)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.post("/posts/{post_id}/like", tags=["posts"])
def toggle_like(post_id: str, user=Depends(current_user)):
    response = _storage_request("POST", f"/posts/{post_id}/like", json={"user_id": user.user_id})
    if response.status_code >= 400:
        raise api_error(Exception(response.json().get("detail", "Storage error.")), response.status_code)
    return response.json()


class ReactRequest(BaseModel):
    reaction: str = Field(min_length=1, max_length=20)


@app.post("/posts/{post_id}/react", tags=["posts"])
def react_to_post(post_id: str, request: ReactRequest, user=Depends(current_user)):
    response = _storage_request("POST", f"/posts/{post_id}/react",
                                json={"user_id": user.user_id, "reaction": request.reaction})
    if response.status_code >= 400:
        raise api_error(Exception(response.json().get("detail", "Storage error.")), response.status_code)
    return response.json()


@app.post("/posts/{post_id}/share", tags=["posts"])
def share_post(post_id: str, user=Depends(current_user)):
    response = _storage_request("POST", f"/posts/{post_id}/share", json={"user_id": user.user_id})
    if response.status_code >= 400:
        raise api_error(Exception(response.json().get("detail", "Storage error.")), response.status_code)
    manager.logger.log("POST_SHARED", user.user_id, f"post={post_id}")
    return response.json()


@app.post("/posts/{post_id}/comments", status_code=status.HTTP_201_CREATED, tags=["posts"])
def add_comment(post_id: str, request: CommentCreateRequest, user=Depends(current_user)):
    payload = {
        "author_id": user.user_id,
        "author_name": user.name,
        "author_role": user.role,
        "body": request.body,
        "parent_id": request.parent_id,
    }
    response = _storage_request("POST", f"/posts/{post_id}/comments", json=payload)
    if response.status_code >= 400:
        raise api_error(Exception(response.json().get("detail", "Could not add comment.")), response.status_code)
    return response.json()


@app.post("/posts/{post_id}/comments/{comment_id}/like", tags=["posts"])
def toggle_comment_like(post_id: str, comment_id: str, user=Depends(current_user)):
    response = _storage_request("POST", f"/posts/{post_id}/comments/{comment_id}/like", json={"user_id": user.user_id})
    if response.status_code >= 400:
        raise api_error(Exception(response.json().get("detail", "Storage error.")), response.status_code)
    return response.json()


@app.put("/posts/{post_id}/comments/{comment_id}", tags=["posts"])
def edit_comment(post_id: str, comment_id: str, request: CommentEditRequest, user=Depends(current_user)):
    response = _storage_request("PUT", f"/posts/{post_id}/comments/{comment_id}",
                                json={"body": request.body},
                                params={"actor_id": user.user_id, "actor_role": user.role})
    if response.status_code == 403:
        raise api_error(Exception("You can only edit your own comments."), status.HTTP_403_FORBIDDEN)
    if response.status_code == 404:
        raise api_error(Exception("Comment not found."), status.HTTP_404_NOT_FOUND)
    if response.status_code >= 400:
        raise api_error(Exception(response.json().get("detail", "Could not edit comment.")), response.status_code)
    return response.json()


@app.delete("/posts/{post_id}/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["posts"])
def delete_comment(post_id: str, comment_id: str, user=Depends(current_user)):
    response = _storage_request("DELETE", f"/posts/{post_id}/comments/{comment_id}", params={"actor_id": user.user_id, "actor_role": user.role})
    if response.status_code == 404:
        raise api_error(Exception("Comment not found."), status.HTTP_404_NOT_FOUND)
    if response.status_code == 403:
        raise api_error(Exception("You can only delete your own comments."), status.HTTP_403_FORBIDDEN)
    if response.status_code >= 400:
        raise api_error(Exception(response.json().get("detail", "Storage error.")), response.status_code)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ============================================================================
# CALLING & SIGNALING (Audio/Video)
# ============================================================================

@app.post("/calls/initiate", tags=["calling"])
def initiate_call(request: CallInitiateRequest, user=Depends(current_user)):
    """Start a new audio/video call. Returns call_id and sends notifications to peers."""
    import uuid
    call_id = f"CALL_{uuid.uuid4().hex[:12].upper()}"
    peer_ids = [request.peer_id] if request.peer_id else request.peer_ids
    if not peer_ids or not all(peer_ids):
        raise api_error(Exception("Must specify at least one peer."), status.HTTP_400_BAD_REQUEST)
    try:
        for peer_id in peer_ids:
            manager.get_user(peer_id)
    except Exception:
        raise api_error(Exception("One or more peer IDs do not exist."), status.HTTP_404_NOT_FOUND)
    active_calls[call_id] = {
        "initiator": user.user_id,
        "participants": {user.user_id, *peer_ids},
        "call_type": request.call_type,
        "signals": {uid: [] for uid in peer_ids},
        "created_at": secrets.token_hex(0),  # Just a marker
    }
    manager.logger.log("CALL_INITIATED", user.user_id, f"call_id={call_id},peers={','.join(peer_ids)},type={request.call_type}")
    return {"call_id": call_id, "initiator_id": user.user_id, "peers": peer_ids, "call_type": request.call_type}


@app.post("/calls/{call_id}/signal", tags=["calling"])
def send_signal(call_id: str, request: CallSignalRequest, user=Depends(current_user)):
    """Send WebRTC signaling message (SDP offer/answer, ICE candidate)."""
    if call_id not in active_calls:
        raise api_error(Exception("Call not found."), status.HTTP_404_NOT_FOUND)
    call = active_calls[call_id]
    if request.to_user_id not in call["participants"]:
        raise api_error(Exception("Recipient not in this call."), status.HTTP_400_BAD_REQUEST)
    if request.to_user_id not in call["signals"]:
        call["signals"][request.to_user_id] = []
    call["signals"][request.to_user_id].append({
        "from": user.user_id,
        "type": request.message_type,
        "payload": request.payload,
        "timestamp": secrets.token_hex(0),
    })
    manager.logger.log("SIGNAL_SENT", user.user_id, f"call_id={call_id},to={request.to_user_id},type={request.message_type}")
    return {"status": "queued"}


@app.get("/calls/{call_id}/signals", tags=["calling"])
def get_signals(call_id: str, user=Depends(current_user)):
    """Poll for pending WebRTC signals for this user in a call."""
    if call_id not in active_calls:
        raise api_error(Exception("Call not found."), status.HTTP_404_NOT_FOUND)
    call = active_calls[call_id]
    if user.user_id not in call["participants"]:
        raise api_error(Exception("You are not in this call."), status.HTTP_403_FORBIDDEN)
    pending = call["signals"].get(user.user_id, [])
    call["signals"][user.user_id] = []  # Clear after retrieval
    return {"signals": pending}


@app.post("/calls/{call_id}/respond", tags=["calling"])
def respond_to_call(call_id: str, request: CallResponseRequest, user=Depends(current_user)):
    """Accept or decline an incoming call."""
    if call_id not in active_calls:
        raise api_error(Exception("Call not found."), status.HTTP_404_NOT_FOUND)
    call = active_calls[call_id]
    if user.user_id == call["initiator"]:
        raise api_error(Exception("Initiator cannot respond to their own call."), status.HTTP_400_BAD_REQUEST)
    if request.action == "accept":
        manager.logger.log("CALL_ACCEPTED", user.user_id, f"call_id={call_id}")
        return {"status": "accepted", "call_type": call["call_type"]}
    else:
        manager.logger.log("CALL_DECLINED", user.user_id, f"call_id={call_id}")
        if user.user_id in call["participants"]:
            call["participants"].discard(user.user_id)
        if not call["participants"]:
            del active_calls[call_id]
        return {"status": "declined"}


@app.post("/calls/{call_id}/end", status_code=status.HTTP_204_NO_CONTENT, tags=["calling"])
def end_call(call_id: str, user=Depends(current_user)):
    """End a call (initiator only, or any participant can leave)."""
    if call_id not in active_calls:
        raise api_error(Exception("Call not found."), status.HTTP_404_NOT_FOUND)
    call = active_calls[call_id]
    if user.user_id not in call["participants"]:
        raise api_error(Exception("You are not in this call."), status.HTTP_403_FORBIDDEN)
    call["participants"].discard(user.user_id)
    if not call["participants"] or user.user_id == call["initiator"]:
        del active_calls[call_id]
        manager.logger.log("CALL_ENDED", user.user_id, f"call_id={call_id}")
    return Response(status_code=status.HTTP_204_NO_CONTENT)

