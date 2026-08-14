"""Run the backend test suite without starting the FastAPI server.

Usage from the repository root:
    python backend/run_offline_tests.py
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parent


def main() -> int:
    """Discover and run service-layer tests entirely in-process."""
    # The application uses imports such as ``from services import UserManager``.
    # Keeping this directory on sys.path lets discovery work from any location.
    sys.path.insert(0, str(BACKEND_DIR))
    suite = unittest.defaultTestLoader.discover(str(BACKEND_DIR), pattern="test_*.py")
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    raise SystemExit(main())
