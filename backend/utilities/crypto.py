"""AES-256-GCM authenticated encryption for data at rest.

Every sensitive value stored on disk (user records, identity registry,
post bodies) is wrapped with this cipher so that stealing the raw data
files or a database dump reveals nothing without the bootstrap key.

Key handling:
  * The master key comes from the SUMS_BOOTSTRAP_KEY environment variable
    (loaded from backend/.env when present).
  * Per-purpose AES-256 keys are derived with HKDF-SHA256, so compromising
    one store does not expose the others.
  * AES-GCM provides confidentiality AND integrity: tampered records fail
    to decrypt instead of silently loading corrupted data.

Token format:  enc:v1:<base64url(12-byte nonce + ciphertext + 16-byte tag)>
Values without the prefix are treated as legacy plaintext, which makes the
encryption rollout migration-friendly (decrypt() passes them through).
"""
from __future__ import annotations

import base64
import json
import os

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

TOKEN_PREFIX = "enc:v1:"
_HKDF_SALT = b"social-hub-static-salt-v1"
# Development fallback only. Production refuses to start without a real
# SUMS_BOOTSTRAP_KEY (enforced in config.Settings.load).
_DEV_FALLBACK_KEY = "dev-insecure-bootstrap-key-change-me"


def load_bootstrap_key() -> bytes:
    """Resolve the master key from the environment (or backend/.env)."""
    key = os.getenv("SUMS_BOOTSTRAP_KEY", "").strip()
    if not key:
        try:
            from dotenv import load_dotenv
            load_dotenv()
        except Exception:
            pass
        key = os.getenv("SUMS_BOOTSTRAP_KEY", "").strip()
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
        """Encrypt a string into an ``enc:v1:`` token. None passes through."""
        if plaintext is None or plaintext == "":
            return plaintext
        if not isinstance(plaintext, str):
            raise TypeError("Only strings can be encrypted.")
        nonce = os.urandom(12)
        sealed = self._aes.encrypt(nonce, plaintext.encode("utf-8"), None)
        return TOKEN_PREFIX + base64.urlsafe_b64encode(nonce + sealed).decode("ascii")

    def decrypt(self, token: str | None) -> str | None:
        """Decrypt a token; legacy plaintext values pass through unchanged."""
        if token is None or not isinstance(token, str) or not token.startswith(TOKEN_PREFIX):
            return token
        raw = base64.urlsafe_b64decode(token[len(TOKEN_PREFIX):].encode("ascii"))
        return self._aes.decrypt(raw[:12], raw[12:], None).decode("utf-8")

    @staticmethod
    def is_encrypted(value) -> bool:
        return isinstance(value, str) and value.startswith(TOKEN_PREFIX)

    def encrypt_json(self, obj) -> dict:
        """Wrap a whole JSON-serialisable object for file-level encryption."""
        return {"enc": "v1", "data": self.encrypt(json.dumps(obj))}

    def decrypt_json(self, payload):
        """Unwrap file-level encryption; legacy plain lists pass through."""
        if isinstance(payload, dict) and payload.get("enc") == "v1":
            return json.loads(self.decrypt(payload["data"]))
        return payload
