# Branch PC Deployment Guide

This document outlines the step-by-step process for deploying the Apollo system on a branch-level PC.

---

## Prerequisites

Install these on the branch PC before proceeding with the deployment:

- **Node.js v18+** — https://nodejs.org
- **PostgreSQL v14+** — https://www.postgresql.org/download/windows/
  - During installation, set a password for the `postgres` superuser and keep it for later use.
  - Default port: 5432
- **Git** (Optional — you may also simply copy the project folder directly)

### Important: PowerShell PATH Fix

After installing Node.js and PostgreSQL, their commands may not be recognized in PowerShell.
Run these two lines at the start of every new PowerShell session before doing anything else:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
$env:PATH += ";C:\Program Files\nodejs"
```

---

## 1. Copy the Project

Copy the entire Apollo folder to the branch PC. Recommended path:

```
C:\DEX\Apollo\
```

---

## 2. Set Up PostgreSQL

psql is not automatically in PATH. Open it using the full path:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres
```

Enter the password you set during PostgreSQL installation. Then run:

```sql
CREATE DATABASE apollo_branch;
CREATE USER hris_admin WITH PASSWORD 'your-strong-password-here';
GRANT ALL PRIVILEGES ON DATABASE apollo_branch TO hris_admin;
\c apollo_branch
GRANT ALL ON SCHEMA public TO hris_admin;
\q
```

---

## 3. Configure the Root .env File

Create a file named `.env` in the `Apollo\` root directory (not inside `server\`):

```env
# ── DATABASE ────────────────────────────────
DB_PROVIDER=postgres
POSTGRES_URL=postgresql://hris_admin:your-strong-password-here@127.0.0.1:5432/apollo_branch
POSTGRES_POOL_MAX=15
POSTGRES_IDLE_TIMEOUT_MS=10000
POSTGRES_POOL_MIN=2
POSTGRES_CONN_TIMEOUT_MS=5000
POSTGRES_STATEMENT_TIMEOUT=30000

# ── SERVER ──────────────────────────────────
HTTP_PORT=3000
CORS_ORIGIN=http://localhost:5173,http://127.0.0.1:5173

# ── JWT ─────────────────────────────────────
# Must match HQ's JWT_SECRET exactly
JWT_SECRET=xK9mP2$vL7@nQ4&wR8!jT5^hY3*cF6%bN1@dZ0
JWT_EXPIRES_IN=12h

# ── WEBSOCKET ───────────────────────────────
WS_PORT=8080
WS_HOST=localhost

# ── SYNC ────────────────────────────────────
SYNC_RETRY_DELAY_MS=5000
SYNC_MAX_RETRIES=5
SYNC_DEAD_LETTER_ALARM_THRESHOLD=5
CONNECTIVITY_CHECK_INTERVAL_MS=10000
SYNC_WORKER_INTERVAL_MS=10000
SYNC_OUTBOX_BATCH_SIZE=50

# Your HQ server URL (the VPS)
CENTRAL_SYNC_URL=http://51.79.255.147

# This branch's UUID — fill in after Step 7
BRANCH_ID=

# Must match HQ's SYNC_SHARED_SECRET exactly
SYNC_SHARED_SECRET=ce3dff2954e94cebda3e2f30cfb893ffd23a89cfc29729b8c57fbc4b45e7fdce

# ── LOGGING ─────────────────────────────────
LOG_LEVEL=info
LOG_FILE_PATH=logs/dewebnet.log
LOG_MAX_FILES=30
LOG_MAX_SIZE=10485760

