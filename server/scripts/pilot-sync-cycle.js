/* eslint-disable no-console */

require('dotenv').config({ path: '../.env' });

process.env.DB_PROVIDER = 'postgres';
process.env.APP_RUNTIME_MODE = 'BRANCH';
process.env.CENTRAL_SYNC_URL = process.env.CENTRAL_SYNC_URL || 'http://localhost:3000';

const { connectPostgres, getPool } = require('../config/postgres');
const attendanceRepo = require('../repositories/attendance/postgres');
const { runSyncCycle } = require('../services/sync-worker');

async function ensureFixture(pool) {
  const tenant = (
    await pool.query(
      `
        INSERT INTO tenants (name, code, is_active)
        VALUES ('Pilot Tenant', 'PILOT', TRUE)
        ON CONFLICT (code)
        DO UPDATE SET name = EXCLUDED.name
        RETURNING id
      `,
    )
  ).rows[0];

  const branch = (
    await pool.query(
      `
        INSERT INTO branches (tenant_id, name, code, is_active)
        VALUES ($1, 'Pilot Branch', 'PLT001', TRUE)
        ON CONFLICT (tenant_id, code)
        DO UPDATE SET name = EXCLUDED.name
        RETURNING id
      `,
      [tenant.id],
    )
  ).rows[0];

  const employee = (
    await pool.query(
      `
        INSERT INTO employees (
          tenant_id,
          branch_id,
          employee_code,
          first_name,
          last_name,
          employment,
          is_active
        )
        VALUES (
          $1,
          $2,
          'E-PILOT',
          'Pilot',
          'User',
          jsonb_build_object('status', 'active'),
          TRUE
        )
        ON CONFLICT (tenant_id, employee_code)
        DO UPDATE SET
          branch_id = EXCLUDED.branch_id,
          employment = EXCLUDED.employment,
          is_active = TRUE
        RETURNING id
      `,
      [tenant.id, branch.id],
    )
  ).rows[0];

  return {
    tenantId: tenant.id,
    branchId: branch.id,
    employeeId: employee.id,
  };
}

async function main() {
  await connectPostgres();
  const pool = getPool();

  const fx = await ensureFixture(pool);
  process.env.BRANCH_ID = fx.branchId;

  const before = (
    await pool.query(
      'SELECT COUNT(*)::int AS c FROM sync_outbox WHERE branch_id = $1 AND sent_at IS NULL',
      [fx.branchId],
    )
  ).rows[0].c;

  const user = {
    tenantId: fx.tenantId,
    branchId: fx.branchId,
    role: 'branch_manager',
    sub: 'pilot-runner',
  };

  const created = await attendanceRepo.createManualAttendance({
    user,
    payload: {
      employeeId: fx.employeeId,
      type: 'IN',
      notes: 'pilot-sync-drain-check',
    },
  });

  const queued = (
    await pool.query(
      'SELECT COUNT(*)::int AS c FROM sync_outbox WHERE branch_id = $1 AND sent_at IS NULL',
      [fx.branchId],
    )
  ).rows[0].c;

  await runSyncCycle();

  const after = (
    await pool.query(
      'SELECT COUNT(*)::int AS c FROM sync_outbox WHERE branch_id = $1 AND sent_at IS NULL',
      [fx.branchId],
    )
  ).rows[0].c;

  const checkpoint = (
    await pool.query(
      `
        SELECT cursor_name, cursor_value, updated_at
        FROM sync_checkpoints
        WHERE branch_id = $1
          AND cursor_name = 'outbox_last_sent_id'
        LIMIT 1
      `,
      [fx.branchId],
    )
  ).rows[0] || null;

  const sentRow = (
    await pool.query(
      `
        SELECT id, sent_at, event_type, entity_type
        FROM sync_outbox
        WHERE branch_id = $1
          AND entity_id = $2
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [fx.branchId, created.id],
    )
  ).rows[0] || null;

  console.log(
    JSON.stringify(
      {
        centralSyncUrl: process.env.CENTRAL_SYNC_URL,
        branchId: fx.branchId,
        createdAttendanceId: created.id,
        pendingBeforeWrite: before,
        pendingAfterWrite: queued,
        pendingAfterSyncCycle: after,
        outboxCheckpoint: checkpoint,
        outboxRow: sentRow,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
