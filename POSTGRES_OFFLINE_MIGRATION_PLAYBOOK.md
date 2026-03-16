# PostgreSQL + Branch Offline-First Migration Playbook

Owner: Project Team
Status: In Progress
Last Updated: 2026-03-15

## Goal
Move Apollo from MongoDB-oriented backend flow to PostgreSQL, and implement true branch-level offline-first operations with automatic sync to a central server.

## Definition of Done
- All core entities run on PostgreSQL.
- Every branch can operate without internet using a branch-local server.
- Multiple devices in a branch can work simultaneously while offline.
- Sync is deterministic, idempotent, and observable.
- Rollout can be done branch-by-branch with rollback options.

## Critical Immediate Actions (Security)
These must be completed before any migration work proceeds:
- Rotate exposed SSH credentials.
- Rotate exposed database credentials.
- Update secrets in environment files and server secret stores.
- Confirm old credentials no longer work.

## Target Architecture
- Central Cloud
  - Node API (central mode)
  - PostgreSQL (central source of truth)
- Branch Edge (one per branch)
  - Node API (branch mode)
  - PostgreSQL (local branch database)
  - Sync worker (outbox/inbox pull-push loop)
- Branch Devices
  - Kiosk/Admin web clients on LAN
  - Connect to branch API over local network

## Why This Architecture
- Offline continuity for all branch operations.
- Multi-device branch consistency while internet is down.
- Controlled conflict handling via server-side sync protocol.

## Phase Plan

### Phase 0: Baseline and Controls
Checklist:
- [ ] Freeze schema-changing feature work during migration windows.
- [ ] Snapshot current MongoDB data and current branch local SQLite file(s).
- [ ] Add centralized logging IDs (requestId, branchId, deviceId).
- [ ] Define branch IDs and branch deployment inventory.

Deliverables:
- Backup verification report
- Branch inventory sheet

### Phase 1: PostgreSQL Foundation
Checklist:
- [ ] Choose ORM/query layer for Node backend (recommended: Prisma or Knex + Zod validation).
- [x] Create PostgreSQL schema for tenants, branches, users, employees, attendance logs, schedules, payroll, corrections.
- [x] Add migration tooling and repeatable seed scripts.
- [x] Add environment variables for central and branch DB URLs.
- [x] Add health checks for DB reachability and migration version.

Deliverables:
- Initial SQL schema migration set
- Seed scripts for non-prod
- DB health endpoint contract

### Phase 2: Data Access Refactor (Mongo to Repository Pattern)
Checklist:
- [x] Introduce repository interfaces per domain (employees, attendance, users, etc.).
- [x] Route controllers/services through repositories (no direct Mongoose in route handlers).
- [x] Implement Postgres repositories first.
- [ ] Keep compatibility layer for temporary side-by-side validation.

Deliverables:
- Repository abstraction in codebase
- Postgres-backed implementations

### Phase 3: Branch Local Runtime
Checklist:
- [x] Support runtime mode: CENTRAL or BRANCH via env flag.
- [ ] In BRANCH mode, API writes to local PostgreSQL.
- [ ] Configure branch web clients to default to local branch API endpoint.
- [ ] Keep kiosk and admin functions available without internet.

Deliverables:
- Branch runtime mode support
- Local API endpoint strategy

### Phase 4: Sync Protocol
Checklist:
- [x] Create outbox table for local changes (append-only events).
- [x] Create inbox/dedup table for applied remote events.
- [x] Add global event UUIDs and idempotency keys.
- [x] Implement pull-push sync worker with checkpoint cursors.
- [x] Define conflict policies per entity (attendance append-only, profile versioned updates).
- [x] Add retry/backoff and dead-letter handling.

Deliverables:
- Sync worker service
- Sync protocol document with conflict matrix

### Phase 5: Frontend Offline UX and Reliability
Checklist:
- [x] Show online/offline/sync states in UI.
- [x] Expose pending queue counts and last sync timestamp.
- [ ] Protect sensitive workflows with optimistic UI + rollback notices.
- [ ] Ensure kiosk remains operational during central outage.

Deliverables:
- Offline status components
- Operational dashboard tiles

### Phase 6: Validation and Rollout
Checklist:
- [ ] Build integration tests for offline branch writes + reconnect sync.
- [ ] Run branch simulation tests with 2-5 concurrent devices.
- [ ] Perform pilot rollout on one branch.
- [ ] Capture incident runbook and rollback steps.

Deliverables:
- Test report
- Pilot sign-off
- Rollout runbook

## Core Data Rules
- Attendance logs are append-only events.
- Any update event must carry:
  - entity_id
  - version
  - updated_at (UTC)
  - origin_branch_id
  - actor_id
- Sync processing must be idempotent (safe to replay).

## Milestone Tracker
- [ ] M0: Security and backup complete
- [ ] M1: PostgreSQL schema and migration tooling complete
- [ ] M2: Repository refactor complete
- [ ] M3: Branch mode complete
- [ ] M4: Sync worker complete
- [ ] M5: Pilot branch pass
- [ ] M6: Multi-branch rollout complete

## Execution Log
Use this section to log each completed step with date, owner, and evidence links.

