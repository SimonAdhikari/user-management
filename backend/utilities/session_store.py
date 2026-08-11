"""Short-lived opaque session tokens. Only token digests are retained server-side."""
from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from threading import Lock


class SessionStore:
    def __init__(self, lifetime_minutes: int = 30) -> None:
        self._lifetime = timedelta(minutes=lifetime_minutes)
        self._sessions: dict[str, tuple[str, datetime]] = {}
        self._lock = Lock()

    @staticmethod
    def _digest(token: str) -> str:
        return hashlib.sha256(token.encode("utf-8")).hexdigest()

    def issue(self, user_id: str) -> tuple[str, datetime]:
        token = secrets.token_urlsafe(32)
        expires = datetime.now(timezone.utc) + self._lifetime
        with self._lock:
            self._sessions[self._digest(token)] = (user_id, expires)
        return token, expires

    def resolve(self, token: str) -> str | None:
        with self._lock:
            record = self._sessions.get(self._digest(token))
            if not record:
                return None
            user_id, expires = record
            if datetime.now(timezone.utc) >= expires:
                self._sessions.pop(self._digest(token), None)
                return None
            return user_id

    def revoke(self, token: str) -> None:
        with self._lock:
            self._sessions.pop(self._digest(token), None)
