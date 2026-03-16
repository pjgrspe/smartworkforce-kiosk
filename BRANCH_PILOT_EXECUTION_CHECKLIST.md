# Branch Pilot Execution Checklist (Real Two-Node)

Date: 2026-03-16
Purpose: Run one real branch pilot against a separate central server (not localhost loopback).

## Scope
- 1 central API node in CENTRAL mode
- 1 branch API node in BRANCH mode
- 1 branch-local PostgreSQL
- 1 kiosk client and 1 admin client on branch LAN

## Exit Criteria (Pilot Pass)
- Branch writes succeed while WAN is disconnected.
- Outbox grows during outage and drains after reconnection.
- Pull path works for branch (`/api/sync/events/pull`).
- `inbound_failures = 0` and `dead_letter = 0` during pilot window.

## 1) Preflight Inputs
Fill these first:
- `CENTRAL_API_URL`: ____________________
- `BRANCH_API_URL`: _____________________
- `BRANCH_ID`: __________________________
- `SYNC_SHARED_SECRET`: _________________
- Branch LAN kiosk URL: _________________
- Branch LAN admin URL: _________________

## 2) Central Node Config
Set on central API host:

```env
DB_PROVIDER=postgres
APP_RUNTIME_MODE=CENTRAL
POSTGRES_URL=<central-postgres-url>
SYNC_SHARED_SECRET=<same-shared-secret>
HTTP_PORT=3000
```

Start and verify:

```bash
npm run dev
curl http://localhost:3000/api/health
```

Expected:
- `provider = postgres`
- `mode = CENTRAL`

## 3) Branch Node Config
Set on branch API host:

```env
DB_PROVIDER=postgres
APP_RUNTIME_MODE=BRANCH
POSTGRES_URL=<branch-local-postgres-url>
CENTRAL_SYNC_URL=<CENTRAL_API_URL>
BRANCH_ID=<branch-id>
SYNC_SHARED_SECRET=<same-shared-secret>
SYNC_WORKER_INTERVAL_MS=10000
SYNC_OUTBOX_BATCH_SIZE=50
SYNC_MAX_RETRIES=5
HTTP_PORT=3000
```

Start and verify:

```bash
npm run dev
curl http://localhost:3000/api/health
```

Expected:
- `provider = postgres`
- `mode = BRANCH`

## 4) Online Baseline (Before Outage)
Run from branch host:

```bash
npm run test:sync-smoke
BRANCH_ID=<branch-id> npm run test:sync-smoke
curl "http://localhost:3000/api/sync/status?branchId=<branch-id>"
```

Expected:
- Health/status/events checks return OK.
- Pull endpoint returns 200 with `BRANCH_ID` set.

## 5) Outage Simulation (WAN Off)
On branch network, disconnect WAN only (keep branch LAN up).

During outage:
- Perform at least 3 kiosk punches.
- Perform at least 2 admin mutations (for example attendance correction or employee update).

Check branch status:

```bash
curl "http://localhost:3000/api/sync/status?branchId=<branch-id>"
```

Expected during outage:
- `outbox_pending` increases.
- Branch operations remain successful locally.

## 6) Reconnection Validation (WAN On)
Restore WAN to branch.
Wait 1-3 sync intervals, then check:

```bash
curl "http://localhost:3000/api/sync/status?branchId=<branch-id>"
```

Expected after reconnection:
- `outbox_pending` trends to `0`.
- `inbound_failures = 0`.
- `dead_letter = 0`.
- Checkpoints update (`outbox_last_sent_id`, `inbound_last_seq`).

## 7) Evidence to Capture
- Central and branch `/api/health` JSON.
- Branch `/api/sync/status?branchId=...` JSON at:
  - baseline
  - outage window
  - post-reconnect drain
- Sample successful kiosk/admin actions during outage.
- Final metrics summary.

## 8) Pilot Sign-Off Table
- Date/time window: ______________________
- Branch ID: _____________________________
- Outbox max during outage: _____________
- Time to drain after WAN restore: ______
- Inbound failures: ______________________
- Dead-letter count: _____________________
- Result: PASS / FAIL
- Notes: _________________________________

## 9) If Pilot Fails
- Export branch status JSON and server logs.
- Record failing event type and entity type.
- Check central reachability from branch host.
- Verify `SYNC_SHARED_SECRET` parity on both nodes.
- Verify branch `BRANCH_ID` is set and consistent.
- Re-run smoke checks before retry.
