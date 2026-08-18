# 🚀 Social Hub — Public Domain Live

## ✅ Your Social Media App is Running

### 🌐 **Public URLs**

| URL | Purpose |
|-----|---------|
| **https://november-pub-pmid-ahead.trycloudflare.com** | 📱 **Open this in any browser** — works on any device worldwide |
| http://127.0.0.1:4173 | Local frontend (dev only) |
| http://127.0.0.1:8000 | Backend API (local dev) |
| http://127.0.0.1:8001 | Storage server (local dev) |

---

## 🎯 What's Live

✅ **Full Facebook/TikTok-style social platform**
- Posts, likes, reactions (👍❤️😂😮😢😠)
- Comments with nested replies
- Reposting with custom messages
- File uploads (images/videos)
- Offline mode with localStorage sync

✅ **User Directory with Social Graph** (Users page)
- Presence indicators (online/idle/offline)
- Follow / Unfollow (TikTok-red buttons)
- Friend requests (Add → Pending → Accept → Friends)
- Messenger-style chat (bottom-right)
- Profile cards (click any user)
- Verified badges (Administrators)
- "People you may know" suggestions
- Follower/mutual friend counts

✅ **Multi-user support**
- Create users with secure passwords
- Role-based access (Administrator, Analyst, User)
- 2FA / KYC support
- Account locking/unlocking

