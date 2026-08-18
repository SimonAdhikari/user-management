"""SMTP delivery for account verification codes (stdlib smtplib only)."""
from __future__ import annotations

import smtplib
import ssl
from email.message import EmailMessage


class EmailSender:
    """Sends plain-text email through a configured SMTP relay.

    When no host is configured the sender is inert (``configured`` is False)
    and the API layer decides how to degrade (development mode surfaces the
    code directly; production refuses to sign up).
    """

    def __init__(self, host: str = "", port: int = 587, username: str = "",
                 password: str = "", sender: str = "", use_tls: bool = True) -> None:
        self.host = host
        self.port = port
        self.username = username
        self.password = password
        self.sender = sender or username or "no-reply@localhost"
        self.use_tls = use_tls

    @property
    def configured(self) -> bool:
        return bool(self.host)

    def send_verification_code(self, to_addr: str, code: str, platform: str = "Social Hub") -> None:
        body = (
            f"Welcome to {platform}!\n\n"
            f"Your verification code is: {code}\n\n"
            f"It expires in 10 minutes. If you did not request this, you can safely ignore this email."
        )
        self.send(to_addr, f"Your {platform} verification code", body)

    def send(self, to_addr: str, subject: str, body: str) -> None:
        message = EmailMessage()
        message["From"] = self.sender
        message["To"] = to_addr
        message["Subject"] = subject
        message.set_content(body)
        context = ssl.create_default_context()
        if self.use_tls and self.port == 465:
            with smtplib.SMTP_SSL(self.host, self.port, timeout=15, context=context) as smtp:
                self._login(smtp)
                smtp.send_message(message)
        else:
            with smtplib.SMTP(self.host, self.port, timeout=15) as smtp:
                if self.use_tls:
                    smtp.starttls(context=context)
                self._login(smtp)
                smtp.send_message(message)

    def _login(self, smtp: smtplib.SMTP) -> None:
        if self.username:
            smtp.login(self.username, self.password)
