# Presentation Slides — Secure User Management System

## Slide 1 — Title

Secure User Management System using Object-Oriented Python

Cyber Security Institute | Student name | Course | Date

## Slide 2 — Problem and Goals

- Manage institute users and access roles securely.
- Protect password information from direct access.
- Validate inputs and preserve an activity trail.

## Slide 3 — System Architecture

- `users`: domain classes.
- `exceptions`: meaningful error types.
- `utilities`: validation, storage, threaded logging.
- `services`: `UserManager` coordinates operations.
- CLI and optional FastAPI API are separate interfaces.

## Slide 4 — OOP Design

- `User` is the base class.
- Constructor initializes validated state.
- Properties control data access.
- Private hash and salt enforce encapsulation.
- `__str__()` gives a safe readable summary.

## Slide 5 — Inheritance and Polymorphism

- `Administrator(User)` manages users and reports.
- `SecurityAnalyst(User)` reviews logs.
- Both call `super()`.
- Both override `display_privileges()`.
- One loop invokes the correct privilege behavior at runtime.

## Slide 6 — Validation and Exceptions

- User ID: 3–20 alphanumeric/underscore characters.
- Email format validation.
- Strong password policy.
- Custom exceptions: invalid ID/email, weak password, duplicate user, authentication failure.
- CLI uses `try`, `except`, `else`, `finally`, and `raise`.

## Slide 7 — Security Features

- PBKDF2-HMAC-SHA256 password hashing + random salt.
- Constant-time password comparison.
- Password-free public API responses.
- Lock account after three failed logins.

## Slide 8 — Extra Features

- JSON persistence.
- Password-strength checker.
- Login-attempt tracker.
- Background-thread activity logger.
- Activity report with role and lock counts.

## Slide 9 — Live Demonstration

1. Create three role types.
2. Show records and privileges.
3. Trigger an invalid email/password error.
4. Demonstrate three failed logins and account lock.
5. Show report and automated tests.

## Slide 10 — Conclusion and Future Work

- All required OOP concepts are applied in a modular project.
- Passwords are protected and user activity is auditable.
- Future work: database, Argon2, RBAC permissions, API authentication, and rate limiting.