# ── ENVIRONMENT ─────────────────────────────
NODE_ENV=production
APP_RUNTIME_MODE=BRANCH
```

> **Important:** `JWT_SECRET` and `SYNC_SHARED_SECRET` must be identical to the values configured on the HQ server.

---

## 4. Configure the Web .env

Create a file named `.env` in the `Apollo\web\` directory:

```env
VITE_API_URL=http://localhost:3000/api
VITE_WS_URL=ws://localhost:8080
```

---

## 5. Install Dependencies

Open PowerShell, apply the PATH fix from the Prerequisites section, then navigate to the Apollo root and run:

```powershell
cd "C:\DEX\Apollo"
npm install
cd server; npm install; cd ..
cd web; npm install; cd ..
```

> Run each `cd` and `npm install` line separately if chaining causes issues.

---

## 6. Run Database Migrations

```powershell
cd "C:\DEX\Apollo\server"
node scripts/run-postgres-migration.js 0001_core_postgres.sql
node scripts/run-postgres-migration.js 0002_sync_checkpoints.sql
node scripts/run-postgres-migration.js 0003_sync_events.sql
node scripts/run-postgres-migration.js 0004_sync_failure_handling.sql
node scripts/run-postgres-migration.js 0005_domain_tables.sql
node scripts/run-postgres-migration.js 0006_employee_documents.sql
node scripts/run-postgres-migration.js 0007_reports_to.sql
node scripts/run-postgres-migration.js 0008_production_hardening.sql
node scripts/run-postgres-migration.js 0009_holidays_unique.sql
```

Each line should print: `Applied migration: <filename>`

---

## 7. Register the Branch on HQ

The HQ web UI is not publicly accessible. Branch registration must be done by SSHing directly into the HQ server.

### SSH into HQ

The HQ server requires a private key file. The key is stored at:

```
C:\Users\<you>\.ssh\keys\vps-key-abg.ppk
```

Convert it to OpenSSH format first (one-time setup):
1. Open **PuTTYgen**
2. Click **Load** → select `vps-key-abg.ppk`
3. Enter passphrase if prompted: `aquinobistrogroup11111`
4. Click **Conversions** → **Export OpenSSH key**
5. Save as `vps-key-abg.pem` in the same folder

Then SSH in:

```powershell
ssh -i "C:\Users\<you>\.ssh\keys\vps-key-abg.pem" -p 54833 xdgamboa@51.79.255.147
```

### Register the branch in the HQ database

Once inside the server, open psql:

```bash
psql -U hris_admin -d postgres -h 127.0.0.1
```

Check existing tenants to get the correct `tenant_id`:

```sql
SELECT id, name FROM tenants;
```

Insert the new branch (replace name and code as needed):

```sql
INSERT INTO branches (id, tenant_id, name, code, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'a10cac9c-5907-4509-ad53-2744efae2e07',
  'Your Branch Name',
  'YOURCODE',
  NOW(),
  NOW()
)
RETURNING id;
```

Copy the UUID returned. Then exit:

```sql
\q
```

```bash
exit
```

### Fill in BRANCH_ID

Back on the branch PC, open `Apollo\.env` and set:

```env
BRANCH_ID=paste-the-uuid-here
```

---

## 8. Seed the Admin Account and Fix Local UUIDs

### Run the admin seed

```powershell
cd "C:\DEX\Apollo\server"
node scripts/seed-postgres-admin.js
```

This creates the local tenant, a default Head Office branch, and the admin accounts.
Default login password: `admin123`

| Role | Email |
|---|---|
| super_admin | admin@dewebnet.com |
| client_admin | clientadmin@dewebnet.com |

### Fix tenant and branch UUIDs to match HQ

The seed script generates random UUIDs for the tenant and Head Office branch. These must match HQ's UUIDs exactly for sync to work. Run the following in psql:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U hris_admin -d apollo_branch -h 127.0.0.1
```

First, find the locally generated tenant UUID:

```sql
SELECT id FROM tenants WHERE code = 'DEWEBNET';
```

Then run this block (replace `<local-tenant-id>` with the UUID from above):

```sql
BEGIN;

-- Insert HQ's tenant UUID
INSERT INTO tenants (id, name, code, contact_email, is_active)
VALUES ('a10cac9c-5907-4509-ad53-2744efae2e07', 'DE WEBNET', 'DEWEBNET_TMP', 'admin@dewebnet.com', TRUE);

-- Re-point all local records to the correct tenant
UPDATE branches SET tenant_id = 'a10cac9c-5907-4509-ad53-2744efae2e07' WHERE tenant_id = '<local-tenant-id>';
UPDATE users SET tenant_id = 'a10cac9c-5907-4509-ad53-2744efae2e07' WHERE tenant_id = '<local-tenant-id>';

-- Remove old mismatched tenant
DELETE FROM tenants WHERE id = '<local-tenant-id>';

-- Fix the code back
UPDATE tenants SET code = 'DEWEBNET' WHERE id = 'a10cac9c-5907-4509-ad53-2744efae2e07';

COMMIT;
```

