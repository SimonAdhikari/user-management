"""MySQL connection layer for the storage server.

This module is the database access layer for posts, comments, likes,
reactions, shares, and media metadata. It mirrors the operations of the
JSON-backed ``_Store`` in ``storage.py`` so the server can be switched to
MySQL without changing any API route signatures.

The running server is NOT rewired yet — this layer is ready to be plugged
in when desired (see ``MySQLPostStore`` which exposes the same surface as
the JSON store helpers).

Configuration (environment variables, all optional):
    MYSQL_HOST      default 127.0.0.1
    MYSQL_PORT      default 3306
    MYSQL_USER      default social_hub
    MYSQL_PASSWORD  default social_hub_pass
    MYSQL_DATABASE  default social_hub

Requires:  pip install pymysql
"""
from __future__ import annotations

import json
import os
import secrets
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

import pymysql
from pymysql.cursors import DictCursor

from crypto import DataCipher

# Field-level cipher for sensitive content stored in MySQL. IDs, counts, and
# timestamps stay plaintext (they drive queries/indexes); bodies and author
# names are AES-256-GCM encrypted so a database dump is unreadable.
_field_cipher = DataCipher("mysql-fields")

DB_CONFIG = {
    "host": os.environ.get("MYSQL_HOST", "127.0.0.1"),
    "port": int(os.environ.get("MYSQL_PORT", "3306")),
    "user": os.environ.get("MYSQL_USER", "social_hub"),
    "password": os.environ.get("MYSQL_PASSWORD", "social_hub_pass"),
    "database": os.environ.get("MYSQL_DATABASE", "social_hub"),
    "charset": "utf8mb4",
    "autocommit": False,
}

ALLOWED_REACTIONS = {"like", "love", "haha", "wow", "sad", "angry"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(6).upper()}"


@contextmanager
def get_connection() -> Iterator[pymysql.connections.Connection]:
    """Yield a MySQL connection; commits on success, rolls back on error."""
    conn = pymysql.connect(cursorclass=DictCursor, **DB_CONFIG)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_schema() -> None:
    """Apply schema.sql to the configured server (idempotent)."""
    schema_path = Path(__file__).resolve().parent / "schema.sql"
    sql = schema_path.read_text(encoding="utf-8")
    # Connect without a database first so CREATE DATABASE can run.
    bootstrap = {k: v for k, v in DB_CONFIG.items() if k != "database"}
    conn = pymysql.connect(cursorclass=DictCursor, **bootstrap)
    try:
        with conn.cursor() as cursor:
            for statement in _split_statements(sql):
                cursor.execute(statement)
        conn.commit()
    finally:
        conn.close()


def _split_statements(sql: str) -> list[str]:
    """Split a .sql script on semicolons, ignoring comments and blanks."""
    # Strip comment lines FIRST so semicolons inside comments don't split.
    cleaned_lines = [ln for ln in sql.splitlines() if not ln.strip().startswith("--")]
    statements: list[str] = []
    for raw in "\n".join(cleaned_lines).split(";"):
        statement = raw.strip()
        if statement:
            statements.append(statement)
    return statements


