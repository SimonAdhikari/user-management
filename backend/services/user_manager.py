"""Application service coordinating users, persistence, and activity records."""
from pathlib import Path
from threading import RLock
from difflib import SequenceMatcher
import re
import secrets

from exceptions import AuthenticationError, DuplicateUserError, TwoFactorRequiredError, UserNotFoundError
from users import Administrator, SecurityAnalyst, User
from utilities import ActivityLogger, IdentityRegistry, JsonUserStorage


class UserManager:
    def __init__(self, data_file: str | Path, activity_file: str | Path) -> None:
        self.storage = JsonUserStorage(data_file)
        self.logger = ActivityLogger(activity_file)
        self.registry = IdentityRegistry(Path(data_file).with_name("user_registry.txt"))
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
            self.registry.record(user)
            self.logger.log("USER_CREATED", user.user_id, f"role={user.role}")
            return user

    def submit_kyc(self, user_id: str, document_type: str, document_number: str) -> User:
        """Verify a user's identity and record it in the registry for future terms."""
        with self._lock:
            user = self.get_user(user_id)
            user.submit_kyc(document_type, document_number)
            self.save()
            self.registry.record(user)
            self.logger.log("KYC_VERIFIED", user.user_id, f"doc={document_type}")
            return user

    def identify_user(self, user_id: str) -> dict:
        """Re-identify a known user from the plain-text registry."""
        record = self.registry.lookup(user_id)
        if not record:
            raise UserNotFoundError(f"No identity record found for '{user_id}'.")
        return record

    def get_user(self, user_id: str) -> User:
        try:
            return self._users[user_id]
        except KeyError as error:
            raise UserNotFoundError(f"No user found with ID '{user_id}'.") from error

    def authenticate(self, user_id: str, password: str, totp_code: str | None = None) -> User:
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
            # Password is correct — enforce the second factor when enabled.
            if user.totp_enabled:
                if not totp_code:
                    self.logger.log("LOGIN_2FA_REQUIRED", user_id)
                    raise TwoFactorRequiredError(pending_token=secrets.token_urlsafe(16))
                if not user.verify_totp(totp_code):
                    self.logger.log("LOGIN_2FA_FAILED", user_id)
                    raise AuthenticationError("Invalid credentials.")
            self.save()
            self.logger.log("LOGIN_SUCCESS", user_id)
            return user

    def authenticate_by_email(self, email: str, password: str, totp_code: str | None = None) -> User:
        """Look up the account by email and delegate to the standard authenticate flow."""
        with self._lock:
            normalised = email.strip().lower()
            user = next((u for u in self._users.values() if u.email.lower() == normalised), None)
            if user is None:
                self.logger.log("LOGIN_FAILED", normalised, "Unknown email")
                raise AuthenticationError("Invalid credentials.")
        return self.authenticate(user.user_id, password, totp_code)

    def begin_2fa_setup(self, user_id: str) -> dict:
        """Start TOTP enrolment; returns the secret and QR provisioning URI."""
        with self._lock:
            user = self.get_user(user_id)
            secret, uri = user.begin_totp_enrolment()
            self.save()
            self.logger.log("2FA_SETUP_STARTED", user_id)
            return {"secret": secret, "provisioning_uri": uri}

    def confirm_2fa_setup(self, user_id: str, code: str) -> User:
        with self._lock:
            user = self.get_user(user_id)
            user.confirm_totp_enrolment(code)
            self.save()
            self.logger.log("2FA_ENABLED", user_id)
            return user

    def disable_2fa(self, user_id: str) -> User:
        with self._lock:
            user = self.get_user(user_id)
            user.disable_totp()
            self.save()
            self.logger.log("2FA_DISABLED", user_id)
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

    # Social features methods
    def follow_user(self, follower_id: str, target_id: str) -> User:
        """Follow another user."""
        with self._lock:
            if follower_id == target_id:
                raise ValueError("Cannot follow yourself.")
            follower = self.get_user(follower_id)
            target = self.get_user(target_id)
            if target_id in follower.blocked:
                raise ValueError("Cannot follow a user you have blocked.")
            if follower_id in target.blocked:
                raise ValueError("Cannot follow a user who has blocked you.")
            follower.follow(target_id)
            target._followers.add(follower_id)
            # Check if they become friends (mutual follow)
            if target_id in follower.following and follower_id in target.following:
                follower._friends.add(target_id)
                target._friends.add(follower_id)
            self.save()
            self.logger.log("USER_FOLLOWED", follower_id, f"target={target_id}")
            return follower

    def unfollow_user(self, follower_id: str, target_id: str) -> User:
        """Unfollow a user."""
        with self._lock:
            follower = self.get_user(follower_id)
            target = self.get_user(target_id)
            follower.unfollow(target_id)
            target._followers.discard(follower_id)
            # Remove friendship if it existed
            follower._friends.discard(target_id)
            target._friends.discard(follower_id)
            self.save()
            self.logger.log("USER_UNFOLLOWED", follower_id, f"target={target_id}")
            return follower

    def send_friend_request(self, sender_id: str, target_id: str) -> User:
        """Send a friend request."""
        with self._lock:
            if sender_id == target_id:
                raise ValueError("Cannot send friend request to yourself.")
            sender = self.get_user(sender_id)
            target = self.get_user(target_id)
            if target_id in sender.blocked:
                raise ValueError("Cannot send friend request to a user you have blocked.")
            if sender_id in target.blocked:
                raise ValueError("Cannot send friend request to a user who has blocked you.")
            if target_id in sender.friends:
                raise ValueError("Already friends with this user.")
            if target_id in sender.friend_requests_sent:
                raise ValueError("Friend request already sent.")
            if target_id in sender.friend_requests_received:
                raise ValueError("This user has already sent you a friend request. Accept it instead.")
            sender._friend_requests_sent.add(target_id)
            target._friend_requests_received.add(sender_id)
            self.save()
            self.logger.log("FRIEND_REQUEST_SENT", sender_id, f"target={target_id}")
            return sender

    def accept_friend_request(self, user_id: str, requester_id: str) -> User:
        """Accept a friend request."""
        with self._lock:
            user = self.get_user(user_id)
            requester = self.get_user(requester_id)
            if requester_id not in user.friend_requests_received:
                raise ValueError("No friend request from this user.")
            user.accept_friend_request(requester_id)
            requester._friend_requests_sent.discard(user_id)
            requester._friends.add(user_id)
            requester._following.add(user_id)
            self.save()
            self.logger.log("FRIEND_REQUEST_ACCEPTED", user_id, f"requester={requester_id}")
            return user

    def decline_friend_request(self, user_id: str, requester_id: str) -> User:
        """Decline a friend request."""
        with self._lock:
            user = self.get_user(user_id)
            requester = self.get_user(requester_id)
            user.decline_friend_request(requester_id)
            requester._friend_requests_sent.discard(user_id)
            self.save()
            self.logger.log("FRIEND_REQUEST_DECLINED", user_id, f"requester={requester_id}")
            return user

    def cancel_friend_request(self, sender_id: str, target_id: str) -> User:
        """Cancel a sent friend request."""
        with self._lock:
            sender = self.get_user(sender_id)
            target = self.get_user(target_id)
            sender.cancel_friend_request(target_id)
            target._friend_requests_received.discard(sender_id)
            self.save()
            self.logger.log("FRIEND_REQUEST_CANCELLED", sender_id, f"target={target_id}")
            return sender

    def unfriend_user(self, user_id: str, target_id: str) -> User:
        """Remove a friend (mutual unfriend)."""
        with self._lock:
            user = self.get_user(user_id)
            target = self.get_user(target_id)
            user.unfriend(target_id)
            target._friends.discard(user_id)
            target._following.discard(user_id)
            self.save()
            self.logger.log("USER_UNFRIENDED", user_id, f"target={target_id}")
            return user

    def block_user(self, user_id: str, target_id: str) -> User:
        """Block a user."""
        with self._lock:
            if user_id == target_id:
                raise ValueError("Cannot block yourself.")
            user = self.get_user(user_id)
            target = self.get_user(target_id)
            user.block(target_id)
            # Remove from target's followers/following
            target._followers.discard(user_id)
            target._following.discard(user_id)
            target._friends.discard(user_id)
            target._friend_requests_sent.discard(user_id)
            target._friend_requests_received.discard(user_id)
            self.save()
            self.logger.log("USER_BLOCKED", user_id, f"target={target_id}")
            return user

    def unblock_user(self, user_id: str, target_id: str) -> User:
        """Unblock a user."""
        with self._lock:
            user = self.get_user(user_id)
            target = self.get_user(target_id)
            user.unblock(target_id)
            self.save()
            self.logger.log("USER_UNBLOCKED", user_id, f"target={target_id}")
            return user

    def get_social_info(self, user_id: str) -> dict:
        """Get social information for a user."""
        with self._lock:
            user = self.get_user(user_id)
            return {
                "following": list(user.following),
                "followers": list(user.followers),
                "friends": list(user.friends),
                "blocked": list(user.blocked),
                "friend_requests_sent": list(user.friend_requests_sent),
                "friend_requests_received": list(user.friend_requests_received),
                "following_count": len(user.following),
                "followers_count": len(user.followers),
                "friends_count": len(user.friends),
            }

    def get_user_profile(self, viewer_id: str, target_id: str) -> dict:
        """Get a user's profile with social context from viewer's perspective."""
        with self._lock:
            viewer = self.get_user(viewer_id)
            target = self.get_user(target_id)
            return {
                "user": target.to_public_dict(),
                "is_following": viewer.is_following(target_id),
                "is_friend": viewer.is_friend(target_id),
                "is_blocked": viewer.is_blocked(target_id),
                "is_blocked_by_target": target.is_blocked(viewer_id),
                "has_pending_friend_request": viewer.has_pending_friend_request(target_id),
                "has_sent_friend_request": viewer.has_sent_friend_request(target_id),
            }

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
