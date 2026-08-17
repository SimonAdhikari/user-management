# Social Hub — Run on Any Device (Offline-First PWA)

Social Hub is now a **Progressive Web App (PWA)**. Once loaded in a browser, it
installs itself and keeps working **without any server running** — no Python
backend, no MySQL, no internet connection required.

## How it works

| Layer | What it does |
|---|---|
| **Service worker** (`dist/sw.js`) | Precaches the entire app shell (HTML, JS, CSS, icons — 19 files). After the first visit, the app loads from cache even with zero network. |
| **Web manifest** (`dist/manifest.webmanifest`) | Makes the app installable on desktop & mobile with its own icon, name, and standalone window. |
| **Offline data layer** (`src/services/mockApi.js`) | When the backend is unreachable, the app automatically switches to **offline mode**: login, users, posts, comments, and likes all run against `localStorage`. |
| **Auto-reconnect** (`src/services/api.js`) | Probes the backend every 8 s. The moment a server comes back, the app switches to online mode transparently. |

**Offline demo account** (seeded automatically):
- Email: `admin@example.test`
- Password: `DemoPass1!`
- Role: Administrator

## Option A — Zero setup: double-click `index.html`

The simplest way to run Social Hub on any device — no server, no install, no
internet:

1. Build once on the machine that has the code:
   ```
   cd frontend
   npm run build
   ```
2. Copy the whole `frontend/dist/` folder to the other device (USB, zip, email…).
3. **Double-click `dist/index.html`** — it opens in the browser and runs fully
   in offline mode (the app detects the `file://` protocol and uses the local
   data store automatically).
4. Sign in with the offline demo account: `admin@example.test` / `DemoPass1!`.

> Notes for `file://` mode: routing uses URL hashes (`#/feed`, `#/clips`),
> posts/users are stored in the browser's localStorage, and the service
> worker / install prompt are only available when served over http(s).

## Option B — Serve the built app (enables install + service worker)

1. Copy `frontend/dist/` to the other device.
2. Serve it with any static file server. Examples:
   ```
   # Python (installed on most machines)
   python -m http.server 4173 --directory dist

   # Node
   npx serve dist
   ```
3. Open `http://localhost:4173` in Chrome/Edge.
4. **First visit only:** the service worker caches everything. After that the
   app works with the network cable unplugged.
5. Click the **Install app** button in the sidebar (or the browser's install
   icon in the address bar) to install it as a standalone app.

> Tip: to make it reachable from other devices on your LAN, serve with
> `python -m http.server 4173 --directory dist --bind 0.0.0.0` and open
> `http://<your-ip>:4173`. HTTPS (or `localhost`) is required for the service
> worker + install prompt; on LAN use a tool like `mkcert` or a reverse proxy
> with TLS.

## Option C — Host it once, use it everywhere

Deploy `frontend/dist/` to any static host (GitHub Pages, Netlify, Vercel,
nginx, Caddy…). Every device that visits the URL gets an installable,
offline-capable app. No backend needed for the offline experience.

## Option D — Full experience (online mode)

If you also want real multi-user data, run the servers on one machine:
```
cd backend        && python main.py        # port 8000
cd storage_server && python storage.py     # port 8001
```
Then point the frontend at it via `frontend/.env` (`VITE_API_URL`) and rebuild.
Any device that can reach the backend uses online mode; devices that can't
fall back to offline mode automatically.

## Verifying the PWA

After building, `frontend/dist/` must contain:
- `sw.js` + `workbox-*.js` — service worker
- `manifest.webmanifest` — install manifest
- `pwa-192x192.png`, `pwa-512x512.png`, `pwa-maskable-512x512.png` — icons
- `index.html`, `assets/` — app shell

Check in Chrome DevTools:
- **Application → Manifest** shows "Social Hub — Secure Social Platform".
- **Application → Service Workers** shows the worker as *activated and running*.
- **Lighthouse → PWA** passes installability.

## Regenerating icons

Icons are generated from the brand logo palette by a script:
```
cd frontend
python scripts/generate_icons.py
```
Outputs: `pwa-192x192.png`, `pwa-512x512.png`, `pwa-maskable-512x512.png`,
`apple-touch-icon.png`, `favicon-64.png` into `public/`.
