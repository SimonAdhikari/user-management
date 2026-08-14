"""Plain-text identity registry ("notepad") for re-identifying known users.

Each line is a pipe-delimited record:
    user_id | name | email | role | kyc_status | created_at
The file is append-friendly and human-readable; it never stores passwords.
"""
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock


class IdentityRegistry:
    HEADER = "# user_id | name | email | role | kyc_status | created_at"

    def __init__(self, file_path: str | Path) -> None:
        self.file_path = Path(file_path)
        self._lock = RLock()

    def _ensure_file(self) -> None:
        self.file_path.parent.mkdir(parents=True, exist_ok=True)
        if not self.file_path.exists():
            self.file_path.write_text(self.HEADER + "\n", encoding="utf-8")

    def record(self, user) -> None:
        """Add or refresh a user's line so future terms can identify them again."""
        with self._lock:
            self._ensure_file()
            lines = [l for l in self.file_path.read_text(encoding="utf-8").splitlines()
                     if l.strip() and not l.startswith("#") and not l.startswith(user.user_id + " |")]
            created = datetime.now(timezone.utc).isoformat(timespec="seconds")
            kyc = getattr(user, "kyc_status", "unverified")
            lines.append(f"{user.user_id} | {user.name} | {user.email} | {user.role} | {kyc} | {created}")
            self.file_path.write_text(self.HEADER + "\n" + "\n".join(lines) + "\n", encoding="utf-8")

    def lookup(self, user_id: str) -> dict | None:
        """Find a previously recorded identity by user ID."""
        if not self.file_path.exists():
            return None
        for line in self.file_path.read_text(encoding="utf-8").splitlines():
            parts = [p.strip() for p in line.split("|")]
            if len(parts) == 6 and parts[0] == user_id:
                return {"user_id": parts[0], "name": parts[1], "email": parts[2],
                        "role": parts[3], "kyc_status": parts[4], "created_at": parts[5]}
        return None

    def all(self) -> list[dict]:
        if not self.file_path.exists():
            return []
        records = []
        for line in self.file_path.read_text(encoding="utf-8").splitlines():
            parts = [p.strip() for p in line.split("|")]
            if len(parts) == 6 and not line.startswith("#"):
                records.append({"user_id": parts[0], "name": parts[1], "email": parts[2],
                                "role": parts[3], "kyc_status": parts[4], "created_at": parts[5]})
        return records
