"""Pending signup verifications.

Holds signups in a quarantine zone until the user proves they control the
email address by entering the one-time code that was sent to it. Only then
does the API layer create the real account. Codes are stored salted+hashed,
expire after a short TTL, and allow only a handful of guesses.
"""
from __future__ import annotations

import hashlib
import hmac
import secrets
import time
from threading import RLock


class VerificationManager:
    CODE_TTL_SECONDS = 600      # codes live for 10 minutes
    MAX_CODE_ATTEMPTS = 5       # wrong guesses before the signup is voided

    def __init__(self) -> None:
        self._pending: dict[str, dict] = {}
        self._lock = RLock()

    @staticmethod
    def _hash_code(code: str, salt: str) -> str:
        return hashlib.pbkdf2_hmac("sha256", code.encode(), salt.encode(), 50_000).hex()

    @staticmethod
    def _new_code() -> str:
        return f"{secrets.randbelow(1_000_000):06d}"

    def _purge_expired(self) -> None:
        now = time.time()
        for email in [email for email, record in self._pending.items() if record["expires_at"] < now]:
            del self._pending[email]

    def start(self, email: str, payload: dict) -> str:
        """Register a pending signup and return the one-time code to deliver."""
        with self._lock:
            self._purge_expired()
            salt = secrets.token_hex(8)
            code = self._new_code()
            self._pending[email] = {
                "code_hash": self._hash_code(code, salt),
                "salt": salt,
                "payload": payload,
                "expires_at": time.time() + self.CODE_TTL_SECONDS,
                "attempts": 0,
            }
            return code

    def restart_code(self, email: str) -> str:
        """Issue a fresh code for an already-pending signup (resend flow)."""
        with self._lock:
            self._purge_expired()
            record = self._pending.get(email)
            if not record:
                raise ValueError("No pending verification for this email.")
            salt = secrets.token_hex(8)
            code = self._new_code()
            record.update(code_hash=self._hash_code(code, salt), salt=salt,
                          expires_at=time.time() + self.CODE_TTL_SECONDS, attempts=0)
            return code

    def confirm(self, email: str, code: str) -> dict:
        """Validate the code and return the stored signup payload on success."""
        with self._lock:
            self._purge_expired()
            record = self._pending.get(email)
            if not record:
                raise ValueError("No pending verification for this email. Please sign up first.")
            if record["attempts"] >= self.MAX_CODE_ATTEMPTS:
                del self._pending[email]
                raise ValueError("Too many incorrect codes. Please sign up again.")
            record["attempts"] += 1
            if not hmac.compare_digest(self._hash_code(code, record["salt"]), record["code_hash"]):
                raise ValueError("Incorrect verification code.")
            return record["payload"]

    def complete(self, email: str) -> None:
        """Drop the pending record once the account has been created."""
        with self._lock:
            self._pending.pop(email, None)

    def is_pending(self, email: str) -> bool:
        with self._lock:
            self._purge_expired()
            return email in self._pending