Now fix the Head Office branch UUID. Find the local HO branch UUID:

```sql
SELECT id FROM branches WHERE code = 'HO';
```

Then run (replace `<local-ho-branch-id>` with the UUID from above):

```sql
BEGIN;

UPDATE users SET branch_id = NULL WHERE branch_id = '<local-ho-branch-id>';
DELETE FROM sync_outbox WHERE branch_id = '<local-ho-branch-id>';
DELETE FROM sync_inbound_failures WHERE branch_id = '<local-ho-branch-id>';
DELETE FROM sync_dead_letter WHERE branch_id = '<local-ho-branch-id>';
DELETE FROM sync_checkpoints WHERE branch_id = '<local-ho-branch-id>';

UPDATE branches SET id = 'cf1931a2-d710-424c-9eea-853d64d637e3'
WHERE id = '<local-ho-branch-id>';

UPDATE users SET branch_id = 'cf1931a2-d710-424c-9eea-853d64d637e3'
WHERE branch_id IS NULL;

COMMIT;
```

Exit psql:

```sql
\q
```

> **Why this is needed:** The seed script generates random UUIDs for the tenant and branches. Sync events from HQ carry HQ's UUIDs. If they don't match locally, all synced records fail with foreign key constraint errors and land in the dead letter queue.

---

## 9. Requeue Any Dead Letter Events

If the app was started before the UUID fix, some events may have landed in the dead letter queue. Requeue them:

```powershell
cd "C:\DEX\Apollo\server"
node scripts/requeue-dead-letter.js
```

---

## 10. Seed Mock Data (Optional)

To add demo employees and attendance data for testing:

```powershell
cd "C:\DEX\Apollo\server"
node scripts/seed-mock-data.js
```

To reset and re-seed:

```powershell
node scripts/seed-mock-data.js --clean
node scripts/seed-mock-data.js
```

> This script looks up the tenant by code `DEWEBNET` and the branch by code `HO`. It will work correctly only after the UUID fix in Step 8 is complete.

---

## 11. Start the Branch

From the `Apollo\` root directory:

```powershell
cd "C:\DEX\Apollo"
npm run dev
```

This starts both the server (port 3000) and the web UI (port 5173).

Open the branch web UI at: http://localhost:5173

---

## 12. Verify Sync is Working

Log in as `clientadmin@dewebnet.com` (password: `admin123`) and verify:

- The branch appears in the Branches list (synced from HQ)
- Employees created on HQ appear locally within ~10 seconds
- Attendance logged on the kiosk appears on HQ within ~10 seconds

Check sync health:

```
http://localhost:3000/api/health
```

Expected response:

```json
{"status":"ok","provider":"postgres","mode":"BRANCH"}
```

---

## Everyday Use

To start the system daily, run from the `Apollo\` folder:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
$env:PATH += ";C:\Program Files\nodejs"
npm run dev
```

**Kiosk URL:** http://localhost:5173/kiosk?tenant=DEWEBNET

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `npm` not recognized | Run the PATH fix at the top of this guide before using npm |
| `psql` not recognized | Use the full path: `& "C:\Program Files\PostgreSQL\18\bin\psql.exe"` |
| Script cannot be loaded (execution policy) | Run `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` |
| JWT_SECRET errors on login | Ensure the secret matches HQ exactly |
| Cannot login with admin accounts | Default password is `admin123` |
| Employees not syncing | Check `BRANCH_ID` and `CENTRAL_SYNC_URL` in `.env` |
| SYNC_SHARED_SECRET mismatch | Must be identical on both branch and HQ |
| Dead letter queue filling up | Tenant/branch UUIDs don't match HQ — follow the UUID fix in Step 8, then run `node scripts/requeue-dead-letter.js` |
| `sync_inbound_failures_branch_id_fkey` FK error | Branch record missing locally — follow Step 8 |
| `schedules_tenant_id_fkey` or `departments_tenant_id_fkey` FK error | Tenant UUID mismatch — follow the tenant UUID fix in Step 8 |
| SSH permission denied (publickey) | Ensure you converted the .ppk to .pem using PuTTYgen before connecting |
| Face not detected after enrollment | Wait 10s for sync or re-enroll locally |
