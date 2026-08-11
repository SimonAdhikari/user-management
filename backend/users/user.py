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
                "failed_login_attempts": self.failed_login_attempts}

    def to_storage_dict(self) -> dict:
        data = self.to_dict()
        data.update({"password_hash": self.__password_hash, "salt": self.__salt})
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
        return obj

    def __str__(self) -> str:
        return f"{self.role}: {self.name} ({self.user_id})"
