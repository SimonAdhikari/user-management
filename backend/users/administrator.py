from .user import User


class Administrator(User):
    """User subtype with system-management privileges."""
    def __init__(self, user_id: str, name: str, email: str, password: str):
        super().__init__(user_id, name, email, password, role="Administrator")

    def display_privileges(self) -> str:
        return f"[{self.role}] {self.name} can manage users, unlock accounts, and view audit reports."
