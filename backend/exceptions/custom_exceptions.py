"""Domain-specific exceptions for the Secure User Management System."""


class UserManagementError(Exception):
    """Base exception for expected system errors."""


class InvalidEmailError(UserManagementError):
    """Raised when an email address has an invalid format."""


class WeakPasswordError(UserManagementError):
    """Raised when a password does not meet the security policy."""


class InvalidUserIDError(UserManagementError):
    """Raised when a user identifier is malformed."""


class DuplicateUserError(UserManagementError):
    """Raised when a user ID or email already exists."""


class AuthenticationError(UserManagementError):
    """Raised when authentication fails or an account is locked."""


class TwoFactorRequiredError(AuthenticationError):
    """Raised when the password is correct but a TOTP code is still required."""

    def __init__(self, message: str = "Two-factor authentication code required.", pending_token: str = ""):
        super().__init__(message)
        self.pending_token = pending_token


class UserNotFoundError(UserManagementError):
    """Raised when no record matches a requested user ID."""


class PostNotFoundError(UserManagementError):
    """Raised when no post matches a requested post ID."""
