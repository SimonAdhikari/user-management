from .user import User


class SecurityAnalyst(User):
    """User subtype with security-monitoring privileges."""
    def __init__(self, user_id: str, name: str, email: str, password: str):
        super().__init__(user_id, name, email, password, role="Security Analyst")

    def display_privileges(self) -> str:
        return f"[{self.role}] {self.name} can review security logs and generate activity reports."
