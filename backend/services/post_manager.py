"""Application service for posts, comments, and likes."""
from __future__ import annotations

import re
import secrets
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock

from exceptions import PostNotFoundError, UserManagementError
from utilities import ActivityLogger, JsonPostStorage


class PostManager:
    """Coordinates post creation, media metadata, comments, and likes."""

    MAX_BODY_LENGTH = 10000
    MAX_MEDIA_PER_POST = 4
    ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}
    ALLOWED_VIDEO_TYPES = {"video/mp4", "video/webm", "video/quicktime"}
    MAX_FILE_BYTES = 25 * 1024 * 1024  # 25 MB per file

    def __init__(self, posts_file: str | Path, activity_logger: ActivityLogger) -> None:
        self.storage = JsonPostStorage(posts_file)
        self.logger = activity_logger
        self._posts: list[dict] = []
        self._lock = RLock()
        self.load()

    def load(self) -> None:
        with self._lock:
            self._posts = self.storage.load()

    def _save(self) -> None:
        self.storage.save(self._posts)

    @staticmethod
    def _new_id() -> str:
        return f"POST_{secrets.token_hex(6).upper()}"

    @staticmethod
    def _new_comment_id() -> str:
        return f"CMT_{secrets.token_hex(5).upper()}"

    @staticmethod
    def _now() -> str:
        return datetime.now(timezone.utc).isoformat()

    @staticmethod
    def _validate_body(body: str) -> str:
        cleaned = (body or "").strip()
        if not cleaned:
            raise UserManagementError("Post content cannot be empty.")
        if len(cleaned) > PostManager.MAX_BODY_LENGTH:
            raise UserManagementError(f"Post content cannot exceed {PostManager.MAX_BODY_LENGTH} characters.")
        return cleaned

    @staticmethod
    def _validate_media(media: list[dict]) -> list[dict]:
        if not media:
            return []
        if len(media) > PostManager.MAX_MEDIA_PER_POST:
            raise UserManagementError(f"A post can include at most {PostManager.MAX_MEDIA_PER_POST} media files.")
        cleaned: list[dict] = []
        for item in media:
            if not isinstance(item, dict):
                raise UserManagementError("Invalid media entry.")
            url = str(item.get("url", "")).strip()
            kind = str(item.get("kind", "")).strip()
            mime = str(item.get("mime_type", "")).strip()
            if not url or not kind or not mime:
                raise UserManagementError("Media entries must include url, kind, and mime_type.")
            if kind not in {"image", "video"}:
                raise UserManagementError("Media kind must be image or video.")
            if kind == "image" and mime not in PostManager.ALLOWED_IMAGE_TYPES:
                raise UserManagementError(f"Unsupported image type: {mime}")
            if kind == "video" and mime not in PostManager.ALLOWED_VIDEO_TYPES:
                raise UserManagementError(f"Unsupported video type: {mime}")
            cleaned.append({"url": url, "kind": kind, "mime_type": mime, "filename": str(item.get("filename", ""))})
        return cleaned

    def create_post(self, author_id: str, author_name: str, author_role: str, body: str, media: list[dict] | None = None, repost_of: str | None = None) -> dict:
        cleaned_body = self._validate_body(body)
        cleaned_media = self._validate_media(media or [])
        repost_ref = None
        if repost_of:
            with self._lock:
                for existing in self._posts:
                    if existing["id"] == repost_of:
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
                raise UserManagementError("Original post not found.")
        with self._lock:
            post = {
                "id": self._new_id(),
                "author_id": author_id,
                "author_name": author_name,
                "author_role": author_role,
                "body": cleaned_body,
                "media": cleaned_media,
                "created_at": self._now(),
                "likes": [],
                "comments": [],
                "repost_of": repost_ref,
            }
            self._posts.insert(0, post)
            self._save()
            self.logger.log("POST_CREATED", author_id, f"post_id={post['id']}" + (f" repost_of={repost_of}" if repost_of else ""))
            return post

    def list_posts(self) -> list[dict]:
        with self._lock:
            return [self._public_view(post) for post in self._posts]

    def list_posts_by_author(self, author_id: str) -> list[dict]:
        with self._lock:
            return [self._public_view(post) for post in self._posts if post["author_id"] == author_id]

    def get_post(self, post_id: str) -> dict:
        with self._lock:
            for post in self._posts:
                if post["id"] == post_id:
                    return self._public_view(post)
        raise PostNotFoundError("Post not found.")

    def delete_post(self, post_id: str, actor_id: str, actor_role: str) -> None:
        with self._lock:
            for index, post in enumerate(self._posts):
                if post["id"] == post_id:
                    if post["author_id"] != actor_id and actor_role != "Administrator":
                        raise UserManagementError("You can only delete your own posts.")
                    self._posts.pop(index)
                    self._save()
                    self.logger.log("POST_DELETED", actor_id, f"post_id={post_id}")
                    return
        raise PostNotFoundError("Post not found.")

    def toggle_like(self, post_id: str, user_id: str) -> dict:
        with self._lock:
            for post in self._posts:
                if post["id"] == post_id:
                    if user_id in post["likes"]:
                        post["likes"].remove(user_id)
                        liked = False
                    else:
                        post["likes"].append(user_id)
                        liked = True
                    self._save()
                    self.logger.log("POST_LIKED" if liked else "POST_UNLIKED", user_id, f"post_id={post_id}")
                    return {"liked": liked, "like_count": len(post["likes"])}
        raise PostNotFoundError("Post not found.")

    def add_comment(self, post_id: str, author_id: str, author_name: str, author_role: str, body: str) -> dict:
        cleaned = self._validate_body(body)
        with self._lock:
            for post in self._posts:
                if post["id"] == post_id:
                    comment = {
                        "id": self._new_comment_id(),
                        "author_id": author_id,
                        "author_name": author_name,
                        "author_role": author_role,
                        "body": cleaned,
                        "created_at": self._now(),
                    }
                    post["comments"].append(comment)
                    self._save()
                    self.logger.log("COMMENT_ADDED", author_id, f"post_id={post_id}")
                    return comment
        raise PostNotFoundError("Post not found.")

    def delete_comment(self, post_id: str, comment_id: str, actor_id: str, actor_role: str) -> None:
        with self._lock:
            for post in self._posts:
                if post["id"] == post_id:
                    for index, comment in enumerate(post["comments"]):
                        if comment["id"] == comment_id:
                            if comment["author_id"] != actor_id and actor_role != "Administrator":
                                raise UserManagementError("You can only delete your own comments.")
                            post["comments"].pop(index)
                            self._save()
                            self.logger.log("COMMENT_DELETED", actor_id, f"post_id={post_id}")
                            return
                    raise PostNotFoundError("Comment not found.")
        raise PostNotFoundError("Post not found.")

    @staticmethod
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
