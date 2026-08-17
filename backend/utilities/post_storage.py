"""JSON persistence for posts, comments, and likes.

The file is wrapped with AES-256-GCM so stolen post data is unreadable
without the bootstrap key. Legacy plaintext files pass through on load
and are re-encrypted on the next save.
"""
import json
import os
from pathlib import Path
from tempfile import NamedTemporaryFile

from utilities.crypto import DataCipher


class JsonPostStorage:
    def __init__(self, file_path: str | Path) -> None:
        self.file_path = Path(file_path)
        self._cipher = DataCipher("posts-store")

    def load(self) -> list[dict]:
        if not self.file_path.exists():
            return []
        with self.file_path.open("r", encoding="utf-8") as file:
            content = file.read().strip()
        if not content:
            return []
        return self._cipher.decrypt_json(json.loads(content))

    def save(self, posts: list[dict]) -> None:
        self.file_path.parent.mkdir(parents=True, exist_ok=True)
        payload = self._cipher.encrypt_json(posts)
        with NamedTemporaryFile("w", encoding="utf-8", dir=self.file_path.parent,
                                delete=False, prefix=".posts-", suffix=".tmp") as file:
            json.dump(payload, file, indent=2)
            temp_name = file.name
        os.replace(temp_name, self.file_path)
