"""Dedicated storage server for posts, comments, likes, and media.

This service runs independently from the main API and is the single source of
truth for all social-media content. The main backend proxies post-related
requests here so that post data lives in its own isolated store.
"""
from __future__ import annotations

import secrets
import uuid
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock

from fastapi import FastAPI, File, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

DATA_DIR = Path(__file__).resolve().parent / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
UPLOADS_DIR = DATA_DIR / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
POSTS_FILE = DATA_DIR / "posts.json"

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}
ALLOWED_VIDEO_TYPES = {"video/mp4", "video/webm", "video/quicktime"}
MAX_FILE_BYTES = 25 * 1024 * 1024
MAX_BODY_LENGTH = 2000
MAX_MEDIA_PER_POST = 4


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(6).upper()}"


class _Store:
    """Thread-safe in-memory store backed by a JSON file."""

    def __init__(self, file_path: Path) -> None:
        self.file_path = file_path
        self._posts: list[dict] = []
        self._lock = RLock()
        self._load()

    def _load(self) -> None:
        if self.file_path.exists():
            import json
            content = self.file_path.read_text(encoding="utf-8").strip()
            if content:
                self._posts = json.loads(content)

    def _save(self) -> None:
        import json
        import os
        from tempfile import NamedTemporaryFile
        with NamedTemporaryFile("w", encoding="utf-8", dir=self.file_path.parent,
                                delete=False, prefix=".posts-", suffix=".tmp") as file:
            json.dump(self._posts, file, indent=2)
            temp_name = file.name
        os.replace(temp_name, self.file_path)


store = _Store(POSTS_FILE)


def _validate_body(body: str) -> str:
    cleaned = (body or "").strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail="Post content cannot be empty.")
    if len(cleaned) > MAX_BODY_LENGTH:
        raise HTTPException(status_code=400, detail=f"Post content cannot exceed {MAX_BODY_LENGTH} characters.")
    return cleaned


def _validate_media(media: list[dict]) -> list[dict]:
    if not media:
        return []
    if len(media) > MAX_MEDIA_PER_POST:
        raise HTTPException(status_code=400, detail=f"A post can include at most {MAX_MEDIA_PER_POST} media files.")
    cleaned: list[dict] = []
    for item in media:
        if not isinstance(item, dict):
            raise HTTPException(status_code=400, detail="Invalid media entry.")
        url = str(item.get("url", "")).strip()
        kind = str(item.get("kind", "")).strip()
        mime = str(item.get("mime_type", "")).strip()
        if not url or not kind or not mime:
            raise HTTPException(status_code=400, detail="Media entries must include url, kind, and mime_type.")
        if kind not in {"image", "video"}:
            raise HTTPException(status_code=400, detail="Media kind must be image or video.")
        if kind == "image" and mime not in ALLOWED_IMAGE_TYPES:
            raise HTTPException(status_code=400, detail=f"Unsupported image type: {mime}")
        if kind == "video" and mime not in ALLOWED_VIDEO_TYPES:
            raise HTTPException(status_code=400, detail=f"Unsupported video type: {mime}")
        cleaned.append({"url": url, "kind": kind, "mime_type": mime, "filename": str(item.get("filename", ""))})
    return cleaned


def _public_view(post: dict) -> dict:
    return {
        "id": post["id"],
        "author_id": post["author_id"],
        "author_name": post["author_name"],
        "author_role": post["author_role"],
        "body": post["body"],
        "media": list(post.get("media", [])),
        "created_at": post["created_at"],
        "like_count": len(post.get("likes", [])),
        "comment_count": len(post.get("comments", [])),
        "repost_of": post.get("repost_of"),
        "comments": [
            {
                "id": c["id"],
                "author_id": c["author_id"],
                "author_name": c["author_name"],
                "author_role": c["author_role"],
                "body": c["body"],
                "created_at": c["created_at"],
            }
            for c in post.get("comments", [])
        ],
    }


class MediaItem(BaseModel):
    url: str = Field(min_length=1, max_length=500)
    kind: str = Field(min_length=1, max_length=10)
    mime_type: str = Field(min_length=1, max_length=80)
    filename: str = Field(default="", max_length=200)


class PostCreateRequest(BaseModel):
    author_id: str = Field(min_length=1, max_length=40)
    author_name: str = Field(min_length=1, max_length=80)
    author_role: str = Field(min_length=1, max_length=40)
    body: str = Field(min_length=1, max_length=2000)
    media: list[MediaItem] = Field(default_factory=list, max_length=4)
    repost_of: str | None = Field(default=None, max_length=40)


class CommentCreateRequest(BaseModel):
    author_id: str = Field(min_length=1, max_length=40)
    author_name: str = Field(min_length=1, max_length=80)
    author_role: str = Field(min_length=1, max_length=40)
    body: str = Field(min_length=1, max_length=1000)


class LikeRequest(BaseModel):
    user_id: str = Field(min_length=1, max_length=40)


