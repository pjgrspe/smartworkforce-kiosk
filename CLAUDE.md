# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**SmartWorkforce** (formerly DE WEBNET) — Facial recognition attendance management system. Central server hosts the API and database; branch PCs run the kiosk locally with offline punch buffering.

## Commands

### Root (runs all services together)
```bash
npm run install:all       # Install all dependencies (Node + Python)
npm run dev               # Start server + web concurrently
npm run dev:ai            # Start Python AI engine separately
npm run build:web         # Build web for production
npm start                 # Start all services via PM2
npm run logs              # View PM2 logs
```

### Server (`cd server`)
```bash
npm run dev               # Start with nodemon (port 3001 in prod, 3000 local dev)
npm test                  # Run full API test suite
npm run test:sync-smoke   # Run sync smoke tests
npm run db:migrate:postgres       # Run all migrations
npm run db:migrate:postgres:core  # Core schema only
```

### Kiosk Service (`cd kiosk-service`)
```bash
cp .env.example .env      # Configure before first run
npm install
npm start                 # Start on port 4000
```

### Web (`cd web`)
```bash
npm run dev               # Vite dev server (port 5173)
npm run lint              # ESLint
npm run build             # Production build
```

### AI (`cd ai`)
```bash
python main.py            # Start facial recognition engine
pip install -r requirements.txt
```

## Architecture

### Connectivity model
| Interface | Requires internet? | Connects to |
|---|---|---|
| Management UI (admin, reports, corrections) | **Yes** | Central server |
| Kiosk (face punch-in/out) | **No** — works offline | Local kiosk-service on port 4000 |

### Service Layout
```
server/          → Express REST API (port 3001 on prod) + WebSocket (port 8081)
web/             → Vite/React SPA — admin panel + kiosk UI
kiosk-service/   → Standalone offline kiosk service (port 4000) for branch PCs
ai/              → Python facial recognition engine (OpenCV + face_recognition)
nginx/           → nginx config with security hardening (smartworkforce.conf)
```

### Central Server (51.79.255.147)
- **nginx** on port 80 → reverse proxy to `apollo-central` (port 3001, internal only)
- **PostgreSQL** database: `SmartWorkforce` (user: `smartworkforce_user`)
- **PM2** process name: `apollo-central`
- Old app (`de-webnet-central`) still runs on port 3000 — do not touch its database (`hris_db` / `postgres`)

### Kiosk Offline Flow (branch PC)
1. `kiosk-service` starts and loads employee/face-encoding cache from local SQLite (`kiosk-service/data/kiosk.db`)
2. Background sync worker pulls latest encodings from central every 10 min
3. Face match happens in the browser via face-api.js against cached descriptors
4. Punches are written to local `punch_queue` table immediately (employee name/info shown from cache)
5. Background worker flushes queue to central every 30s when online; retries with backoff when offline

### Server Structure
- `server/routes/` — Express route handlers (one file per domain)
- `server/repositories/` — Repository pattern abstracting all DB queries (one folder per domain)
- `server/services/` — Business logic (payroll engine, time engine, sync worker, audit logger)
- `server/middleware/auth.js` — JWT verification + `authorize()` role guard
- `server/config/postgres.js` — pg.Pool setup with retry logic
- `server/config/runtime.js` — CENTRAL vs BRANCH mode detection
- `server/db/migrations/` — Sequential SQL migrations (`0001_` → `0009_`)

### Web Structure
- `web/src/contexts/` — Auth, Theme, WebSocket React contexts
- `web/src/pages/` — Route-level components; `/kiosk` is full-screen check-in, `/admin/*` is management
- `web/src/components/` — Shared UI components
- `web/vite.config.js` — API proxy + vendor code-splitting (`@` alias → `./src`)

