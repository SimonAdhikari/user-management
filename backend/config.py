"""Configuration loaded from environment variables, never hard-coded secrets."""
import os
from dataclasses import dataclass
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass


@dataclass(frozen=True)
class Settings:
    data_dir: Path
    cors_origins: list[str]
    allowed_hosts: list[str]
    session_minutes: int
    cookie_secure: bool
    environment: str
    bootstrap_key: str
    max_request_bytes: int
    smtp_host: str
    smtp_port: int
    smtp_username: str
    smtp_password: str
    smtp_sender: str
    smtp_tls: bool

    @classmethod
    def load(cls) -> "Settings":
        base = Path(os.getenv("SUMS_DATA_DIR", Path(__file__).resolve().parent / "data"))
        environment = os.getenv("SUMS_ENVIRONMENT", "development").lower()
        if environment not in {"development", "production"}:
            raise ValueError("SUMS_ENVIRONMENT must be development or production.")
        origins = [item.strip() for item in os.getenv("SUMS_CORS_ORIGINS", "http://localhost:5173").split(",") if item.strip()]
        hosts = [item.strip() for item in os.getenv("SUMS_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",") if item.strip()]
        minutes = int(os.getenv("SUMS_SESSION_MINUTES", "30"))
        if not 5 <= minutes <= 480:
            raise ValueError("SUMS_SESSION_MINUTES must be between 5 and 480.")
        secure_cookie = os.getenv("SUMS_COOKIE_SECURE", "false").lower() == "true"
        bootstrap_key = os.getenv("SUMS_BOOTSTRAP_KEY", "")
        request_bytes = int(os.getenv("SUMS_MAX_REQUEST_BYTES", "16384"))
        if not 1_024 <= request_bytes <= 1_048_576:
            raise ValueError("SUMS_MAX_REQUEST_BYTES must be between 1024 and 1048576.")
        if environment == "production":
            if not secure_cookie or not bootstrap_key:
                raise ValueError("Production requires SUMS_COOKIE_SECURE=true and a SUMS_BOOTSTRAP_KEY.")
            if "*" in origins or "*" in hosts:
                raise ValueError("Wildcard origins and hosts are prohibited in production.")
        # In development, allow wildcard for tunnel domains
        if environment == "development":
            if "*" not in origins:
                origins.append("*")
            if "*" not in hosts:
                hosts.append("*")
        smtp_host = os.getenv("SUMS_SMTP_HOST", "").strip()
        smtp_port = int(os.getenv("SUMS_SMTP_PORT", "587"))
        if not 1 <= smtp_port <= 65535:
            raise ValueError("SUMS_SMTP_PORT must be between 1 and 65535.")
        smtp_username = os.getenv("SUMS_SMTP_USERNAME", "")
        smtp_password = os.getenv("SUMS_SMTP_PASSWORD", "")
        smtp_sender = os.getenv("SUMS_SMTP_SENDER", "").strip()
        smtp_tls = os.getenv("SUMS_SMTP_TLS", "true").lower() == "true"
        return cls(base, origins, hosts, minutes, secure_cookie, environment, bootstrap_key, request_bytes,
                   smtp_host, smtp_port, smtp_username, smtp_password, smtp_sender, smtp_tls)
