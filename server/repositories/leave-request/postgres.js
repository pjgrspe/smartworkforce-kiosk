const { getPool } = require('../../config/postgres');

function mapRow(row) {
  return {
    _id: row.id,
    id: row.id,
    tenantId: row.tenant_id,
    employeeId: row.employee_ref_id
      ? {
        _id: row.employee_ref_id,
        firstName: row.employee_first_name,
        lastName: row.employee_last_name,
        employeeCode: row.employee_code,
      }
      : row.employee_id,
    requestedBy: row.requested_by_ref_id
      ? {
        _id: row.requested_by_ref_id,
        firstName: row.requested_by_first_name,
        lastName: row.requested_by_last_name,
        email: row.requested_by_email,
      }
      : row.requested_by,
    leaveType: row.leave_type,
    startDate: row.start_date instanceof Date
      ? row.start_date.toISOString().slice(0, 10)
      : String(row.start_date).slice(0, 10),
    endDate: row.end_date instanceof Date
      ? row.end_date.toISOString().slice(0, 10)
      : String(row.end_date).slice(0, 10),
    notes: row.notes || null,
    status: row.status,
    reviewedBy: row.reviewed_by_ref_id
      ? {
        _id: row.reviewed_by_ref_id,
        firstName: row.reviewed_by_first_name,
        lastName: row.reviewed_by_last_name,
        email: row.reviewed_by_email,
      }
      : row.reviewed_by,
    reviewedAt: row.reviewed_at,
    reviewNotes: row.review_notes || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function baseSelect() {
  return `
    SELECT
      lr.*,
      e.id            AS employee_ref_id,
      e.first_name    AS employee_first_name,
      e.last_name     AS employee_last_name,
      e.employee_code AS employee_code,
      ru.id           AS requested_by_ref_id,
      ru.first_name   AS requested_by_first_name,
      ru.last_name    AS requested_by_last_name,
      ru.email        AS requested_by_email,
      rv.id           AS reviewed_by_ref_id,
      rv.first_name   AS reviewed_by_first_name,
      rv.last_name    AS reviewed_by_last_name,
      rv.email        AS reviewed_by_email
    FROM leave_requests lr
    LEFT JOIN employees e  ON e.id  = lr.employee_id
    LEFT JOIN users     ru ON ru.id = lr.requested_by
    LEFT JOIN users     rv ON rv.id = lr.reviewed_by
  `;
}

async function listMyLeaves({ tenantId, employeeId, status }) {
  const pool = getPool();
  const params = [tenantId, employeeId];
  const where = ['lr.tenant_id = $1', 'lr.employee_id = $2'];
  if (status) {
    params.push(status);
    where.push(`lr.status = $${params.length}`);
  }
  const { rows } = await pool.query(
    `${baseSelect()} WHERE ${where.join(' AND ')} ORDER BY lr.created_at DESC`,
    params,
  );
  return rows.map(mapRow);
}

async function listLeaves({ tenantId, status, employeeId, scopedEmployeeIds }) {
  const pool = getPool();
  const params = [tenantId];
  const where = ['lr.tenant_id = $1'];
  if (status) {
    params.push(status);
    where.push(`lr.status = $${params.length}`);
  }
  if (employeeId) {
    params.push(employeeId);
    where.push(`lr.employee_id = $${params.length}`);
  }
  if (scopedEmployeeIds) {
    params.push(scopedEmployeeIds);
    where.push(`lr.employee_id = ANY($${params.length}::uuid[])`);
  }
  const { rows } = await pool.query(
    `${baseSelect()} WHERE ${where.join(' AND ')} ORDER BY lr.created_at DESC`,
    params,
  );
  return rows.map(mapRow);
}

async function createLeave(payload) {
  const pool = getPool();

  // Prevent overlapping pending/approved leaves for the same employee
  const { rowCount } = await pool.query(
    `SELECT id FROM leave_requests
     WHERE employee_id = $1
       AND status IN ('pending', 'approved')
       AND start_date <= $3
       AND end_date   >= $2`,
    [payload.employeeId, payload.startDate, payload.endDate],
  );
  if (rowCount) {
    throw new Error('A leave request already exists for overlapping dates.');
  }

  const { rows } = await pool.query(
    `INSERT INTO leave_requests
       (tenant_id, employee_id, requested_by, leave_type, start_date, end_date, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      payload.tenantId,
      payload.employeeId,
      payload.requestedBy,
      payload.leaveType,
      payload.startDate,
      payload.endDate,
      payload.notes || null,
    ],
  );

  const { rows: mapped } = await pool.query(
    `${baseSelect()} WHERE lr.id = $1 LIMIT 1`,
    [rows[0].id],
  );
  return mapped[0] ? mapRow(mapped[0]) : null;
}

async function findPendingLeave({ id, tenantId, scopedEmployeeIds }) {
  const pool = getPool();
  const params = [id, tenantId];
  const where = ['lr.id = $1', 'lr.tenant_id = $2', `lr.status = 'pending'`];
  if (scopedEmployeeIds) {
    params.push(scopedEmployeeIds);
    where.push(`lr.employee_id = ANY($${params.length}::uuid[])`);
  }
  const { rows } = await pool.query(
    `${baseSelect()} WHERE ${where.join(' AND ')} LIMIT 1`,
    params,
  );
  if (!rows[0]) return null;
  const mapped = mapRow(rows[0]);
  return {
    ...mapped,
    employeeId: mapped.employeeId && typeof mapped.employeeId === 'object'
      ? mapped.employeeId._id
      : mapped.employeeId,
  };
}

async function approveLeave({ id, tenantId, reviewerId, notes }) {
  const pool = getPool();
  const { rows } = await pool.query(
    `UPDATE leave_requests
     SET status       = 'approved',
         reviewed_by  = $3,
         reviewed_at  = NOW(),
         review_notes = $4,
         updated_at   = NOW()
     WHERE id = $1 AND tenant_id = $2 AND status = 'pending'
     RETURNING id`,
    [id, tenantId, reviewerId, notes || null],
  );
  if (!rows.length) return null;
  const { rows: mapped } = await pool.query(
    `${baseSelect()} WHERE lr.id = $1 LIMIT 1`,
    [rows[0].id],
  );
  return mapped[0] ? mapRow(mapped[0]) : null;
}

async function rejectLeave({ id, tenantId, scopedEmployeeIds, reviewerId, notes }) {
  const pool = getPool();
  const params = [id, tenantId, reviewerId, notes || null];
  let scopeSql = '';
  if (scopedEmployeeIds) {
    params.push(scopedEmployeeIds);
    scopeSql = ` AND employee_id = ANY($${params.length}::uuid[])`;
  }
  const { rows } = await pool.query(
    `UPDATE leave_requests
     SET status       = 'rejected',
         reviewed_by  = $3,
         reviewed_at  = NOW(),
         review_notes = $4,
         updated_at   = NOW()
     WHERE id = $1 AND tenant_id = $2 AND status = 'pending'
     ${scopeSql}
     RETURNING id`,
    params,
  );
  if (!rows.length) return null;
  const { rows: mapped } = await pool.query(
    `${baseSelect()} WHERE lr.id = $1 LIMIT 1`,
    [rows[0].id],
  );
  return mapped[0] ? mapRow(mapped[0]) : null;
}

/**
 * Returns days used per leave_type for an employee in a given year.
 * Counts calendar days (end_date - start_date + 1) for approved leaves.
 */
async function getDaysUsed({ employeeId, year }) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT leave_type,
            SUM(end_date - start_date + 1)::int AS days_used
     FROM leave_requests
     WHERE employee_id = $1
       AND status      = 'approved'
       AND EXTRACT(YEAR FROM start_date) = $2
     GROUP BY leave_type`,
    [employeeId, year],
  );
  const result = { sick_leave: 0, vacation_leave: 0 };
  for (const row of rows) {
    if (row.leave_type in result) result[row.leave_type] = row.days_used;
  }
  return result;
}

module.exports = { listMyLeaves, listLeaves, createLeave, findPendingLeave, approveLeave, rejectLeave, getDaysUsed };
