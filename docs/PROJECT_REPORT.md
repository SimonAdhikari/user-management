# Secure User Management System — Project Report

## 1. Introduction

Cybersecurity applications require reliable identity records, access separation, password protection, and traceability. This project implements a Secure User Management System for a Cyber Security Institute using Python object-oriented programming. It manages Administrators, Security Analysts, and ordinary Users while preventing direct access to password data.

## 2. Objectives

- Manage user ID, name, email, role, and authentication credentials.
- Apply encapsulation, inheritance, polymorphism, exception handling, modules, and packages.
- Validate data before it enters the system.
- Keep an auditable record of important activity.
- Store user records safely in JSON without plaintext passwords.

## 3. Technologies and Architecture

The project uses Python’s standard library for the core application. `FastAPI` is optional and only powers the supplied browser-facing API. The architecture separates concerns into packages: `users` contains domain models; `exceptions` defines application errors; `utilities` provides validation, storage, and logging; and `services` coordinates operations. This keeps the interface (CLI or API) independent of business rules.

## 4. OOP Design

`User` is the base class. Its constructor validates all supplied data and initializes protected attributes. The password hash and salt are private (`__password_hash`, `__salt`) and are not included in the public `to_dict()` representation. Password verification uses a method, so callers cannot retrieve a password.

`Administrator` and `SecurityAnalyst` inherit from `User`. Each child constructor calls `super()` and each overrides `display_privileges()`. A loop over `list[User]` can call that method without checking the concrete class; Python selects the correct child implementation at runtime. This is runtime polymorphism.

Properties provide controlled read access to user ID, role, lock status, and failed attempts. The `name` and `email` setters validate replacements. `__str__()` returns a readable, password-free identity summary.

## 5. Security Controls

Passwords must contain at least ten characters, uppercase and lowercase letters, a digit, and a special character. Passwords are converted to PBKDF2-HMAC-SHA256 hashes with a unique random salt and 310,000 iterations. Comparison uses `hmac.compare_digest`. These measures avoid the original danger of storing plaintext passwords.

The login-attempt tracker locks an account after three failed passwords. An administrator workflow may call `unlock_user()`. Authentication and account events are queued to a background logger thread and written as JSON Lines audit events. The activity report summarizes roles, account locks, and recent events.

## 6. Exception Handling and Validation

The project defines `InvalidEmailError`, `WeakPasswordError`, `InvalidUserIDError`, `DuplicateUserError`, `AuthenticationError`, and `UserNotFoundError`, all derived from `UserManagementError`. `Validator` raises the appropriate error when input is unacceptable. The CLI demonstrates `try`, `except`, `else`, and `finally`: expected errors are reported clearly, success is only printed in `else`, and the `finally` blocks complete logging cleanup.

## 7. Additional Features

Four additional features were implemented (only two were required):

- JSON file persistence through `JsonUserStorage`.
- Password strength checking and cryptographic password hashing.
- Login-attempt tracking and account locking.
- Multithreaded activity logging and activity report generation.

## 8. Demonstration Procedure

1. Open PowerShell in the project folder and run `cd backend`.
2. Run `python main.py`.
3. Choose option 1 and create an Administrator, Security Analyst, and User using strong passwords.
4. Choose option 2 to view password-free records.
5. Choose option 3 to show role-specific privileges; this demonstrates polymorphism.
6. Choose option 4 and deliberately enter a wrong password three times. The account locks.
7. Select report option 5 to inspect the audit summary.
8. Run `python -m unittest test_system.py` to show automated verification.

## 9. Testing

The included tests cover invalid email rejection, weak-password rejection, encapsulation through a password-free public dictionary, polymorphic privilege output, account locking, unlocking, successful login, persistence, and the absence of plaintext passwords from the saved JSON file.

## 10. Limitations and Future Work

The API includes a bootstrap-secret-protected one-time administrator setup, short-lived `HttpOnly`/`SameSite=Strict` browser sessions, role-based authorization, restrictive CORS configuration, trusted-host validation, request limits, HTTP security headers, and atomic JSON writes. Production mode fails to start without secure cookies and a bootstrap secret, and forces HTTPS. This is still not a full production identity platform. A production version should use a database, a shared session store such as Redis, a dedicated password hashing package such as Argon2, IP-level rate limiting, encrypted backups, secret management, and HTTPS termination at a reverse proxy.

## 11. Conclusion

The completed system meets the requested OOP and security requirements. Its structure makes future changes manageable while its validation, hashing, locking, persistence, and activity records demonstrate practical cybersecurity-focused software design.