app = FastAPI(title="Post Storage Server", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET", "POST", "DELETE"], allow_headers=["*"])
app.mount("/media", StaticFiles(directory=str(UPLOADS_DIR)), name="media")


@app.get("/health")
def health():
    return {"status": "ok", "service": "post-storage", "post_count": len(store._posts)}


@app.get("/posts")
def list_posts():
    with store._lock:
        return [_public_view(post) for post in store._posts]


@app.get("/posts/user/{author_id}")
def list_user_posts(author_id: str):
    with store._lock:
        return [_public_view(post) for post in store._posts if post["author_id"] == author_id]


@app.get("/posts/{post_id}")
def get_post(post_id: str):
    with store._lock:
        for post in store._posts:
            if post["id"] == post_id:
                return _public_view(post)
    raise HTTPException(status_code=404, detail="Post not found.")


@app.post("/posts", status_code=status.HTTP_201_CREATED)
def create_post(request: PostCreateRequest):
    cleaned_body = _validate_body(request.body)
    cleaned_media = _validate_media([item.model_dump() for item in request.media])
    repost_ref = None
    if request.repost_of:
        with store._lock:
            for existing in store._posts:
                if existing["id"] == request.repost_of:
                    repost_ref = {
                        "id": existing["id"],
                        "author_id": existing["author_id"],
                        "author_name": existing["author_name"],
                        "author_role": existing["author_role"],
                        "body": existing["body"],
                        "media": list(existing.get("media", [])),
                        "created_at": existing["created_at"],
                        "like_count": len(existing.get("likes", [])),
                        "comment_count": len(existing.get("comments", [])),
                    }
                    break
        if repost_ref is None:
            raise HTTPException(status_code=404, detail="Original post not found.")
    with store._lock:
        post = {
            "id": _new_id("POST"),
            "author_id": request.author_id,
            "author_name": request.author_name,
            "author_role": request.author_role,
            "body": cleaned_body,
            "media": cleaned_media,
            "created_at": _now(),
            "likes": [],
            "comments": [],
            "repost_of": repost_ref,
        }
        store._posts.insert(0, post)
        store._save()
        return {"message": "Post created.", "post": _public_view(post)}


@app.delete("/posts/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_post(post_id: str, actor_id: str, actor_role: str):
    with store._lock:
        for index, post in enumerate(store._posts):
            if post["id"] == post_id:
                if post["author_id"] != actor_id and actor_role != "Administrator":
                    raise HTTPException(status_code=403, detail="You can only delete your own posts.")
                store._posts.pop(index)
                store._save()
                return
    raise HTTPException(status_code=404, detail="Post not found.")


@app.post("/posts/{post_id}/like")
def toggle_like(post_id: str, request: LikeRequest):
    with store._lock:
        for post in store._posts:
            if post["id"] == post_id:
                if request.user_id in post["likes"]:
                    post["likes"].remove(request.user_id)
                    liked = False
                else:
                    post["likes"].append(request.user_id)
                    liked = True
                store._save()
                return {"liked": liked, "like_count": len(post["likes"])}
    raise HTTPException(status_code=404, detail="Post not found.")


@app.post("/posts/{post_id}/comments", status_code=status.HTTP_201_CREATED)
def add_comment(post_id: str, request: CommentCreateRequest):
    cleaned = _validate_body(request.body)
    with store._lock:
        for post in store._posts:
            if post["id"] == post_id:
                comment = {
                    "id": _new_id("CMT"),
                    "author_id": request.author_id,
                    "author_name": request.author_name,
                    "author_role": request.author_role,
                    "body": cleaned,
                    "created_at": _now(),
                }
                post["comments"].append(comment)
                store._save()
                return {"message": "Comment added.", "comment": comment}
    raise HTTPException(status_code=404, detail="Post not found.")


@app.delete("/posts/{post_id}/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_comment(post_id: str, comment_id: str, actor_id: str, actor_role: str):
    with store._lock:
        for post in store._posts:
            if post["id"] == post_id:
                for index, comment in enumerate(post["comments"]):
                    if comment["id"] == comment_id:
                        if comment["author_id"] != actor_id and actor_role != "Administrator":
                            raise HTTPException(status_code=403, detail="You can only delete your own comments.")
                        post["comments"].pop(index)
                        store._save()
                        return
                raise HTTPException(status_code=404, detail="Comment not found.")
    raise HTTPException(status_code=404, detail="Post not found.")


@app.post("/media/upload")
async def upload_media(file: UploadFile = File(...)):
    if not file.content_type:
        raise HTTPException(status_code=400, detail="File content type is required.")
    if file.content_type not in ALLOWED_IMAGE_TYPES and file.content_type not in ALLOWED_VIDEO_TYPES:
        raise HTTPException(status_code=400, detail="Only images and videos are allowed.")
    kind = "image" if file.content_type in ALLOWED_IMAGE_TYPES else "video"
    extension = Path(file.filename or "").suffix.lower() or {
        "image/jpeg": ".jpg", "image/png": ".png", "image/gif": ".gif", "image/webp": ".webp",
        "video/mp4": ".mp4", "video/webm": ".webm", "video/quicktime": ".mov",
    }.get(file.content_type, "")
    stored_name = f"{uuid.uuid4().hex}{extension}"
    destination = UPLOADS_DIR / stored_name
    total = 0
    with destination.open("wb") as out:
        while chunk := await file.read(1024 * 1024):
            total += len(chunk)
            if total > MAX_FILE_BYTES:
                out.close()
                destination.unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail=f"File exceeds the {MAX_FILE_BYTES // (1024 * 1024)} MB limit.")
            out.write(chunk)
    return {
        "url": f"/media/{stored_name}",
        "kind": kind,
        "mime_type": file.content_type,
        "filename": file.filename or stored_name,
        "size_bytes": total,
    }
