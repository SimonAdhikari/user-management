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
        # Social features
        self._following: set[str] = set()      # Users this user is following
        self._followers: set[str] = set()      # Users following this user
        self._friends: set[str] = set()        # Mutual friends (both follow each other)
        self._blocked: set[str] = set()        # Users blocked by this user
        self._friend_requests_sent: set[str] = set()   # Pending friend requests sent
        self._friend_requests_received: set[str] = set()  # Pending friend requests received

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

    # Social features properties
    @property
    def following(self) -> set[str]:
        """Users this user is following."""
        return self._following.copy()

    @property
    def followers(self) -> set[str]:
        """Users following this user."""
        return self._followers.copy()

    @property
    def friends(self) -> set[str]:
        """Mutual friends (both follow each other)."""
        return self._friends.copy()

    @property
    def blocked(self) -> set[str]:
        """Users blocked by this user."""
        return self._blocked.copy()

    @property
    def friend_requests_sent(self) -> set[str]:
        """Pending friend requests sent by this user."""
        return self._friend_requests_sent.copy()

    @property
    def friend_requests_received(self) -> set[str]:
        """Pending friend requests received by this user."""
        return self._friend_requests_received.copy()

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

    # Social features methods
    def follow(self, target_user_id: str) -> None:
        """Follow another user."""
        if target_user_id == self._user_id:
            raise ValueError("Cannot follow yourself.")
        if target_user_id in self._blocked:
            raise ValueError("Cannot follow a user you have blocked.")
        self._following.add(target_user_id)

    def unfollow(self, target_user_id: str) -> None:
        """Unfollow a user."""
        self._following.discard(target_user_id)
        # If they were friends, remove friendship
        if target_user_id in self._friends:
            self._friends.discard(target_user_id)

    def send_friend_request(self, target_user_id: str) -> None:
        """Send a friend request to another user."""
        if target_user_id == self._user_id:
            raise ValueError("Cannot send friend request to yourself.")
        if target_user_id in self._blocked:
            raise ValueError("Cannot send friend request to a user you have blocked.")
        if target_user_id in self._friends:
            raise ValueError("Already friends with this user.")
        if target_user_id in self._friend_requests_sent:
            raise ValueError("Friend request already sent.")
        if target_user_id in self._friend_requests_received:
            raise ValueError("This user has already sent you a friend request. Accept it instead.")
        self._friend_requests_sent.add(target_user_id)

    def accept_friend_request(self, requester_user_id: str) -> None:
        """Accept a friend request."""
        if requester_user_id not in self._friend_requests_received:
            raise ValueError("No friend request from this user.")
        self._friend_requests_received.discard(requester_user_id)
        self._friends.add(requester_user_id)
        self._following.add(requester_user_id)  # Auto-follow when becoming friends

    def decline_friend_request(self, requester_user_id: str) -> None:
        """Decline a friend request."""
        self._friend_requests_received.discard(requester_user_id)

    def cancel_friend_request(self, target_user_id: str) -> None:
        """Cancel a sent friend request."""
        self._friend_requests_sent.discard(target_user_id)

    def unfriend(self, target_user_id: str) -> None:
        """Remove a friend (mutual unfriend)."""
        self._friends.discard(target_user_id)
        self._following.discard(target_user_id)

    def block(self, target_user_id: str) -> None:
        """Block a user."""
        if target_user_id == self._user_id:
            raise ValueError("Cannot block yourself.")
        self._blocked.add(target_user_id)
        # Remove all relationships
        self._following.discard(target_user_id)
        self._followers.discard(target_user_id)
        self._friends.discard(target_user_id)
        self._friend_requests_sent.discard(target_user_id)
        self._friend_requests_received.discard(target_user_id)

    def unblock(self, target_user_id: str) -> None:
        """Unblock a user."""
        self._blocked.discard(target_user_id)

    def is_following(self, target_user_id: str) -> bool:
        """Check if following a user."""
        return target_user_id in self._following

    def is_friend(self, target_user_id: str) -> bool:
        """Check if friends with a user."""
        return target_user_id in self._friends

    def is_blocked(self, target_user_id: str) -> bool:
        """Check if a user is blocked."""
        return target_user_id in self._blocked

    def has_pending_friend_request(self, target_user_id: str) -> bool:
        """Check if there's a pending friend request from this user."""
        return target_user_id in self._friend_requests_received

    def has_sent_friend_request(self, target_user_id: str) -> bool:
        """Check if this user has sent a friend request to target."""
        return target_user_id in self._friend_requests_sent

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
                "totp_enabled": self._totp_enabled,
                "following_count": len(self._following),
                "followers_count": len(self._followers),
                "friends_count": len(self._friends)}

    def to_storage_dict(self) -> dict:
        data = self.to_dict()
        data.update({"password_hash": self.__password_hash, "salt": self.__salt,
                     "kyc_document_number": self._kyc_document_number,
                     "totp_secret": self._totp_secret,
                     "following": list(self._following),
                     "followers": list(self._followers),
                     "friends": list(self._friends),
                     "blocked": list(self._blocked),
                     "friend_requests_sent": list(self._friend_requests_sent),
                     "friend_requests_received": list(self._friend_requests_received)})
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
        # Social features
        obj._following = set(data.get("following", []))
        obj._followers = set(data.get("followers", []))
        obj._friends = set(data.get("friends", []))
        obj._blocked = set(data.get("blocked", []))
        obj._friend_requests_sent = set(data.get("friend_requests_sent", []))
        obj._friend_requests_received = set(data.get("friend_requests_received", []))
        return obj

    def __str__(self) -> str:
        return f"{self.role}: {self.name} ({self.user_id})"
