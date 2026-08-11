"""Validation and password-security helpers."""
import hashlib
import hmac
import re
import secrets

from exceptions import InvalidEmailError, InvalidUserIDError, WeakPasswordError


class Validator:
    """Stateless validation utilities used by user objects and services."""

    EMAIL_PATTERN = re.compile(r"^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$")
    USER_ID_PATTERN = re.compile(r"^[A-Za-z0-9_]{3,20}$")

    @staticmethod
    def validate_user_id(user_id: str) -> None:
        if not isinstance(user_id, str) or not Validator.USER_ID_PATTERN.fullmatch(user_id):
            raise InvalidUserIDError("User ID must be 3-20 characters using letters, numbers, or underscores.")

    @staticmethod
    def validate_name(name: str) -> None:
        if not isinstance(name, str) or not name.strip() or len(name.strip()) > 80:
            raise ValueError("Name must contain between 1 and 80 non-space characters.")

    @staticmethod
    def validate_email(email: str) -> None:
        if not isinstance(email, str) or not Validator.EMAIL_PATTERN.fullmatch(email):
            raise InvalidEmailError("Enter a valid email address.")

    @staticmethod
    def password_issues(password: str) -> list[str]:
        """Return unmet password rules without exposing the supplied password."""
        if not isinstance(password, str):
            return ["Password must be text."]
        rules = [
            (len(password) >= 10, "at least 10 characters"),
            (bool(re.search(r"[A-Z]", password)), "one uppercase letter"),
            (bool(re.search(r"[a-z]", password)), "one lowercase letter"),
            (bool(re.search(r"\d", password)), "one digit"),
            (bool(re.search(r"[^A-Za-z0-9]", password)), "one special character"),
        ]
        return [f"Password needs {message}." for valid, message in rules if not valid]

    @staticmethod
    def validate_password(password: str) -> None:
        issues = Validator.password_issues(password)
        if issues:
            raise WeakPasswordError(" ".join(issues))

    @staticmethod
    def hash_password(password: str, salt: str | None = None) -> tuple[str, str]:
        """Derive a PBKDF2-HMAC-SHA256 password hash and return hash, salt."""
        salt = salt or secrets.token_hex(16)
        password_hash = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 310_000).hex()
        return password_hash, salt

    @staticmethod
    def verify_password(password: str, password_hash: str, salt: str) -> bool:
        candidate, _ = Validator.hash_password(password, salt)
        return hmac.compare_digest(candidate, password_hash)
