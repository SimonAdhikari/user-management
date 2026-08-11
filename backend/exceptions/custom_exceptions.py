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


class UserNotFoundError(UserManagementError):
    """Raised when no record matches a requested user ID."""
