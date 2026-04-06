/* eslint-disable no-console */

require('dotenv').config({ path: '../.env' });

const { connectPostgres, getPool } = require('../config/postgres');
const attendanceRepo = require('../repositories/attendance/postgres');

async function main() {
  await connectPostgres();
  const pool = getPool();

  const tenant = (
    await pool.query(
      `
        INSERT INTO tenants (name, code, is_active)
        VALUES ('Step2 Tenant', 'STEP2', TRUE)
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
        VALUES ($1, 'Step2 Branch', 'BR001', TRUE)
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
          'E-STEP2',
          'Step',
          'Tester',
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

  const before = (
    await pool.query(
      'SELECT COUNT(*)::int AS c FROM sync_outbox WHERE branch_id = $1 AND sent_at IS NULL',
      [branch.id],
    )
  ).rows[0].c;

  const user = {
    tenantId: tenant.id,
    branchId: branch.id,
    role: 'branch_manager',
    sub: 'step2-verifier',
  };

  const created = await attendanceRepo.createManualAttendance({
    user,
    payload: {
      employeeId: employee.id,
      type: 'IN',
      notes: 'step2-branch-write-check',
    },
  });

  const after = (
    await pool.query(
      'SELECT COUNT(*)::int AS c FROM sync_outbox WHERE branch_id = $1 AND sent_at IS NULL',
      [branch.id],
    )
  ).rows[0].c;

  const latest = (
    await pool.query(
      `
        SELECT event_type, entity_type, entity_id, created_at
        FROM sync_outbox
        WHERE branch_id = $1
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [branch.id],
    )
  ).rows[0];

  console.log(
    JSON.stringify(
      {
        tenantId: tenant.id,
        branchId: branch.id,
        employeeId: employee.id,
        createdAttendanceId: created.id,
        outboxBefore: before,
        outboxAfter: after,
        outboxDelta: after - before,
        latestOutboxEvent: latest,
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
