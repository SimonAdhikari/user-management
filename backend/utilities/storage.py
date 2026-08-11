"""JSON persistence that keeps password hashes, never plaintext passwords."""
import json
import os
from pathlib import Path
from tempfile import NamedTemporaryFile


class JsonUserStorage:
    def __init__(self, file_path: str | Path) -> None:
        self.file_path = Path(file_path)

    def load(self) -> list[dict]:
        if not self.file_path.exists():
            return []
        with self.file_path.open("r", encoding="utf-8") as file:
            content = file.read().strip()
        return json.loads(content) if content else []

    def save(self, users: list) -> None:
        self.file_path.parent.mkdir(parents=True, exist_ok=True)
        # A temporary file and atomic replace prevent partial JSON after a crash.
        with NamedTemporaryFile("w", encoding="utf-8", dir=self.file_path.parent,
                                delete=False, prefix=".users-", suffix=".tmp") as file:
            json.dump([user.to_storage_dict() for user in users], file, indent=2)
            temp_name = file.name
        os.replace(temp_name, self.file_path)
