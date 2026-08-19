"""Short-lived opaque session tokens. Only token digests are retained server-side.

Sessions are optionally persisted to a JSON file so they survive server
restarts (e.g. uvicorn --reload restarting the process when data files
change). Without a storage path the store is purely in-memory.
"""
from __future__ import annotations

import hashlib
import json
import os
import secrets
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from threading import Lock


class SessionStore:
    def __init__(self, lifetime_minutes: int = 30, storage_path: Path | str | None = None) -> None:
        self._lifetime = timedelta(minutes=lifetime_minutes)
        self._storage_path = Path(storage_path) if storage_path else None
        self._sessions: dict[str, tuple[str, datetime]] = {}
        self._lock = Lock()
        if self._storage_path:
            self._load()

    @staticmethod
    def _digest(token: str) -> str:
        return hashlib.sha256(token.encode("utf-8")).hexdigest()

    # ------------------------------------------------------------------
    # Persistence (best-effort; failures fall back to in-memory behaviour)
    # ------------------------------------------------------------------
    def _load(self) -> None:
        try:
            raw = json.loads(self._storage_path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return
        now = datetime.now(timezone.utc)
        for digest, record in raw.items():
            if not isinstance(record, dict) or not isinstance(record.get("user_id"), str):
                continue
            try:
                expires = datetime.fromisoformat(record["expires"])
            except (KeyError, TypeError, ValueError):
                continue
            if expires > now:
                self._sessions[digest] = (record["user_id"], expires)

    def _save(self) -> None:
        if not self._storage_path:
            return
        payload = {
            digest: {"user_id": user_id, "expires": expires.isoformat()}
            for digest, (user_id, expires) in self._sessions.items()
        }
        try:
            self._storage_path.parent.mkdir(parents=True, exist_ok=True)
            fd, tmp = tempfile.mkstemp(dir=str(self._storage_path.parent), suffix=".tmp")
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                json.dump(payload, handle)
            os.replace(tmp, self._storage_path)
        except OSError:
            pass

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def issue(self, user_id: str) -> tuple[str, datetime]:
        token = secrets.token_urlsafe(32)
        expires = datetime.now(timezone.utc) + self._lifetime
        with self._lock:
            self._sessions[self._digest(token)] = (user_id, expires)
            self._save()
        return token, expires

    def resolve(self, token: str) -> str | None:
        with self._lock:
            digest = self._digest(token)
            record = self._sessions.get(digest)
            if not record:
                return None
            user_id, expires = record
            if datetime.now(timezone.utc) >= expires:
                self._sessions.pop(digest, None)
                self._save()
                return None
            return user_id

    def revoke(self, token: str) -> None:
        with self._lock:
            if self._sessions.pop(self._digest(token), None) is not None:
                self._save()
