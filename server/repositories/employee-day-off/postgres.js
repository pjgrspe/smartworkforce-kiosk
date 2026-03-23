const { getPool } = require('../../config/postgres');

function mapRow(row) {
  return {
    id:         row.id,
    tenantId:   row.tenant_id,
    employeeId: row.employee_id,
    date:       row.date instanceof Date
                  ? row.date.toISOString().slice(0, 10)
                  : String(row.date).slice(0, 10),
    type:       row.type,
    startTime:  row.start_time || null,
    endTime:    row.end_time   || null,
    reason:     row.reason     || null,
    createdBy:  row.created_by || null,
    createdAt:  row.created_at,
    updatedAt:  row.updated_at,
  };
}

async function listForEmployee({ employeeId, tenantId, from, to }) {
  const pool = getPool();
  const params = [employeeId, tenantId];
  let where = 'WHERE employee_id = $1 AND tenant_id = $2';
  if (from) { params.push(from); where += ` AND date >= $${params.length}`; }
  if (to)   { params.push(to);   where += ` AND date <= $${params.length}`; }
  const { rows } = await pool.query(
    `SELECT * FROM employee_day_offs ${where} ORDER BY date ASC`,
    params,
  );
  return rows.map(mapRow);
}

/** Fetch day-offs for multiple employees within a date range (used by time engine). */
async function listForRange({ tenantId, employeeId, startDate, endDate }) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT * FROM employee_day_offs
     WHERE tenant_id   = $1
       AND employee_id = $2
       AND date >= $3
       AND date <= $4
     ORDER BY date ASC`,
    [tenantId, employeeId, startDate, endDate],
  );
  return rows.map(mapRow);
}

async function upsert({ tenantId, employeeId, date, type, startTime, endTime, reason, createdBy }) {
  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO employee_day_offs
       (tenant_id, employee_id, date, type, start_time, end_time, reason, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (employee_id, date) DO UPDATE
       SET type       = EXCLUDED.type,
           start_time = EXCLUDED.start_time,
           end_time   = EXCLUDED.end_time,
           reason     = EXCLUDED.reason,
           updated_at = NOW()
     RETURNING *`,
    [tenantId, employeeId, date, type, startTime || null, endTime || null, reason || null, createdBy || null],
  );
  return mapRow(rows[0]);
}

async function remove({ id, tenantId }) {
  const pool = getPool();
  const { rowCount } = await pool.query(
    `DELETE FROM employee_day_offs WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId],
  );
  return rowCount > 0;
}

module.exports = { listForEmployee, listForRange, upsert, remove };