### 2026-03-15
- Created migration playbook and milestone checklist.
- Added backend database bootstrap with runtime provider switch (`DB_PROVIDER`: mongo or postgres).
- Added PostgreSQL connection module and pool configuration.
- Updated server startup path to use unified database bootstrap.
- Added PostgreSQL environment configuration fields and `pg` dependency.
- Added core PostgreSQL migration SQL and migration runner script.
- Refactored attendance routes to repository pattern with provider-based resolution.
- Added Mongo attendance repository implementation and PostgreSQL repository implementation.
- Refactored employee routes to repository pattern with provider-based resolution.
- Added Mongo employee repository implementation and PostgreSQL repository implementation.
- Added runtime mode config (`APP_RUNTIME_MODE`) and surfaced provider/mode in health endpoint.
- Added User repository (Mongo + PostgreSQL) and moved auth path to repository abstraction.
- Added branch-mode PostgreSQL sync outbox service and event enqueueing for attendance/employee writes.
- Added sync worker skeleton for branch outbox dispatch to central sync endpoint.
- Added repositories and route refactors for users, branches, departments, and schedules.
- Added sync checkpoint migration and cursor persistence in sync worker.
- Added central sync routes (`/api/sync/events`, `/api/sync/events/pull`) with optional shared-secret auth.
- Added sync event feed migration and inbound branch apply pipeline with inbox dedupe.
- Added persistent inbound retry tracking and dead-letter handling for failed remote events.
- Added timestamp-based conflict guards for inbound mutable entity upserts.
- Added sync monitoring endpoint (`/api/sync/status`) for queue/checkpoint/failure visibility.
- Added user sync propagation (outbox + inbound apply handlers).
- Added sync smoke script for quick endpoint-level validation.
- Added dashboard sync observability tiles for provider, runtime mode, queue depth, failure counts, and checkpoint freshness.

### 2026-03-16
- Added PostgreSQL domain migration for holidays, salary structures, correction requests, and payroll runs.
- Refactored kiosk routes to provider-backed repositories so kiosk employees, recent punches, and punch writes work without Mongo-specific code paths.
- Refactored offline punch flush to use the active database provider instead of direct Mongoose writes.
- Refactored tenant, holiday, and salary routes to provider-backed repositories with PostgreSQL implementations.
- Removed direct Mongoose branch/employee validation from user assignment flow.
- Refactored correction routes to provider-backed repositories and moved correction attendance adjustment operations off direct Mongoose usage.
- Updated time engine and payroll engine data reads to support PostgreSQL provider execution paths.
- Refactored payroll routes to provider-backed repositories and removed direct Mongoose model usage from payroll runtime workflows.
- Verified BRANCH + PostgreSQL runtime startup (`/api/health` reports `provider: postgres`, `mode: BRANCH`).
- Restored local PostgreSQL tunnel and validated forwarded endpoint `127.0.0.1:15432` connectivity.
- Added and ran branch write verification script (`server/scripts/verify-branch-write.js`) proving local attendance write plus outbox enqueue (`outboxDelta: 1`, event `attendance.created`).
- Ran sync smoke checks with and without `BRANCH_ID`; verified `/api/sync/events/pull` path returns HTTP 200 when `BRANCH_ID` is set.
- Captured branch sync status snapshot with branch-scoped metrics (`outbox_pending: 1`, no inbound failures/dead-letter).
- Added and ran pilot sync-cycle simulation script (`server/scripts/pilot-sync-cycle.js`) with `CENTRAL_SYNC_URL=http://localhost:3000` to emulate reachable central sync.
- Pilot simulation evidence: pending outbox moved `1 -> 0`, outbox row marked `sent_at`, `outbox_last_sent_id` checkpoint updated, inbound cursor advanced, and status metrics showed `outbox_pending: 0`, `inbound_failures: 0`, `dead_letter: 0`.
- Added real two-node pilot checklist (`BRANCH_PILOT_EXECUTION_CHECKLIST.md`) with outage/recovery pass criteria and evidence requirements.
- Added pilot status capture utility (`server/scripts/pilot-status-capture.js`) and npm command (`npm run pilot:capture-status`) for timestamped branch health/sync snapshots.
- Verified capture command writes evidence files under `logs/pilot/` (example baseline snapshot captured).
- Executed pilot outage/recovery sequence for branch `a48a3a32-966f-4ebd-b057-c791cb9c1e64` with evidence snapshots:
  - `logs/pilot/outage-2026-03-16T00-43-57-296Z.json`
  - `logs/pilot/recovered-2026-03-16T00-44-08-229Z.json`
- Pilot result: PASS (outbox `1 -> 0`, `inbound_failures=0`, `dead_letter=0`, inbound and outbound checkpoints advanced after recovery cycle).

## Active Work Queue (Do Not Skip)
1. Implement BRANCH-mode write policy and outbox enqueue for remaining mutable entities.
2. Run smoke tests against central and one branch edge deployment.
3. Verify dashboard observability against a live BRANCH deployment.
4. Pilot deployment in one branch with monitored sync metrics.

## Next Immediate Step
Start Phase 0 by rotating credentials and recording branch deployment inventory, then begin Phase 1 schema design from current server models.

## Activation Runbook
For production switch-over execution and live connectivity blockers, use:

- `POSTGRES_ACTIVATION_RUNBOOK.md`
