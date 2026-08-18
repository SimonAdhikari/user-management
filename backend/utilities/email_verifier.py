"""Email authenticity checks.

Rejects obviously fake addresses before any account is created:

* disposable / throwaway mail providers (mailinator, temp-mail, yopmail, …)
* reserved documentation TLDs that can never receive mail (.test, .invalid, …)
* reserved example domains (example.com and friends)
* domains that do not exist or have no mail records (MX/A lookup)

DNS lookups fail *open* on connectivity problems so legitimate users are
never locked out when the server itself is offline; the emailed one-time
code remains the final proof that an inbox is real and owned by the signer.
"""
from __future__ import annotations

import socket

from exceptions import InvalidEmailError
from utilities.validator import Validator


class EmailVerifier:
    """Stateless checks that reject fake or undeliverable email addresses."""

    #: Reserved / documentation TLDs (RFC 2606 and common fake suffixes).
    RESERVED_TLDS = (".test", ".example", ".invalid", ".localhost",
                     ".local", ".fake", ".internal", ".home.arpa")

    #: Domains reserved by IANA for documentation — they never accept mail.
    RESERVED_DOMAINS = frozenset({"example.com", "example.org", "example.net"})

    #: Well-known disposable / throwaway mail providers.
    DISPOSABLE_DOMAINS = frozenset({
        # Mailinator family
        "mailinator.com", "mailinator.net", "mailinator.org", "mailinator2.com",
        "mailmetrash.com", "sogetthis.com", "thisisnotmyrealemail.com",
        # Temp-mail family
        "tempmail.com", "tempmail.io", "tempmail.dev", "tempmailo.com",
        "temp-mail.org", "temp-mail.io", "temp-mail.dev", "temporary-mail.net",
        "tempmailaddress.com", "tempmailer.com", "tempmailer.net",
        "temporarymail.com", "temporaryemail.com", "tempinbox.com",
        # Throwaway family
        "throwaway.email", "throwawaymail.com", "throwawaymail.io", "throwam.com",
        # Guerrilla Mail family
        "guerrillamail.com", "guerrillamail.net", "guerrillamail.org",
        "guerrillamail.info", "guerrillamail.biz", "guerrillamail.de",
        "guerrillamailblock.com", "grr.la", "sharklasers.com",
        # 10-minute mail family
        "10minuteemail.com", "10minutemail.com", "10minemail.com",
        "20minutemail.com", "minutemail.com",
        # YOPmail family
        "yopmail.com", "yopmail.fr", "yopmail.net", "yopmail.gq",
        "cool.fr.nf", "jetable.fr.nf", "nospam.ze.tc", "nomail.xl.cx",
        "mega.zik.dj", "speed.1s.fr", "courriel.fr.nf", "moncourrier.fr.nf",
        # Trashmail family
        "trashmail.com", "trashmail.me", "trashmail.net", "trashmail.org",
        "trashmail.at", "trashmail.io", "trash-mail.com", "trash-mail.de",
        "mytrashmail.com", "mailmetrash.com",
        # Fake-mail family
        "fakeinbox.com", "fakemail.net", "fakemailgenerator.com",
        "fake-mail.cf", "fake-mail.ga", "fake-mail.ml",
        # Misc. popular disposable services
        "mailnesia.com", "maildrop.cc", "maildrop.ml", "maildrop.ga",
        "discard.email", "discardmail.com", "discardmail.de",
        "spamgourmet.com", "spamgourmet.net", "spamgourmet.org",
        "mytemp.email", "mohmal.com", "getnada.com", "nada.email",
        "emailondeck.com", "mintemail.com", "mailcatch.com", "mailmoat.com",
        "mailsac.com", "inboxkitten.io", "burnermail.io", "harakirimail.com",
        "tmpmail.net", "tmpmail.org", "1secmail.com", "1secmail.org",
        "1secmail.net", "esiix.com", "spambox.us", "spambox.me", "spam4.me",
        "mailforspam.com", "tempr.email", "discart.email", "mailnull.com",
        "spamhole.com", "spamtrail.com", "jetable.org", "mailexpire.com",
        "disposablemail.com", "disposableemailaddresses.emailmiser.com",
        "emailtemporar.ro", "cuvox.de", "armyspy.com", "dayrep.com",
        "einrot.com", "fleckens.hu", "gustr.com", "superrito.com",
        "teleworm.us", "spamhereplease.com", "safetymail.info",
        "devnullmail.com", "e4ward.com", "s0ny.net", "suremail.info",
        "veryrealemail.com", "spamavert.com", "trashymail.com",
    })

    @staticmethod
    def domain_of(email: str) -> str:
        return email.rsplit("@", 1)[-1].strip().lower()

    @staticmethod
    def has_reserved_tld(email: str) -> bool:
        domain = EmailVerifier.domain_of(email)
        return any(domain.endswith(tld) for tld in EmailVerifier.RESERVED_TLDS)

    @staticmethod
    def is_reserved_domain(email: str) -> bool:
        return EmailVerifier.domain_of(email) in EmailVerifier.RESERVED_DOMAINS

    @staticmethod
    def is_disposable(email: str) -> bool:
        """True for known throwaway providers, including their subdomains."""
        domain = EmailVerifier.domain_of(email)
        if domain in EmailVerifier.DISPOSABLE_DOMAINS:
            return True
        parts = domain.split(".")
        return any(".".join(parts[index:]) in EmailVerifier.DISPOSABLE_DOMAINS
                   for index in range(1, len(parts) - 1))

    @staticmethod
    def domain_accepts_mail(email: str, timeout: float = 5.0) -> tuple[bool, str]:
        """Check MX (then A) records. Returns (ok, reason).

        Only a *definitive* negative answer (domain does not exist) rejects
        the address; resolver/network failures fail open.
        """
        domain = EmailVerifier.domain_of(email)
        try:
            import dns.exception
            import dns.resolver
            resolver = dns.resolver.Resolver()
            resolver.lifetime = timeout
            try:
                if resolver.resolve(domain, "MX"):
                    return True, "mx"
            except dns.resolver.NoAnswer:
                # Domain exists but has no MX — mail may still route to an A record.
                try:
                    if resolver.resolve(domain, "A"):
                        return True, "a-record"
                except dns.resolver.NXDOMAIN:
                    return False, "the domain does not exist"
                except dns.exception.DNSException:
                    pass
            except dns.resolver.NXDOMAIN:
                return False, "the domain does not exist"
            except dns.exception.DNSException:
                pass  # timeout / no nameservers — fall through to stdlib check
        except ImportError:
            pass
        try:
            socket.getaddrinfo(domain, "smtp")
            return True, "domain resolves"
        except socket.gaierror as error:
            # EAI_NONAME is a definitive "no such domain"; anything else is a
            # transient resolver problem and we fail open.
            if getattr(error, "errno", None) == socket.EAI_NONAME:
                return False, "the domain does not exist"
            return True, "dns unavailable (fail-open)"
        except OSError:
            return True, "network unavailable (fail-open)"

    @staticmethod
    def verify_authenticity(email: str) -> None:
        """Raise InvalidEmailError when the address is obviously fake."""
        Validator.validate_email(email)
        if EmailVerifier.has_reserved_tld(email):
            raise InvalidEmailError(
                "This email domain is reserved for testing and can never receive mail. Use a real email address.")
        if EmailVerifier.is_reserved_domain(email):
            raise InvalidEmailError(
                "Example addresses (example.com) cannot receive mail. Use a real email address.")
        if EmailVerifier.is_disposable(email):
            raise InvalidEmailError(
                "Disposable or temporary email addresses are not allowed. Use a real email address.")
        ok, reason = EmailVerifier.domain_accepts_mail(email)
        if not ok:
            raise InvalidEmailError(
                f"This email cannot receive mail because {reason}. Use a real email address.")
