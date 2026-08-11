# Secure User Management System

An object-oriented Python project for a Cyber Security Institute. It demonstrates classes, inheritance, polymorphism, encapsulation, custom exceptions, packages, JSON persistence, password strength checks, login-attempt tracking, asynchronous activity logging, reports, and an optional FastAPI interface.

## Project layout

```
backend/          # Python CLI + FastAPI application
  users/          # User, Administrator, SecurityAnalyst classes
  exceptions/     # custom application exceptions
  utilities/      # validator, JSON storage, threaded audit logger
  services/       # UserManager application service
  main.py         # command-line demonstration
  api.py          # FastAPI endpoints
  test_system.py  # automated tests
  requirements.txt
frontend/         # React + Vite web interface
  src/
  package.json
docs/             # report, UML, presentation outline
```

## Backend

```powershell
cd backend
python -m pip install -r requirements.txt
python -m unittest test_system.py
python main.py
```

To run the API:

```powershell
cd backend
uvicorn api:app --reload
```

Before creating other users, call `POST /setup/administrator` once. Then authenticate at `POST /auth/login` and send the returned bearer token in the `Authorization` header. Only Administrators can list, create, or unlock users; Administrators and Security Analysts can read activity reports.

User IDs are primary keys. Omit `user_id` when registering and the system issues a unique key such as `USR_A1B2C3D4E5`. User data is immediately and atomically stored in `backend/data/users.json`, so it remains available after restarting the application. Names are normalized for case, punctuation, and spacing, and near-duplicate names are rejected to prevent confusingly similar records.

Copy `.env.example` into your deployment configuration and set allowed CORS origins, hosts, storage path, and a long random `SUMS_BOOTSTRAP_KEY`. This secret is required once to create the first administrator; it must be stored in a secret manager or protected environment variable, never in source control. The API intentionally returns only safe user information: password hashes and salts are never returned. Runtime records are saved to `backend/data/users.json`; this file is ignored by version control so user records are not committed accidentally.

The login endpoint has an in-process per-IP rate limit and account-level lockout. Browser sessions use `HttpOnly`, `SameSite=Strict` cookies rather than JavaScript-readable tokens. In production the app refuses to start unless secure cookies and a bootstrap key are configured; it also forces HTTPS, blocks untrusted Host headers, limits request sizes, uses restrictive CORS, and sends defensive security headers. For an internet-facing deployment, terminate HTTPS at a reverse proxy, set specific production `SUMS_CORS_ORIGINS` and `SUMS_ALLOWED_HOSTS` values (never `*`), run multiple application workers only with database-backed storage, and replace the in-memory session and rate-limit stores with Redis or a database. JSON storage remains appropriate for a single-instance educational or small internal deployment.

## Frontend

```powershell
cd frontend
npm install
npm run dev
```

The frontend expects the backend API at `http://127.0.0.1:8000` by default. To change it, copy `.env.example` to `.env` and set `VITE_API_URL`.

## Documentation

See [the project report](docs/PROJECT_REPORT.md), [the UML diagram](docs/UML_CLASS_DIAGRAM.md), and [the presentation](docs/PRESENTATION_SLIDES.md).
