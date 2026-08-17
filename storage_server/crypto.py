"""AES-256-GCM authenticated encryption for the storage server.

Self-contained copy of the backend cipher (the storage server is an
independent service). Encrypts post bodies, author names, and the whole
posts.json file so stolen files or database dumps are unreadable without
the bootstrap key.

Key resolution: SUMS_BOOTSTRAP_KEY env var, else backend/.env, else a
development fallback. AES-GCM gives confidentiality + integrity (tampered
records fail to decrypt).

Token format:  enc:v1:<base64url(12-byte nonce + ciphertext + 16-byte tag)>
Values without the prefix are legacy plaintext and pass through decrypt().
"""
from __future__ import annotations

import base64
import json
import os
from pathlib import Path

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

TOKEN_PREFIX = "enc:v1:"
_HKDF_SALT = b"social-hub-static-salt-v1"
_DEV_FALLBACK_KEY = "dev-insecure-bootstrap-key-change-me"


def load_bootstrap_key() -> bytes:
    """Resolve the master key: env var, then backend/.env, then dev fallback."""
    key = os.getenv("SUMS_BOOTSTRAP_KEY", "").strip()
    if not key:
        env_file = Path(__file__).resolve().parent.parent / "backend" / ".env"
        if env_file.exists():
            for line in env_file.read_text(encoding="utf-8").splitlines():
                if line.startswith("SUMS_BOOTSTRAP_KEY="):
                    key = line.split("=", 1)[1].strip()
                    break
    if not key:
        key = _DEV_FALLBACK_KEY
    return key.encode("utf-8")


class DataCipher:
    """Encrypts/decrypts strings for one specific storage purpose."""

    def __init__(self, purpose: str) -> None:
        material = HKDF(
            algorithm=hashes.SHA256(),
            length=32,
            salt=_HKDF_SALT,
            info=purpose.encode("utf-8"),
        ).derive(load_bootstrap_key())
        self._aes = AESGCM(material)

    def encrypt(self, plaintext: str | None) -> str | None:
        if plaintext is None or plaintext == "":
            return plaintext
        if not isinstance(plaintext, str):
            raise TypeError("Only strings can be encrypted.")
        nonce = os.urandom(12)
        sealed = self._aes.encrypt(nonce, plaintext.encode("utf-8"), None)
        return TOKEN_PREFIX + base64.urlsafe_b64encode(nonce + sealed).decode("ascii")

    def decrypt(self, token: str | None) -> str | None:
        if token is None or not isinstance(token, str) or not token.startswith(TOKEN_PREFIX):
            return token
        raw = base64.urlsafe_b64decode(token[len(TOKEN_PREFIX):].encode("ascii"))
        return self._aes.decrypt(raw[:12], raw[12:], None).decode("utf-8")

    @staticmethod
    def is_encrypted(value) -> bool:
        return isinstance(value, str) and value.startswith(TOKEN_PREFIX)

    def encrypt_json(self, obj) -> dict:
        return {"enc": "v1", "data": self.encrypt(json.dumps(obj))}

    def decrypt_json(self, payload):
        if isinstance(payload, dict) and payload.get("enc") == "v1":
            return json.loads(self.decrypt(payload["data"]))
        return payload
