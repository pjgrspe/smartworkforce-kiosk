# DE WEBNET v2.0 — Setup Guide (New PC)

## How the System Is Structured

There are two types of deployments:

**HQ (Central)** — one machine, runs the main database, manages all branches, handles payroll and reporting.

**Branch** — one machine per branch location, runs its own local database, works offline, syncs to HQ when internet is available.

Each branch laptop/PC is a fully self-contained server. Devices inside that branch (kiosks, HR PCs) connect to it over the local network — not the internet.

---

## What You Need (Both Types)

- Windows 10 or 11
- Node.js 18 or higher — https://nodejs.org
- Git — https://git-scm.com
- PostgreSQL 14 or higher — https://www.postgresql.org/download/windows/

Check your versions:

    node --version
    npm --version
    git --version
    psql --version

---

## Step 1 — Get the Project

Copy the project folder to the machine, or clone from your repo:

    git clone <your-repo-url>
    cd Apollo

---

## Step 2 — Install Dependencies

    npm install
    cd server && npm install
    cd ../web && npm install

---

## Step 3 — Set Up PostgreSQL

Install PostgreSQL if not already installed. Then create a database and user:

Open **psql** or **pgAdmin** and run:

    CREATE USER apollo_user WITH PASSWORD 'choose_a_strong_password';
    CREATE DATABASE apollo_branch OWNER apollo_user;
    GRANT ALL PRIVILEGES ON DATABASE apollo_branch TO apollo_user;

Your connection string will be:

    postgresql://apollo_user:choose_a_strong_password@127.0.0.1:5432/apollo_branch

---

## Step 4 — Environment Files

### HQ Setup (.env)

Create `Apollo/.env`:

    DB_PROVIDER=postgres
    POSTGRES_URL=postgresql://apollo_user:PASSWORD@127.0.0.1:5432/apollo_branch
    POSTGRES_POOL_MAX=15
    POSTGRES_IDLE_TIMEOUT_MS=10000

    HTTP_PORT=3000
    CORS_ORIGIN=http://localhost:5173,http://127.0.0.1:5173

    JWT_SECRET=replace-with-a-long-random-secret
    JWT_EXPIRES_IN=12h

    WS_PORT=8080
    WS_HOST=localhost

    LOG_LEVEL=info
    LOG_FILE_PATH=logs/dewebnet.log
    LOG_MAX_FILES=30
    LOG_MAX_SIZE=10485760

    NODE_ENV=production
    APP_RUNTIME_MODE=CENTRAL

### Branch Setup (.env)

Create `Apollo/.env` on the branch machine. The key differences from HQ are:
- `APP_RUNTIME_MODE=CENTRAL`
- `CENTRAL_SYNC_URL` points to the HQ machine's IP
- `BRANCH_ID` is the UUID of this branch (get it from HQ admin panel after creating the branch there first)
- `SYNC_SHARED_SECRET` must match what is set on HQ

Example:

    DB_PROVIDER=postgres
    POSTGRES_URL=postgresql://apollo_user:PASSWORD@127.0.0.1:5432/apollo_branch
    POSTGRES_POOL_MAX=15
    POSTGRES_IDLE_TIMEOUT_MS=10000

    HTTP_PORT=3000
    CORS_ORIGIN=http://192.168.1.10:5173,http://192.168.1.20:5173

    JWT_SECRET=replace-with-a-long-random-secret
    JWT_EXPIRES_IN=12h

    WS_PORT=8080
    WS_HOST=0.0.0.0

    LOG_LEVEL=info
    LOG_FILE_PATH=logs/dewebnet.log
    LOG_MAX_FILES=30
    LOG_MAX_SIZE=10485760

    NODE_ENV=production
    APP_RUNTIME_MODE=BRANCH
    BRANCH_ID=paste-the-branch-uuid-from-hq-here
    CENTRAL_SYNC_URL=http://192.168.1.5:3000
    SYNC_SHARED_SECRET=same-secret-as-hq
    SYNC_WORKER_INTERVAL_MS=10000
    SYNC_OUTBOX_BATCH_SIZE=50
    SYNC_MAX_RETRIES=5

Replace `192.168.1.5` with the actual LAN IP of your HQ machine, and `192.168.1.10` / `192.168.1.20` with the IPs of the branch devices.

### Web (.env)

Create `Apollo/web/.env`:

**For HQ or local dev:**

    VITE_API_URL=http://localhost:3000/api
    VITE_WS_URL=ws://localhost:8080

**For branch devices connecting over LAN** (build the web app with this, then serve it):

    VITE_API_URL=http://192.168.1.10:3000/api
    VITE_WS_URL=ws://192.168.1.10:8080

Replace `192.168.1.10` with the branch server's static LAN IP.

---

## Step 5 — Run Database Migrations

