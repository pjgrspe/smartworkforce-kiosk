# Branch Deployment Guide

Date: 2026-03-16
Status: Pilot design ready, not yet full production rollout

## What a Branch Deployment Looks Like

Each branch should run as a small local site, not as a set of browsers talking directly to the cloud.

### Per Branch
- 1 local branch server machine on the branch LAN
- 1 local PostgreSQL database on that machine
- 1 local Apollo backend running in `BRANCH` mode
- 1 or more branch devices using the local backend over LAN
  - kiosk PC(s)
  - HR/admin PC(s)
  - manager PC(s)

### Central Site
- 1 central Apollo backend running in `CENTRAL` mode
- 1 central PostgreSQL database
- central sync endpoints reachable from branches

## Network Shape

### Normal operation
1. Branch devices call the branch API over local network.
2. Branch API writes to branch-local PostgreSQL.
3. Branch sync worker pushes local changes to central.
4. Branch sync worker pulls central changes back down.

### Internet outage at branch
1. Branch devices keep using the local branch API.
2. Writes continue into branch-local PostgreSQL.
3. Sync outbox grows locally.
4. When internet returns, the branch sync worker drains the queue.

That is the actual offline-first model this migration is aiming for.

## What Runs Where

### Central server
- `DB_PROVIDER=postgres`
- `APP_RUNTIME_MODE=CENTRAL`
- exposes `/api/sync/events`
- exposes `/api/sync/events/pull`
- exposes `/api/sync/status`

### Branch server
- `DB_PROVIDER=postgres`
- `APP_RUNTIME_MODE=BRANCH`
- local PostgreSQL is the write target
- sync worker reads `CENTRAL_SYNC_URL`
- sync worker uses `BRANCH_ID`
- sync worker authenticates with `SYNC_SHARED_SECRET`

## Example Branch Environment

This is what a branch `.env` would roughly look like:

```env
NODE_ENV=production

DB_PROVIDER=postgres
APP_RUNTIME_MODE=BRANCH

HTTP_PORT=3000
CORS_ORIGIN=http://192.168.1.10:5173,http://192.168.1.20:5173

POSTGRES_URL=postgresql://apollo_branch_user:strong_password@127.0.0.1:5432/apollo_branch_001
POSTGRES_POOL_MAX=15
POSTGRES_IDLE_TIMEOUT_MS=10000

CENTRAL_SYNC_URL=https://central.example.com
BRANCH_ID=2e3b2d2c-0d34-4b16-92dd-branch001
SYNC_SHARED_SECRET=replace_with_long_random_secret
SYNC_WORKER_INTERVAL_MS=10000
SYNC_OUTBOX_BATCH_SIZE=50
SYNC_MAX_RETRIES=5

JWT_SECRET=branch_local_jwt_secret
WS_HOST=0.0.0.0
WS_PORT=8080
```

## Example Device Setup Inside a Branch

### Branch server machine
- Windows mini PC or small office server
- static LAN IP, for example `192.168.1.10`
- runs PostgreSQL
- runs Apollo server
- optionally runs the built web app through a local web server or reverse proxy

### Kiosk machine
- browser opens the kiosk app from the branch server
- calls `http://192.168.1.10:3000/api`
- does not need direct internet to keep punching

### HR/Admin machine
- browser opens the admin web app from the branch server
- same API target: `http://192.168.1.10:3000/api`
- can review branch activity even if WAN is down

## Deployment Sequence for One Branch

1. Create the branch in central first and assign a permanent `BRANCH_ID`.
2. Prepare the branch server machine with Node.js and PostgreSQL.
3. Create a branch-local PostgreSQL database.
4. Run the PostgreSQL migrations against the branch-local database.
5. Configure branch `.env` with `DB_PROVIDER=postgres` and `APP_RUNTIME_MODE=BRANCH`.
6. Set `CENTRAL_SYNC_URL`, `BRANCH_ID`, and `SYNC_SHARED_SECRET`.
7. Build the web app with `VITE_API_URL` pointing to the branch API.
8. Start the backend on the branch server.
9. Start the web app on the branch server or publish the built assets locally.
10. Point kiosk/admin devices at the branch server URL.
11. Test online sync.
12. Test offline behavior by disconnecting WAN and confirming local writes still work.
13. Reconnect WAN and confirm queue drain via `/api/sync/status`.

## What Users at the Branch Experience

### While online
- punches appear locally immediately
- admin views use local data
- central catches up through sync

### While offline
- punches should still succeed because they hit the branch server
- admin updates should still save locally
- dashboard can show pending outbox and sync lag

### After reconnection
- branch pushes unsent events to central
- branch pulls newer central events
- checkpoints advance

## How the Web App Should Be Served Per Branch

There are two sane options.

### Option A: Local branch web app build
- build the web app specifically for the branch
- set `VITE_API_URL` to the branch API URL
- set `VITE_WS_URL` to the branch WebSocket URL
- host the built web app on the branch server

This is the cleaner offline-first option.

### Option B: Central web app with branch-specific API target
- less ideal for offline-first
- browser still has to reach wherever the web bundle is hosted
- if WAN is down, app delivery becomes a problem unless already cached

For real branch offline operation, Option A is the right model.

## Practical Example

For Branch 001:

- Branch server IP: `192.168.10.5`
- Branch API: `http://192.168.10.5:3000/api`
- Branch WebSocket: `ws://192.168.10.5:8080`
- Branch web app: `http://192.168.10.5:4173` or served behind a local reverse proxy
- Central sync target: `https://central.example.com`

All branch devices talk only to `192.168.10.5`.

## What Is Already Ready in This Repo

- provider switch between Mongo and PostgreSQL
- runtime mode switch between `CENTRAL` and `BRANCH`
- PostgreSQL sync tables
- sync outbox/inbox/checkpoints/dead-letter
- central sync routes
- dashboard sync observability tiles
- PostgreSQL-backed kiosk, tenant, holiday, salary, attendance, correction, payroll, employee, branch, department, schedule, and user runtime paths

## Current Gaps Before Broad Branch Rollout

These matter.

### Branch-local web hosting is not yet formalized
The web app can target a branch API, but branch packaging and serving conventions are not yet locked down.

### Pilot automation is not yet packaged
There is no single installer yet for “install PostgreSQL + run migrations + set branch env + serve web app + register as service”.

## Recommended Real Rollout Model

### Phase 1: one-branch pilot
- 1 branch server
- 1 kiosk
- 1 admin PC
- validate offline punches and sync catch-up

### Phase 2: hardened branch package
- create a repeatable branch installer
- add service management
- add backups for branch-local PostgreSQL
- add local health checks and watchdog restart

### Phase 3: wider deployment
- deploy branch by branch
- monitor outbox depth, inbound failures, and dead-letter counts

## Minimum Acceptance Test for a Branch

1. With internet on, create attendance and employee updates at the branch.
2. Confirm records appear locally immediately.
3. Disconnect internet.
4. Repeat punches and one admin change.
5. Confirm branch app still works.
6. Confirm `/api/sync/status` shows queued work.
7. Restore internet.
8. Confirm outbox drains and central data catches up.

## Bottom Line

A branch deployment should look like a small self-contained local site.

The branch is not just “another client browser.” It is:
- a local API
- a local PostgreSQL database
- local user devices on LAN
- a sync worker that talks to central when available

That is the model your current migration work is moving toward.