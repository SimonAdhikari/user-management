"""JSON persistence that keeps password hashes, never plaintext passwords.

The whole file is wrapped with AES-256-GCM so a stolen users.json is
unreadable without the bootstrap key. Legacy plaintext files are read
transparently and re-encrypted on the next save (automatic migration).
"""
import json
import os
from pathlib import Path
from tempfile import NamedTemporaryFile

from utilities.crypto import DataCipher


class JsonUserStorage:
    def __init__(self, file_path: str | Path) -> None:
        self.file_path = Path(file_path)
        self._cipher = DataCipher("users-store")

    def load(self) -> list[dict]:
        if not self.file_path.exists():
            return []
        with self.file_path.open("r", encoding="utf-8") as file:
            content = file.read().strip()
        if not content:
            return []
        payload = json.loads(content)
        # decrypt_json passes legacy plaintext lists through unchanged.
        return self._cipher.decrypt_json(payload)

    def save(self, users: list) -> None:
        self.file_path.parent.mkdir(parents=True, exist_ok=True)
        payload = self._cipher.encrypt_json([user.to_storage_dict() for user in users])
        # A temporary file and atomic replace prevent partial JSON after a crash.
        with NamedTemporaryFile("w", encoding="utf-8", dir=self.file_path.parent,
                                delete=False, prefix=".users-", suffix=".tmp") as file:
            json.dump(payload, file, indent=2)
            temp_name = file.name
        os.replace(temp_name, self.file_path)