Run this once on every new machine (HQ and each branch):

    cd Apollo/server
    node scripts/run-postgres-migration.js

This creates all the tables. Safe to run again — it skips existing tables.

---

## Step 6 — Seed Admin Accounts

Run this once on every new machine:

    node scripts/seed-postgres-admin.js

Creates: default tenant, Head Office branch, and two admin accounts.

Default password for all accounts: `admin123`

| Role         | Email                    |
|--------------|--------------------------|
| super_admin  | admin@dewebnet.com       |
| client_admin | clientadmin@dewebnet.com |

---

## Step 7 — Seed Mock Employee Data (Optional, HQ only)

Only needed for testing. Adds 5 demo employees with ~30 workdays of attendance:

    node scripts/seed-mock-data.js

To reset:

    node scripts/seed-mock-data.js --clean
    node scripts/seed-mock-data.js

---

## Step 8 — Start the App

Open two terminals.

**Terminal 1 — API server:**

    cd Apollo/server
    npm run dev

**Terminal 2 — Web app:**

    cd Apollo/web
    npm run dev

URLs:
- Web: http://localhost:5173
- API health check: http://localhost:3000/api/health

---

## Step 9 — Setting Up a New Branch (Full Process)

Do these steps **in order**:

### On HQ first:
1. Log in as super_admin
2. Go to **Branches** and create the new branch (e.g. "Makati Branch")
3. Note the Branch ID — you can find it in the URL or ask Patrick to get it from the database

### On the branch machine:
1. Install Node.js and PostgreSQL
2. Copy the project folder
3. Set up PostgreSQL and create a database (Step 3 above)
4. Create `.env` using the **Branch Setup** template (Step 4 above)
5. Fill in `BRANCH_ID` with the UUID from HQ
6. Set `CENTRAL_SYNC_URL` to the HQ machine's IP and port
7. Run migrations: `node scripts/run-postgres-migration.js`
8. Run admin seed: `node scripts/seed-postgres-admin.js`
9. Start the server: `npm run dev` in server folder

### Build and serve the web app for branch devices:
1. Set `VITE_API_URL` in `web/.env` to the branch server's LAN IP
2. Build: `cd web && npm run build`
3. Serve the built files — simplest option on Windows is to install `serve`:

        npm install -g serve
        serve -s web/dist -l 5173

4. All devices on the branch network open `http://192.168.1.10:5173` in their browser

### Verify sync is working:
- Open http://localhost:3000/api/sync/status on the branch machine
- It should show the outbox depth and last sync time

---

## Payroll Notes

- Employees must be assigned to the **same branch** as the payroll run
- Attendance data must exist for the cutoff period
- Payroll is run and managed from HQ, not branch machines

---

## Troubleshooting

### Cannot connect to PostgreSQL

    Error: connect ECONNREFUSED 127.0.0.1:5432

Fix: Make sure PostgreSQL is running. In Windows Services, look for "postgresql-x64-14" and start it. Or run:

    pg_ctl start -D "C:\Program Files\PostgreSQL\14\data"

### Port 3000 already in use

Fix: Change `HTTP_PORT` in `.env` and update `VITE_API_URL` in `web/.env` to match.

### Branch not syncing to HQ

Check:
- `CENTRAL_SYNC_URL` in branch `.env` is reachable from the branch machine (ping or browser test)
- `BRANCH_ID` matches the UUID in HQ's branches table
- `SYNC_SHARED_SECRET` matches on both sides
- HQ server is running

### Kiosk says "Invalid company code"

Fix: Enter `DEWEBNET` (all caps) on the kiosk setup screen.

### Employees show "Unassigned Branch"

Fix: Edit each employee and assign them to the correct branch.

---

## Transfer Checklist

### HQ machine
- [ ] Node.js 18+ installed
- [ ] PostgreSQL installed and running
- [ ] Database and user created
- [ ] Project folder copied
- [ ] `Apollo/.env` created (`APP_RUNTIME_MODE=CENTRAL`)
- [ ] `Apollo/web/.env` created
- [ ] `npm install` run in root, server, and web
- [ ] Migrations run
- [ ] Admin seed run
- [ ] Server and web started
- [ ] Login verified

### Each branch machine
- [ ] Node.js 18+ installed
- [ ] PostgreSQL installed and running
- [ ] Database and user created
- [ ] Project folder copied
- [ ] Branch created on HQ first, `BRANCH_ID` noted
- [ ] `Apollo/.env` created (`APP_RUNTIME_MODE=BRANCH`, `BRANCH_ID`, `CENTRAL_SYNC_URL`, `SYNC_SHARED_SECRET`)
- [ ] Migrations run
- [ ] Admin seed run
- [ ] Server started
- [ ] Web app built with branch LAN IP in `VITE_API_URL`
- [ ] Web app served and accessible from branch devices
- [ ] Sync status verified at `/api/sync/status`
