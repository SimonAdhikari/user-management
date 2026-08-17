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
from exceptions import AuthenticationError, PostNotFoundError, TwoFactorRequiredError, UserManagementError
from services import UserManager
from utilities import RateLimiter, SessionStore

settings = Settings.load()
settings.data_dir.mkdir(parents=True, exist_ok=True)
manager = UserManager(settings.data_dir / "users.json", settings.data_dir / "activity.log")
sessions = SessionStore(settings.session_minutes)
login_limiter = RateLimiter(limit=5, window_seconds=60)
bearer = HTTPBearer(auto_error=False)
STORAGE_SERVER_URL = os.getenv("STORAGE_SERVER_URL", "http://127.0.0.1:8001")
app = FastAPI(title="Secure User Management API", version="1.0.0",
              docs_url="/docs" if settings.environment == "development" else None,
              redoc_url=None)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=True,
                   allow_methods=["GET", "POST", "PUT", "DELETE"], allow_headers=["Authorization", "Content-Type", "X-Setup-Key"])
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


class TwoFactorConfirmRequest(BaseModel):
    code: str = Field(min_length=6, max_length=6)


class KycRequest(BaseModel):
    document_type: str = Field(min_length=1, max_length=40)
    document_number: str = Field(min_length=4, max_length=40)


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


def request_data(request: BaseModel) -> dict:
    return request.model_dump() if hasattr(request, "model_dump") else request.dict()


def api_error(error: Exception, code: int = 400) -> HTTPException:
    return HTTPException(status_code=code, detail=str(error))


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


def require_roles(*roles: str):
    def check(user=Depends(current_user)):
        if user.role not in roles:
            manager.logger.log("ACCESS_DENIED", user.user_id, f"required={','.join(roles)}")
            raise api_error(Exception("You do not have permission for this action."), status.HTTP_403_FORBIDDEN)
        return user
    return check


@app.middleware("http")
async def security_headers(request: Request, call_next):
    if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
        origin = request.headers.get("origin")
        # Browser state-changing requests must originate from an explicitly trusted UI.
        if origin and origin not in settings.cors_origins:
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


@app.post("/auth/signup", status_code=status.HTTP_201_CREATED, tags=["authentication"])
def signup(request: UserCreateRequest):
    """Public self-service registration. New accounts start with the 'User' role."""
    if request.role != "User":
        raise api_error(Exception("Self-service accounts are created with the standard User role."), status.HTTP_400_BAD_REQUEST)
    try:
        user = manager.create_user(**request_data(request))
        manager.logger.log("USER_SIGNED_UP", user.user_id, f"role={user.role}")
        return {"message": "Account created. You can sign in now.", "user": user.to_dict()}
    except (UserManagementError, ValueError) as error:
        raise api_error(error)


@app.post("/setup/administrator", status_code=status.HTTP_201_CREATED, tags=["setup"])
def initial_administrator(http_request: Request, request: UserCreateRequest):
    """One-time bootstrap. It is unavailable as soon as any account exists."""
    supplied_key = http_request.headers.get("X-Setup-Key", "")
    if not settings.bootstrap_key or not secrets.compare_digest(supplied_key, settings.bootstrap_key):
        manager.logger.log("BOOTSTRAP_DENIED", "SYSTEM")
        raise api_error(Exception("Initial setup is not authorised."), status.HTTP_403_FORBIDDEN)
    if manager.users:
        raise api_error(Exception("Initial setup has already been completed."), status.HTTP_409_CONFLICT)
    if request.role != "Administrator":
        raise api_error(Exception("The initial account must be an Administrator."))
    try:
        return {"message": "Initial administrator created.", "user": manager.create_user(**request_data(request)).to_dict()}
    except (UserManagementError, ValueError) as error:
        raise api_error(error)


@app.post("/auth/login", tags=["authentication"])
def login(request: LoginRequest, http_request: Request, response: Response):
    client_ip = http_request.client.host if http_request.client else "unknown"
    if not login_limiter.allowed(client_ip):
        manager.logger.log("LOGIN_RATE_LIMITED", request.email, f"ip={client_ip}")
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


@app.get("/users", tags=["users"])
def get_users(_: object = Depends(require_roles("Administrator"))):
    return [user.to_dict() for user in manager.users]


@app.post("/users", status_code=status.HTTP_201_CREATED, tags=["users"])
def create_user(request: UserCreateRequest, actor=Depends(require_roles("Administrator"))):
    try:
        user = manager.create_user(**request_data(request))
        manager.logger.log("USER_CREATED_BY_ADMIN", user.user_id, f"actor={actor.user_id}")
        return {"message": "User created.", "user": user.to_dict()}
    except (UserManagementError, ValueError) as error:
        raise api_error(error)


@app.post("/users/{user_id}/unlock", tags=["users"])
def unlock(user_id: str, actor=Depends(require_roles("Administrator"))):
    try:
        user = manager.unlock_user(user_id)
        manager.logger.log("ACCOUNT_UNLOCKED_BY_ADMIN", user.user_id, f"actor={actor.user_id}")
        return user.to_dict()
    except UserManagementError as error:
        raise api_error(error, status.HTTP_404_NOT_FOUND)


@app.get("/privileges", tags=["users"])
def privileges(user=Depends(current_user)):
    return {"user_id": user.user_id, "privileges": user.display_privileges()}


@app.get("/reports/activity", tags=["reports"])
def report(_: object = Depends(require_roles("Administrator", "Security Analyst"))):
    return manager.activity_report()


@app.post("/2fa/setup", tags=["two-factor"])
def twofa_setup(user=Depends(current_user)):
    """Begin TOTP enrolment. Returns the secret and an otpauth:// URI for QR scanning."""
    return manager.begin_2fa_setup(user.user_id)


@app.post("/2fa/confirm", tags=["two-factor"])
def twofa_confirm(request: TwoFactorConfirmRequest, user=Depends(current_user)):
    """Activate 2FA after the user proves they can generate a valid code."""
    try:
        updated = manager.confirm_2fa_setup(user.user_id, request.code)
        return {"message": "Two-factor authentication enabled.", "totp_enabled": updated.totp_enabled}
    except ValueError as error:
        raise api_error(error)


@app.post("/2fa/disable", tags=["two-factor"])
def twofa_disable(request: TwoFactorConfirmRequest, user=Depends(current_user)):
    """Disable 2FA; a valid current code is required as proof of possession."""
    if not user.verify_totp(request.code):
        raise api_error(Exception("Invalid authentication code."), status.HTTP_401_UNAUTHORIZED)
    manager.disable_2fa(user.user_id)
    return {"message": "Two-factor authentication disabled.", "totp_enabled": False}


@app.post("/kyc/submit", tags=["kyc"])
def kyc_submit(request: KycRequest, user=Depends(current_user)):
    """Submit KYC documents to verify identity."""
    try:
        updated = manager.submit_kyc(user.user_id, request.document_type, request.document_number)
        return {"message": "KYC verification completed.", "kyc_status": updated.kyc_status}
    except ValueError as error:
        raise api_error(error)


@app.get("/kyc/status", tags=["kyc"])
def kyc_status(user=Depends(current_user)):
    """Check current KYC status."""
    return {"kyc_status": user.kyc_status, "document_type": user.kyc_document_type}


@app.get("/identify/{user_id}", tags=["identity"])
def identify_user(user_id: str, _: object = Depends(require_roles("Administrator", "Security Analyst"))):
    """Re-identify a known user from the plain-text registry."""
    try:
        return manager.identify_user(user_id)
    except UserNotFoundError as error:
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