✅ **Works everywhere**
- ✅ Online (browser, any network, any device)
- ✅ Offline (localStorage mode)
- ✅ Installable PWA (Works standalone on phone/tablet)
- ✅ No server needed (file:// support)

---

## 📝 Test Accounts

| Email | Password | Role | Mode |
|-------|----------|------|------|
| `demo@test.com` | `Demo@Pass123!` | User | Online (via backend) |
| `admin@example.test` | `DemoPass1!` | Administrator | Offline (localStorage) |

**Quick start:** Use the offline account to test immediately (no backend needed).

---

## 🛠️ Tech Stack

**Frontend:** React 19 + Vite + TailwindCSS lookalike (custom CSS)
- HashRouter (works on file://)
- Axios with auto fallback to offline mode
- localStorage social graph (follows, friends, messages, chats)
- PWA with service worker (offline-first)

**Backend:** FastAPI + Python 3.11
- Uvicorn ASGI server
- MySQL 8.4 (post storage, optional)
- Secure session cookies (httpOnly)
- Rate limiting, 2FA (TOTP), KYC

**Deployment:** Cloudflare Tunnel (free, instant HTTPS)
- No credit card needed
- Random public domain every session
- Works from behind NAT/firewall

---

## 🚀 How to Run

### Option 1: **One-Command Start** (Recommended)

```powershell
# Windows PowerShell
powershell -ExecutionPolicy Bypass -File e:\oop\project\launch-public.ps1
```

This starts:
1. Backend API (port 8000)
2. Storage Server (port 8001)  
3. Frontend Preview (port 4173, bound to all interfaces)
4. Cloudflare Tunnel → prints public domain

### Option 2: **Manual Start** (3 Terminal Windows)

**Terminal 1 — Backend API:**
```bash
cd e:\oop\project\backend
python3 -m uvicorn api:app --port 8000 --reload
```

**Terminal 2 — Storage Server:**
```bash
cd e:\oop\project\storage_server
python3 -m uvicorn storage:app --port 8001 --reload
```

**Terminal 3 — Frontend + Tunnel:**
```bash
cd e:\oop\project\frontend
npx vite preview --port 4173 --host 0.0.0.0 --strictPort
```

**Terminal 4 — Cloudflare Tunnel:**
```bash
%USERPROFILE%\cloudflared.exe tunnel --url http://127.0.0.1:4173
```

Watch terminal 4 for the public URL: `https://...trycloudflare.com`

---

## 🔧 Important Config Files

| File | Purpose |
|------|---------|
| `backend/.env` | Backend settings (CORS, session timeout, max request size) |
| `backend/config.py` | Loads .env; auto-adds wildcard CORS in dev mode |
| `frontend/.env.production` | Uses `/api` relative path (routes through tunnel proxy) |
| `frontend/vite.config.js` | Proxy rules for dev & preview modes |
| `storage_server/schema.sql` | MySQL schema (7 tables) |

---

## 📱 Features Breakdown

### Posts & Social
- **Create posts** with text + images/videos
- **Like** posts (shows like count)
- **React** with 6 emoji reactions (👍❤️😂😮😢😠)
- **Comment** with nested replies
- **Like comments** individually
- **Edit/delete** your own comments (admins can delete any)
- **Repost** with custom message
- **Share** (copy link or repost)

### User Directory & Networking
- **Follow/Unfollow** any user (red TikTok-style button)
- **Add Friends** → see mutual friend count
- **Accept/Decline** friend requests
- **View profile card** (click avatar/name) with:
  - Cover photo (gradient per user)
  - Verified badge for admins
  - Post count, followers, following
  - Editable bio (for yourself)
  - Mutual friends count
- **Send message** → Messenger chat opens bottom-right
- **See presence** (online/idle/offline dots)
- **Find people** → "People you may know" cards

### User Management (Admin Only)
- **Create users** with auto-generated secure IDs
- **Search & filter** by name/email/role
- **Unlock** locked accounts
- **View metrics** (total users, admins, unlocked)

### Security
- **Secure passwords** (10+ chars, validated)
- **Session tokens** (30-min default, httpOnly cookies)
- **Rate limiting** (5 login attempts / 60 sec)
- **2FA** (TOTP setup via backend)
- **KYC** (Know Your Customer verification)
- **Encryption at rest** (AES-256-GCM)
- **CORS protection** (check origin on state-changing requests)

### Offline Mode
- **Auto-fallback** when backend is unreachable
- **localStorage sync** for posts, users, social graph
- **Works without internet** (PWA installable)
- **Auto-recover** when backend comes back online
- **Demo offline account** for testing without backend

---

## 🌍 Where Files Are

```
e:\oop\project\
├── backend/              # FastAPI server (port 8000)
│   ├── api.py
│   ├── config.py         # ← CORS config (auto-wildcard in dev)
│   ├── main.py
│   ├── requirements.txt
│   ├── data/             # users.json, posts, activity logs
│   ├── exceptions/
│   ├── services/         # post/user managers
│   ├── users/            # Administrator, Analyst, User classes
│   └── utilities/        # crypto, session, totp, etc.
├── storage_server/       # FastAPI storage (port 8001)
│   ├── storage.py        # Post/comment CRUD, /media mounts
│   ├── database.py       # MySQL layer
│   ├── schema.sql
│   └── crypto.py
├── frontend/             # React Vite (port 4173)
│   ├── dist/             # ← Built app (served by tunnel)
│   ├── src/
│   │   ├── services/socialStore.js   # ← Social graph (localStorage)
│   │   ├── components/
│   │   │   ├── UserList.jsx          # ← Social features (follow, friends, chat)
│   │   │   ├── ProfileCardModal.jsx  # ← Profile card
│   │   │   ├── MessengerModal.jsx    # ← Chat window
│   │   │   └── ...
│   │   ├── pages/Feed.jsx, Clips.jsx, Profile.jsx, etc.
│   │   └── index.css                 # ← All styles (FB theme + social CSS)
│   ├── .env.production       # ← Uses /api relative path
│   ├── vite.config.js        # ← Proxy rules
│   └── package.json
├── launch-public.ps1         # ← One-click launcher
├── launch-public.bat
├── mysql_data/               # MySQL database files
├── README.md
└── docs/
    ├── PROJECT_REPORT.md
    ├── UML_CLASS_DIAGRAM.md
    └── PRESENTATION_SLIDES.md
```

---

## 🔐 Security Notes

- ✅ HTTPS by default (Cloudflare Tunnel)
- ✅ Cookies are HttpOnly (no JavaScript access)
- ✅ CSRF protection (origin check on mutations)
- ✅ Passwords encrypted in transit & at rest
- ✅ Rate limiting on login (5 attempts / 60 sec)
- ✅ Session expiry (30 minutes default)
- ✅ No secrets in frontend code

**For Production:**
- Set `SUMS_ENVIRONMENT=production` in backend/.env
- Set `SUMS_COOKIE_SECURE=true` (requires HTTPS)
- Use a named Cloudflare Tunnel (not quick tunnel)
- Store `SUMS_BOOTSTRAP_KEY` in a secrets manager

---

## 🐛 Troubleshooting

### Domain returns 403 Forbidden
- The tunnel is starting up. Wait 5-10 seconds and refresh.
- Check that frontend (port 4173) is running: `(Invoke-WebRequest http://127.0.0.1:4173).StatusCode`

### Offline mode not working
- Check browser console (F12) for errors
- Verify localStorage is not full: Clear site data & reload
- Try offline account: `admin@example.test / DemoPass1!`

### Backend won't start
- Ensure Python 3.11+ is installed: `python3 --version`
- Check if port 8000 is in use: `netstat -ano | findstr :8000`
- Verify backend/.env exists and has `SUMS_BOOTSTRAP_KEY` set

### Can't upload images/videos
- Check file size (max 25 MB)
- Ensure storage server (port 8001) is running
- Check `/media` directory has write permissions

### MySQL not connecting
- Start MySQL manually: `mysqld.exe --defaults-file="E:\oop\project\storage_server\my.ini" --console`
- Or switch to JSON mode (default): storage_server/storage.py will use `posts.json` instead

---

## 📊 API Endpoints (Backend)

All endpoints behind `/api` proxy in tunnel.

### Auth
- `POST /auth/login` — Login with email & password
- `POST /auth/logout` — Logout

### Users  
- `GET /users` — List all users (admin only)
- `POST /users` — Create user
- `POST /users/{id}/unlock` — Unlock account (admin)

### Posts
- `GET /posts` — Feed (all posts)
- `GET /posts/user/{author_id}` — User's posts
- `POST /posts` — Create post
- `DELETE /posts/{id}` — Delete post
- `POST /posts/{id}/like` — Toggle like
- `POST /posts/{id}/react` — Add reaction (👍❤️😂😮😢😠)
- `POST /posts/{id}/comments` — Add comment
- `POST /posts/{id}/comments/{cid}/like` — Like comment
- `PUT /posts/{id}/comments/{cid}` — Edit comment
- `DELETE /posts/{id}/comments/{cid}` — Delete comment

### Media
- `POST /media/upload` — Upload image/video (multipart/form-data)
- `GET /media/{filename}` — Serve media file

### Security
- `POST /2fa/setup` — Setup 2FA (TOTP)
- `POST /2fa/confirm` — Confirm 2FA setup
- `POST /kyc/submit` — KYC verification

---

## 📚 Documentation

See the `/docs` folder:
- `PROJECT_REPORT.md` — Full spec, architecture, design decisions
- `UML_CLASS_DIAGRAM.md` — Class diagrams for users, posts, services
- `PRESENTATION_SLIDES.md` — Slide notes from presentation

---

## 🎉 What's Next?

Ideas for extension:
- Direct messages (not just in-app chat)
- Notifications (bell icon with real-time updates)
- Search (posts, users, hashtags)
- Trending topics
- Stories (24-hour ephemeral content)
- Live streaming
- Groups/communities
- Badges & achievements
- Dark mode toggle
- Localization (i18n)

---

## 📄 License & Credits

Built as a **secure, offline-first social media platform** with:
- **Frontend:** React 19 + Vite + custom CSS (Facebook theme)
- **Backend:** FastAPI + Python 3.11
- **Database:** MySQL 8.4 (optional, JSON fallback)
- **Deployment:** Cloudflare Tunnel (free)
- **PWA:** Workbox service worker (works offline)
- **Icons:** Lucide React

---

## ✨ Ready to Go!

**Open your public URL in any browser:**.
```
https://november-pub-pmid-ahead.trycloudflare.com
```

**Share the link with anyone — it works everywhere!** 🌍

---

*Generated: 2026-08-17*
*Social Hub v1.0 — Secure, offline-first social platform*