class MySQLPostStore:
    """Repository exposing the same operations as the JSON store."""

    # ------------------------------------------------------------------ posts
    def create_post(self, author_id: str, author_name: str, author_role: str,
                    body: str, media: list[dict], repost_of_id: str | None = None) -> dict:
        post_id = _new_id("POST")
        with get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    "INSERT INTO posts (id, author_id, author_name, author_role, body, repost_of_id) "
                    "VALUES (%s, %s, %s, %s, %s, %s)",
                    (post_id, author_id, _field_cipher.encrypt(author_name), author_role,
                     _field_cipher.encrypt(body), repost_of_id),
                )
                for position, item in enumerate(media):
                    cursor.execute(
                        "INSERT INTO post_media (post_id, url, kind, mime_type, filename, position) "
                        "VALUES (%s, %s, %s, %s, %s, %s)",
                        (post_id, item["url"], item["kind"], item["mime_type"],
                         item.get("filename", ""), position),
                    )
        return self.get_post(post_id)

    def list_posts(self) -> list[dict]:
        with get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute("SELECT id FROM posts ORDER BY created_at DESC")
                return [self._assemble(cursor, row["id"]) for row in cursor.fetchall()]

    def list_user_posts(self, author_id: str) -> list[dict]:
        with get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    "SELECT id FROM posts WHERE author_id = %s ORDER BY created_at DESC",
                    (author_id,),
                )
                return [self._assemble(cursor, row["id"]) for row in cursor.fetchall()]

    def get_post(self, post_id: str) -> dict | None:
        with get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute("SELECT id FROM posts WHERE id = %s", (post_id,))
                if cursor.fetchone() is None:
                    return None
                return self._assemble(cursor, post_id)

    def delete_post(self, post_id: str, actor_id: str, actor_role: str) -> bool:
        with get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute("SELECT author_id FROM posts WHERE id = %s", (post_id,))
                row = cursor.fetchone()
                if row is None:
                    return False
                if row["author_id"] != actor_id and actor_role != "Administrator":
                    raise PermissionError("You can only delete your own posts.")
                cursor.execute("DELETE FROM posts WHERE id = %s", (post_id,))
        return True

    # ------------------------------------------------------------------ likes
    def toggle_like(self, post_id: str, user_id: str) -> dict:
        with get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute("SELECT 1 FROM posts WHERE id = %s", (post_id,))
                if cursor.fetchone() is None:
                    return None
                cursor.execute(
                    "SELECT 1 FROM post_likes WHERE post_id = %s AND user_id = %s",
                    (post_id, user_id),
                )
                if cursor.fetchone():
                    cursor.execute(
                        "DELETE FROM post_likes WHERE post_id = %s AND user_id = %s",
                        (post_id, user_id),
                    )
                    liked = False
                else:
                    cursor.execute(
                        "INSERT INTO post_likes (post_id, user_id) VALUES (%s, %s)",
                        (post_id, user_id),
                    )
                    liked = True
                cursor.execute("SELECT COUNT(*) AS n FROM post_likes WHERE post_id = %s", (post_id,))
                return {"liked": liked, "like_count": cursor.fetchone()["n"]}

    # -------------------------------------------------------------- reactions
    def react(self, post_id: str, user_id: str, reaction: str) -> dict | None:
        if reaction not in ALLOWED_REACTIONS:
            raise ValueError("Unknown reaction type.")
        with get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute("SELECT 1 FROM posts WHERE id = %s", (post_id,))
                if cursor.fetchone() is None:
                    return None
                cursor.execute(
                    "SELECT reaction FROM post_reactions WHERE post_id = %s AND user_id = %s",
                    (post_id, user_id),
                )
                existing = cursor.fetchone()
                my_reaction: str | None
                if existing and existing["reaction"] == reaction:
                    cursor.execute(
                        "DELETE FROM post_reactions WHERE post_id = %s AND user_id = %s",
                        (post_id, user_id),
                    )
                    my_reaction = None
                elif existing:
                    cursor.execute(
                        "UPDATE post_reactions SET reaction = %s WHERE post_id = %s AND user_id = %s",
                        (reaction, post_id, user_id),
                    )
                    my_reaction = reaction
                else:
                    cursor.execute(
                        "INSERT INTO post_reactions (post_id, user_id, reaction) VALUES (%s, %s, %s)",
                        (post_id, user_id, reaction),
                    )
                    my_reaction = reaction
                cursor.execute(
                    "SELECT reaction, COUNT(*) AS n FROM post_reactions "
                    "WHERE post_id = %s GROUP BY reaction", (post_id,),
                )
                summary = {kind: 0 for kind in ALLOWED_REACTIONS}
                for row in cursor.fetchall():
                    summary[row["reaction"]] = row["n"]
                cursor.execute("SELECT COUNT(*) AS n FROM post_likes WHERE post_id = %s", (post_id,))
                like_count = cursor.fetchone()["n"] + sum(summary.values())
                return {"my_reaction": my_reaction, "reactions": summary, "like_count": like_count}

    # ----------------------------------------------------------------- shares
    def share(self, post_id: str) -> dict | None:
        with get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    "UPDATE posts SET share_count = share_count + 1 WHERE id = %s", (post_id,),
                )
                if cursor.rowcount == 0:
                    return None
                cursor.execute("SELECT share_count FROM posts WHERE id = %s", (post_id,))
                return {"share_count": cursor.fetchone()["share_count"]}

    # --------------------------------------------------------------- comments
    def add_comment(self, post_id: str, author_id: str, author_name: str,
                    author_role: str, body: str, parent_id: str | None = None) -> dict:
        comment_id = _new_id("CMT")
        with get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute("SELECT 1 FROM posts WHERE id = %s", (post_id,))
                if cursor.fetchone() is None:
                    raise LookupError("Post not found.")
                if parent_id:
                    cursor.execute("SELECT 1 FROM comments WHERE id = %s", (parent_id,))
                    if cursor.fetchone() is None:
                        raise LookupError("Parent comment not found.")
                cursor.execute(
                    "INSERT INTO comments (id, post_id, parent_id, author_id, author_name, "
                    "author_role, body) VALUES (%s, %s, %s, %s, %s, %s, %s)",
                    (comment_id, post_id, parent_id, author_id,
                     _field_cipher.encrypt(author_name), author_role,
                     _field_cipher.encrypt(body)),
                )
        return self.get_comment(comment_id)

    def get_comment(self, comment_id: str) -> dict | None:
        with get_connection() as conn:
            with conn.cursor() as cursor:
                return self._assemble_comment(cursor, comment_id)

    def toggle_comment_like(self, comment_id: str, user_id: str) -> dict | None:
        with get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute("SELECT 1 FROM comments WHERE id = %s", (comment_id,))
                if cursor.fetchone() is None:
                    return None
                cursor.execute(
                    "SELECT 1 FROM comment_likes WHERE comment_id = %s AND user_id = %s",
                    (comment_id, user_id),
                )
                if cursor.fetchone():
                    cursor.execute(
                        "DELETE FROM comment_likes WHERE comment_id = %s AND user_id = %s",
                        (comment_id, user_id),
                    )
                    liked = False
                else:
                    cursor.execute(
                        "INSERT INTO comment_likes (comment_id, user_id) VALUES (%s, %s)",
                        (comment_id, user_id),
                    )
                    liked = True
                cursor.execute(
                    "SELECT COUNT(*) AS n FROM comment_likes WHERE comment_id = %s", (comment_id,),
                )
                return {"liked": liked, "like_count": cursor.fetchone()["n"]}

    def edit_comment(self, comment_id: str, body: str, actor_id: str, actor_role: str) -> dict:
        with get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute("SELECT author_id FROM comments WHERE id = %s", (comment_id,))
                row = cursor.fetchone()
                if row is None:
                    raise LookupError("Comment not found.")
                if row["author_id"] != actor_id and actor_role != "Administrator":
                    raise PermissionError("You can only edit your own comments.")
                cursor.execute(
                    "UPDATE comments SET body = %s, edited = 1 WHERE id = %s",
                    (_field_cipher.encrypt(body), comment_id),
                )
        return self.get_comment(comment_id)

    def delete_comment(self, comment_id: str, actor_id: str, actor_role: str) -> bool:
        with get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute("SELECT author_id FROM comments WHERE id = %s", (comment_id,))
                row = cursor.fetchone()
                if row is None:
                    return False
                if row["author_id"] != actor_id and actor_role != "Administrator":
                    raise PermissionError("You can only delete your own comments.")
                cursor.execute("DELETE FROM comments WHERE id = %s", (comment_id,))
        return True

    # ------------------------------------------------------------------ media
    def record_media_file(self, stored_name: str, original_name: str, kind: str,
                          mime_type: str, size_bytes: int) -> None:
        with get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    "INSERT INTO media_files (stored_name, original_name, kind, mime_type, size_bytes) "
                    "VALUES (%s, %s, %s, %s, %s)",
                    (stored_name, original_name, kind, mime_type, size_bytes),
                )

    # -------------------------------------------------------------- assembly
    def _assemble(self, cursor, post_id: str) -> dict:
        """Build the full public post view (same shape as storage._public_view)."""
        cursor.execute("SELECT * FROM posts WHERE id = %s", (post_id,))
        post = cursor.fetchone()
        cursor.execute(
            "SELECT url, kind, mime_type, filename FROM post_media "
            "WHERE post_id = %s ORDER BY position", (post_id,),
        )
        media = [dict(row) for row in cursor.fetchall()]
        cursor.execute("SELECT user_id FROM post_likes WHERE post_id = %s", (post_id,))
        likes = [row["user_id"] for row in cursor.fetchall()]
        cursor.execute(
            "SELECT reaction, COUNT(*) AS n FROM post_reactions "
            "WHERE post_id = %s GROUP BY reaction", (post_id,),
        )
        reactions = {kind: 0 for kind in ALLOWED_REACTIONS}
        for row in cursor.fetchall():
            reactions[row["reaction"]] = row["n"]
        cursor.execute(
            "SELECT id FROM comments WHERE post_id = %s ORDER BY created_at", (post_id,),
        )
        comments = [self._assemble_comment(cursor, row["id"]) for row in cursor.fetchall()]
        repost_of = None
        if post["repost_of_id"]:
            cursor.execute("SELECT id FROM posts WHERE id = %s", (post["repost_of_id"],))
            if cursor.fetchone():
                repost_of = self._repost_snapshot(cursor, post["repost_of_id"])
        return {
            "id": post["id"],
            "author_id": post["author_id"],
            "author_name": _field_cipher.decrypt(post["author_name"]),
            "author_role": post["author_role"],
            "body": _field_cipher.decrypt(post["body"]),
            "media": media,
            "created_at": post["created_at"].astimezone(timezone.utc).isoformat(),
            "like_count": len(likes),
            "likes": likes,
            "reactions": reactions,
            "my_reaction": None,
            "share_count": post["share_count"],
            "comment_count": len(comments),
            "repost_of": repost_of,
            "comments": comments,
        }

    def _assemble_comment(self, cursor, comment_id: str) -> dict | None:
        cursor.execute("SELECT * FROM comments WHERE id = %s", (comment_id,))
        comment = cursor.fetchone()
        if comment is None:
            return None
        cursor.execute("SELECT user_id FROM comment_likes WHERE comment_id = %s", (comment_id,))
        likes = [row["user_id"] for row in cursor.fetchall()]
        return {
            "id": comment["id"],
            "author_id": comment["author_id"],
            "author_name": _field_cipher.decrypt(comment["author_name"]),
            "author_role": comment["author_role"],
            "body": _field_cipher.decrypt(comment["body"]),
            "created_at": comment["created_at"].astimezone(timezone.utc).isoformat(),
            "parent_id": comment["parent_id"],
            "likes": likes,
            "like_count": len(likes),
            "edited": bool(comment["edited"]),
        }

    def _repost_snapshot(self, cursor, post_id: str) -> dict:
        cursor.execute("SELECT * FROM posts WHERE id = %s", (post_id,))
        post = cursor.fetchone()
        cursor.execute(
            "SELECT url, kind, mime_type, filename FROM post_media "
            "WHERE post_id = %s ORDER BY position", (post_id,),
        )
        media = [dict(row) for row in cursor.fetchall()]
        cursor.execute("SELECT COUNT(*) AS n FROM post_likes WHERE post_id = %s", (post_id,))
        like_count = cursor.fetchone()["n"]
        cursor.execute("SELECT COUNT(*) AS n FROM comments WHERE post_id = %s", (post_id,))
        comment_count = cursor.fetchone()["n"]
        return {
            "id": post["id"],
            "author_id": post["author_id"],
            "author_name": _field_cipher.decrypt(post["author_name"]),
            "author_role": post["author_role"],
            "body": _field_cipher.decrypt(post["body"]),
            "media": media,
            "created_at": post["created_at"].astimezone(timezone.utc).isoformat(),
            "like_count": like_count,
            "comment_count": comment_count,
        }


