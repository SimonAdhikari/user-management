"""Application service coordinating users, persistence, and activity records."""
from pathlib import Path
from threading import RLock
from difflib import SequenceMatcher
import re
import secrets

from exceptions import AuthenticationError, DuplicateUserError, UserNotFoundError
from users import Administrator, SecurityAnalyst, User
from utilities import ActivityLogger, JsonUserStorage


class UserManager:
    def __init__(self, data_file: str | Path, activity_file: str | Path) -> None:
        self.storage = JsonUserStorage(data_file)
        self.logger = ActivityLogger(activity_file)
        self._users: dict[str, User] = {}
        self._lock = RLock()
        self.load()

    @property
    def users(self) -> list[User]:
        return list(self._users.values())

    def load(self) -> None:
        self._users.clear()
        for record in self.storage.load():
            user = self._make_from_record(record)
            self._users[user.user_id] = user

    def _make_from_record(self, data: dict) -> User:
        role = data.get("role")
        target = Administrator if role == "Administrator" else SecurityAnalyst if role == "Security Analyst" else User
        return target.from_storage(data)

    @staticmethod
    def _name_key(name: str) -> str:
        """Normalise a name to catch case, spacing, and punctuation duplicates."""
        return re.sub(r"[^a-z0-9]", "", name.casefold())

    def _has_confusing_name(self, name: str) -> bool:
        candidate = self._name_key(name)
        for existing in self._users.values():
            known = self._name_key(existing.name)
            if candidate == known:
                return True
            # Blocks near-typos such as "Jhon Smith" after a "John Smith" record.
            if min(len(candidate), len(known)) >= 5 and SequenceMatcher(None, candidate, known).ratio() >= 0.85:
                return True
        return False

    def _new_user_id(self) -> str:
        """Generate a URL/API-safe primary key that fits the user-ID validation rule."""
        while True:
            user_id = f"USR_{secrets.token_hex(5).upper()}"
            if user_id not in self._users:
                return user_id

    def _make_user(self, user_id: str, name: str, email: str, password: str, role: str) -> User:
        classes = {"Administrator": Administrator, "Security Analyst": SecurityAnalyst, "User": User}
        try:
            return classes[role](user_id, name, email, password)
        except KeyError as error:
            raise ValueError("Role must be Administrator, Security Analyst, or User.") from error

    def create_user(self, user_id: str | None, name: str, email: str, password: str, role: str) -> User:
        with self._lock:
            user_id = user_id.strip() if user_id else self._new_user_id()
            if user_id in self._users or any(u.email == email.lower() for u in self._users.values()):
                raise DuplicateUserError("A user with this ID or email already exists.")
            if self._has_confusing_name(name):
                raise DuplicateUserError("A user with the same or a confusingly similar name already exists.")
            user = self._make_user(user_id, name, email, password, role)
            self._users[user.user_id] = user
            self.save()
            self.logger.log("USER_CREATED", user.user_id, f"role={user.role}")
            return user

    def get_user(self, user_id: str) -> User:
        try:
            return self._users[user_id]
        except KeyError as error:
            raise UserNotFoundError(f"No user found with ID '{user_id}'.") from error

    def authenticate(self, user_id: str, password: str) -> User:
        with self._lock:
            # Return the same response for unknown and wrong-password accounts.
            try:
                user = self.get_user(user_id)
            except UserNotFoundError as error:
                self.logger.log("LOGIN_FAILED", user_id, "Unknown user ID")
                raise AuthenticationError("Invalid credentials.") from error
            if user.is_locked:
                self.logger.log("LOGIN_BLOCKED", user_id, "Account is locked")
                raise AuthenticationError("Invalid credentials.")
            if not user.register_login_attempt(password):
                self.save()
                self.logger.log("LOGIN_FAILED", user_id, f"attempts={user.failed_login_attempts}")
                raise AuthenticationError("Invalid credentials.")
            self.save()
            self.logger.log("LOGIN_SUCCESS", user_id)
            return user

    def unlock_user(self, user_id: str) -> User:
        with self._lock:
            user = self.get_user(user_id)
            user.unlock()
            self.save()
            self.logger.log("ACCOUNT_UNLOCKED", user_id)
            return user

    def save(self) -> None:
        self.storage.save(self.users)

    def activity_report(self) -> dict:
        self.logger.flush()
        report = {"total_users": len(self._users), "locked_accounts": sum(u.is_locked for u in self.users),
                  "by_role": {}, "recent_events": []}
        for user in self.users:
            report["by_role"][user.role] = report["by_role"].get(user.role, 0) + 1
        if self.logger.log_file.exists():
            import json
            lines = self.logger.log_file.read_text(encoding="utf-8").splitlines()
            report["recent_events"] = [json.loads(line) for line in lines[-10:]]
        return report
