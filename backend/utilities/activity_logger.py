"""Thread-safe asynchronous activity logging."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from queue import Queue
from threading import Thread


class ActivityLogger:
    """Writes audit events in a daemon worker so UI/API requests are not blocked."""

    def __init__(self, log_file: str | Path) -> None:
        self.log_file = Path(log_file)
        self._queue: Queue[dict | None] = Queue()
        self._worker = Thread(target=self._write_events, daemon=True, name="activity-logger")
        self._worker.start()

    def log(self, action: str, user_id: str, details: str = "") -> None:
        self._queue.put({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "action": action,
            "user_id": user_id,
            "details": details,
        })

    def _write_events(self) -> None:
        while True:
            event = self._queue.get()
            try:
                if event is None:
                    return
                self.log_file.parent.mkdir(parents=True, exist_ok=True)
                with self.log_file.open("a", encoding="utf-8") as file:
                    file.write(json.dumps(event) + "\n")
            finally:
                self._queue.task_done()

    def flush(self) -> None:
        self._queue.join()