### Kiosk Service Structure (`kiosk-service/`)
- `index.js` — Express server + WebSocket server, serves `kiosk-service/public/` static files
- `db.js` — SQLite via `better-sqlite3` (tables: `employee_cache`, `punch_queue`, `recent_punches`, `sync_meta`)
- `sync.js` — Background worker: pushes pending punches, pulls employee/encoding updates
- `routes/kiosk.js` — Mirrors central `/api/kiosk/*` endpoints exactly

### Key API Routes
| Route | Notes |
|---|---|
| `POST /api/auth/login` | Returns JWT |
| `GET /api/kiosk/employees` | **No auth** — returns employees + face descriptors |
| `POST /api/kiosk/punch` | **No auth** — records time punch |
| `GET /api/health` | Health check |

## Database

### SmartWorkforce (production — central server)
PostgreSQL 16 on `127.0.0.1:5432`. Migrations are plain SQL files run by `server/scripts/run-postgres-migration.js`. The script loads `.env` from two directories up (`../../.env`), so run from `server/` after placing `.env` there.

```bash
# Run all migrations (from server/)
node -e "require('dotenv').config({path:'.env'}); const {execSync}=require('child_process'); require('fs').readdirSync('db/migrations').sort().forEach(f=>execSync('node scripts/run-postgres-migration.js '+f,{stdio:'inherit',env:process.env}))"
```

**Important:** Special characters in passwords (`@`, `!`, `#`) must be URL-encoded in `POSTGRES_URL`. `@`→`%40`, `!`→`%21`, `#`→`%23`.

### SQLite (kiosk-service)
`better-sqlite3` at `kiosk-service/data/kiosk.db`. Auto-created on first start. No migrations needed.

### Existing DB (do not touch)
The old app (`de-webnet-central`) uses databases `postgres` / `hris_db` with user `hris_admin`. These must not be modified.

## nginx (production)

Config at `nginx/smartworkforce.conf`, installed at `/etc/nginx/sites-available/smartworkforce`.

Rate limiting zones (defined in `/etc/nginx/nginx.conf` `http{}` block):
- `auth` — 5 req/min (login endpoint)
- `kiosk` — 10 req/s (face punch)
- `api` — 30 req/s (all other API)

Security features: hidden server tokens, `X-Frame-Options`, `X-Content-Type-Options`, SQL injection pattern blocking, blocks `.php`/`.asp`/hidden files.

```bash
# Test and reload nginx on server
sudo nginx -t && sudo systemctl reload nginx
```

## Kiosk Service Deployment (branch PC)

```bash
# 1. Clone repo or copy the full project to the branch PC
# 2. Install deps
cd kiosk-service && npm install
cd ../web && npm install

# 3. Configure
cd ../kiosk-service
cp .env.example .env
# Edit .env: set CENTRAL_URL=http://51.79.255.147 and TENANT_CODE=<your code>

# 4. One-command setup: downloads face-api models + builds kiosk web app
npm run setup
# This runs: download-models.js (puts weights in public/models/)
# Then:      vite build:kiosk (outputs to kiosk-service/public/ with VITE_MODEL_URL=/models)

# 5. Start
npm start
# Kiosk UI: http://localhost:4000
# WebSocket: ws://localhost:4001
```

**Why `npm run setup` is needed:** face-api.js model weights (~8 MB) must be available
locally so the kiosk works offline. `download-models.js` fetches them once from jsDelivr
CDN into `kiosk-service/public/models/`. The kiosk build then bakes in `VITE_MODEL_URL=/models`
so the browser loads weights from the local kiosk-service instead of the internet.

To run as a Windows service, use PM2:
```bash
npm install -g pm2
pm2 start kiosk-service/index.js --name smartworkforce-kiosk
pm2 startup && pm2 save
```

## Prerequisites

- Node.js 18+, npm 9+
- Python 3.8+ (AI engine only)
- **Visual C++ Build Tools** — required to compile `dlib` for face_recognition
- Central server: PostgreSQL 16, nginx, PM2