def migrate_from_json(json_path: Path | str) -> int:
    """One-time migration: import posts.json into MySQL. Returns post count.

    Handles both legacy plaintext files and the new AES-encrypted format.
    Sensitive fields are re-encrypted with the MySQL field cipher on insert.
    """
    json_path = Path(json_path)
    if not json_path.exists():
        return 0
    payload = json.loads(json_path.read_text(encoding="utf-8") or "[]")
    # posts.json may be wrapped by the storage-server file cipher.
    posts = DataCipher("storage-server-posts").decrypt_json(payload)
    store = MySQLPostStore()
    imported = 0
    # Insert originals first so repost FKs resolve.
    ordered = sorted(posts, key=lambda p: bool(p.get("repost_of")))
    for post in ordered:
        if store.get_post(post["id"]):
            continue
        with get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    "INSERT INTO posts (id, author_id, author_name, author_role, body, "
                    "share_count, repost_of_id, created_at) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",
                    (post["id"], post["author_id"],
                     _field_cipher.encrypt(post["author_name"]), post["author_role"],
                     _field_cipher.encrypt(post["body"]), post.get("shares", 0),
                     (post.get("repost_of") or {}).get("id"), post["created_at"]),
                )
                for position, item in enumerate(post.get("media", [])):
                    cursor.execute(
                        "INSERT INTO post_media (post_id, url, kind, mime_type, filename, position) "
                        "VALUES (%s,%s,%s,%s,%s,%s)",
                        (post["id"], item["url"], item["kind"], item["mime_type"],
                         item.get("filename", ""), position),
                    )
                for user_id in post.get("likes", []):
                    cursor.execute(
                        "INSERT IGNORE INTO post_likes (post_id, user_id) VALUES (%s,%s)",
                        (post["id"], user_id),
                    )
                for reaction in post.get("reactions", []):
                    cursor.execute(
                        "INSERT INTO post_reactions (post_id, user_id, reaction) VALUES (%s,%s,%s) "
                        "ON DUPLICATE KEY UPDATE reaction = VALUES(reaction)",
                        (post["id"], reaction["user_id"], reaction["type"]),
                    )
                for comment in post.get("comments", []):
                    cursor.execute(
                        "INSERT INTO comments (id, post_id, parent_id, author_id, author_name, "
                        "author_role, body, edited, created_at) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                        (comment["id"], post["id"], comment.get("parent_id"),
                         comment["author_id"], _field_cipher.encrypt(comment["author_name"]),
                         comment["author_role"], _field_cipher.encrypt(comment["body"]),
                         int(comment.get("edited", False)), comment["created_at"]),
                    )
                    for user_id in comment.get("likes", []):
                        cursor.execute(
                            "INSERT IGNORE INTO comment_likes (comment_id, user_id) VALUES (%s,%s)",
                            (comment["id"], user_id),
                        )
        imported += 1
    return imported


if __name__ == "__main__":
    import sys

    action = sys.argv[1] if len(sys.argv) > 1 else "init"
    if action == "init":
        init_schema()
        print("Schema applied to database:", DB_CONFIG["database"])
    elif action == "migrate":
        source = Path(__file__).resolve().parent / "data" / "posts.json"
        count = migrate_from_json(source)
        print(f"Migrated {count} posts from {source}")
    else:
        print("Usage: python database.py [init|migrate]")
