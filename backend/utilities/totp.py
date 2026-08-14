"""Time-based One-Time Password (TOTP, RFC 6238) helpers for 2FA.

Compatible with standard authenticator apps (Google Authenticator, Authy, etc.).
Secrets are base32-encoded; only the secret is stored, never shared codes.
"""
import base64
import hashlib
import hmac
import secrets
import struct
import time
import urllib.parse


class TotpService:
    ISSUER = "Cyber Portal"
    PERIOD = 30          # seconds per code window
    DIGITS = 6
    _WINDOW = 1          # accept codes one step before/after for clock drift

    @staticmethod
    def generate_secret() -> str:
        """Create a new base32 secret for enrolment."""
        return base64.b32encode(secrets.token_bytes(20)).decode("ascii").rstrip("=")

    @staticmethod
    def _key(secret: str) -> bytes:
        padding = "=" * (-len(secret) % 8)
        return base64.b32decode((secret + padding).upper())

    @classmethod
    def _code_at(cls, secret: str, counter: int) -> str:
        digest = hmac.new(cls._key(secret), struct.pack(">Q", counter), hashlib.sha1).digest()
        offset = digest[-1] & 0x0F
        value = struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF
        return str(value % (10 ** cls.DIGITS)).zfill(cls.DIGITS)

    @classmethod
    def current_code(cls, secret: str) -> str:
        return cls._code_at(secret, int(time.time()) // cls.PERIOD)

    @classmethod
    def verify(cls, secret: str, code: str) -> bool:
        """Check a user-supplied code, tolerating small clock drift."""
        if not code or not code.isdigit():
            return False
        counter = int(time.time()) // cls.PERIOD
        for step in range(-cls._WINDOW, cls._WINDOW + 1):
            if hmac.compare_digest(cls._code_at(secret, counter + step), code.strip()):
                return True
        return False

    @classmethod
    def provisioning_uri(cls, secret: str, account: str) -> str:
        """otpauth:// URI for QR-code enrolment in authenticator apps."""
        label = urllib.parse.quote(f"{cls.ISSUER}:{account}")
        return (f"otpauth://totp/{label}?secret={secret}&issuer={urllib.parse.quote(cls.ISSUER)}"
                f"&digits={cls.DIGITS}&period={cls.PERIOD}")
