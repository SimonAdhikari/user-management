"""Base User model. Password data is encapsulated and stored only as a hash."""
from __future__ import annotations

from utilities import Validator


class User:
    MAX_FAILED_LOGINS = 3

    def __init__(self, user_id: str, name: str, email: str, password: str, role: str = "User"):
        Validator.validate_user_id(user_id)
        Validator.validate_name(name)
        Validator.validate_email(email)
        Validator.validate_password(password)
        self._user_id = user_id
        self._name = name.strip()
        self._email = email.lower()
        self._role = role
        self.__password_hash, self.__salt = Validator.hash_password(password)
        self._failed_login_attempts = 0
        self._is_locked = False
        self._kyc_status = "unverified"
        self._kyc_document_type = None
        self._kyc_document_number = None
        self._totp_secret = None
        self._totp_enabled = False

    @property
    def user_id(self) -> str: return self._user_id

    @property
    def name(self) -> str: return self._name

    @name.setter
    def name(self, value: str) -> None:
        Validator.validate_name(value)
        self._name = value.strip()

    @property
    def email(self) -> str: return self._email

    @email.setter
    def email(self, value: str) -> None:
        Validator.validate_email(value)
        self._email = value.lower()

    @property
    def role(self) -> str: return self._role

    @property
    def is_locked(self) -> bool: return self._is_locked

    @property
    def failed_login_attempts(self) -> int: return self._failed_login_attempts

    @property
    def kyc_status(self) -> str: return self._kyc_status

    @property
    def kyc_document_type(self) -> str | None: return self._kyc_document_type

    def submit_kyc(self, document_type: str, document_number: str) -> None:
        """Register KYC document details and mark the identity as verified."""
        if not document_type or not document_type.strip():
            raise ValueError("KYC document type is required.")
        if not document_number or len(document_number.strip()) < 4:
            raise ValueError("KYC document number must be at least 4 characters.")
        self._kyc_document_type = document_type.strip()
        self._kyc_document_number = document_number.strip()
        self._kyc_status = "verified"

    def revoke_kyc(self) -> None:
        self._kyc_status = "unverified"
        self._kyc_document_type = None
        self._kyc_document_number = None

    @property
    def totp_enabled(self) -> bool: return self._totp_enabled

    def begin_totp_enrolment(self) -> tuple[str, str]:
        """Generate a pending secret and return it with the QR provisioning URI."""
        from utilities import TotpService
        self._totp_secret = TotpService.generate_secret()
        self._totp_enabled = False
        return self._totp_secret, TotpService.provisioning_uri(self._totp_secret, self._email)

    def confirm_totp_enrolment(self, code: str) -> None:
        """Activate 2FA once the user proves they can generate valid codes."""
        from utilities import TotpService
        if not self._totp_secret:
            raise ValueError("Start 2FA setup first.")
        if not TotpService.verify(self._totp_secret, code):
            raise ValueError("Invalid authentication code.")
        self._totp_enabled = True

    def disable_totp(self) -> None:
        self._totp_secret = None
        self._totp_enabled = False

    def verify_totp(self, code: str) -> bool:
        from utilities import TotpService
        return bool(self._totp_enabled and self._totp_secret
                    and TotpService.verify(self._totp_secret, code))

    def check_password(self, password_attempt: str) -> bool:
        return Validator.verify_password(password_attempt, self.__password_hash, self.__salt)

    def register_login_attempt(self, password_attempt: str) -> bool:
        """Authenticate and lock the account after repeated failures."""
        if self._is_locked:
            return False
        if self.check_password(password_attempt):
            self._failed_login_attempts = 0
            return True
        self._failed_login_attempts += 1
        self._is_locked = self._failed_login_attempts >= self.MAX_FAILED_LOGINS
        return False

    def unlock(self) -> None:
        self._is_locked = False
        self._failed_login_attempts = 0

    def change_password(self, old_password: str, new_password: str) -> None:
        if not self.check_password(old_password):
            raise ValueError("Current password is incorrect.")
        Validator.validate_password(new_password)
        self.__password_hash, self.__salt = Validator.hash_password(new_password)

    def display_privileges(self) -> str:
        return f"[{self.role}] {self.name} has basic user access."

    def to_dict(self) -> dict:
        """Safe public representation; intentionally excludes password information."""
        return {"user_id": self.user_id, "name": self.name, "email": self.email,
                "role": self.role, "is_locked": self.is_locked,
                "failed_login_attempts": self.failed_login_attempts,
                "kyc_status": self._kyc_status, "kyc_document_type": self._kyc_document_type,
                "totp_enabled": self._totp_enabled}

    def to_storage_dict(self) -> dict:
        data = self.to_dict()
        data.update({"password_hash": self.__password_hash, "salt": self.__salt,
                     "kyc_document_number": self._kyc_document_number,
                     "totp_secret": self._totp_secret})
        return data

    @classmethod
    def from_storage(cls, data: dict) -> "User":
        """Restore a user without requiring the plaintext password."""
        obj = cls.__new__(cls)
        obj._user_id, obj._name, obj._email = data["user_id"], data["name"], data["email"]
        obj._role = data.get("role", "User")
        # Migration support for the starter file; it is immediately rewritten hashed on save.
        if "password_hash" in data and "salt" in data:
            obj.__password_hash, obj.__salt = data["password_hash"], data["salt"]
        else:
            obj.__password_hash, obj.__salt = Validator.hash_password(data["password"])
        obj._failed_login_attempts = data.get("failed_login_attempts", 0)
        obj._is_locked = data.get("is_locked", False)
        obj._kyc_status = data.get("kyc_status", "unverified")
        obj._kyc_document_type = data.get("kyc_document_type")
        obj._kyc_document_number = data.get("kyc_document_number")
        obj._totp_secret = data.get("totp_secret")
        obj._totp_enabled = data.get("totp_enabled", False)
        return obj

    def __str__(self) -> str:
        return f"{self.role}: {self.name} ({self.user_id})"
