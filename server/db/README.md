# PostgreSQL Database Migrations

## Prerequisites
- `POSTGRES_URL` must be set in your environment.
- Run commands from the `server` directory.

## Available Migrations
- `0001_core_postgres.sql`: Core schema for tenants, branches, users, employees, attendance, and sync tables.
- `0002_sync_checkpoints.sql`: Checkpoint table for resumable sync worker cursors.
- `0003_sync_events.sql`: Central sync event feed for branch pull consumers.
- `0004_sync_failure_handling.sql`: Inbound retry tracking and dead-letter tables.

## Commands
Apply the core migration:

```bash
npm run db:migrate:postgres:core
```

Apply any migration file by name:

```bash
npm run db:migrate:postgres -- 0001_core_postgres.sql
npm run db:migrate:postgres -- 0002_sync_checkpoints.sql
npm run db:migrate:postgres -- 0003_sync_events.sql
npm run db:migrate:postgres -- 0004_sync_failure_handling.sql
```

## Notes
- Migration runner executes inside a transaction.
- On failure, changes are rolled back.
- This migration is additive and intended for PostgreSQL environments only.
