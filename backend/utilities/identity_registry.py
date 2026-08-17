"""Identity registry ("notepad") for re-identifying known users.

Each line is a pipe-delimited record:
    user_id | name | email | role | kyc_status | created_at
The name and email fields are AES-256-GCM encrypted so the file never
holds readable PII at rest. Legacy plaintext lines are read transparently
and re-encrypted on the next write. Passwords are never stored here.
"""
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock

from utilities.crypto import DataCipher


class IdentityRegistry:
    HEADER = "# user_id | name | email | role | kyc_status | created_at"

    def __init__(self, file_path: str | Path) -> None:
        self.file_path = Path(file_path)
        self._lock = RLock()
        self._cipher = DataCipher("identity-registry")

    def _ensure_file(self) -> None:
        self.file_path.parent.mkdir(parents=True, exist_ok=True)
        if not self.file_path.exists():
            self.file_path.write_text(self.HEADER + "\n", encoding="utf-8")

    def _parse_line(self, line: str) -> list[str] | None:
        parts = [p.strip() for p in line.split("|")]
        if len(parts) != 6 or line.startswith("#"):
            return None
        # Decrypt PII fields; legacy plaintext passes through unchanged.
        parts[1] = self._cipher.decrypt(parts[1])
        parts[2] = self._cipher.decrypt(parts[2])
        return parts

    def record(self, user) -> None:
        """Add or refresh a user's line so future terms can identify them again."""
        with self._lock:
            self._ensure_file()
            existing = []
            for line in self.file_path.read_text(encoding="utf-8").splitlines():
                if not line.strip() or line.startswith("#"):
                    continue
                parts = self._parse_line(line)
                if parts and parts[0] != user.user_id:
                    existing.append(parts)
            created = datetime.now(timezone.utc).isoformat(timespec="seconds")
            kyc = getattr(user, "kyc_status", "unverified")
            existing.append([user.user_id, user.name, user.email, user.role, kyc, created])
            lines = [
                f"{p[0]} | {self._cipher.encrypt(p[1])} | {self._cipher.encrypt(p[2])} | {p[3]} | {p[4]} | {p[5]}"
                for p in existing
            ]
            self.file_path.write_text(self.HEADER + "\n" + "\n".join(lines) + "\n", encoding="utf-8")

    def lookup(self, user_id: str) -> dict | None:
        """Find a previously recorded identity by user ID."""
        if not self.file_path.exists():
            return None
        for line in self.file_path.read_text(encoding="utf-8").splitlines():
            parts = self._parse_line(line)
            if parts and parts[0] == user_id:
                return {"user_id": parts[0], "name": parts[1], "email": parts[2],
                        "role": parts[3], "kyc_status": parts[4], "created_at": parts[5]}
        return None

    def all(self) -> list[dict]:
        if not self.file_path.exists():
            return []
        records = []
        for line in self.file_path.read_text(encoding="utf-8").splitlines():
            parts = self._parse_line(line)
            if parts:
                records.append({"user_id": parts[0], "name": parts[1], "email": parts[2],
                                "role": parts[3], "kyc_status": parts[4], "created_at": parts[5]})
        return records
