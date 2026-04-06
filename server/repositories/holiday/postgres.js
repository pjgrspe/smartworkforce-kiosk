const { getPool } = require('../../config/postgres');

function mapHoliday(row) {
  if (!row) return null;
  return {
    _id:           row.id,
    id:            row.id,
    tenantId:      row.tenant_id,
    branchId:      row.branch_id || null,
    name:          row.name,
    date:          row.date,
    type:          row.type,
    payMultiplier: row.pay_multiplier != null ? Number(row.pay_multiplier) : null,
    createdAt:     row.created_at,
    updatedAt:     row.updated_at,
  };
}

async function listHolidays({ user, year, branchId }) {
  const pool = getPool();
  const params = [user.tenantId];
  let query = 'SELECT * FROM holidays WHERE tenant_id = $1';

  // branchId = 'none' → company-wide only (branch_id IS NULL)
  // branchId = specific UUID → that branch only
  // branchId = undefined/null → all holidays for tenant
  if (branchId === 'none') {
    query += ' AND branch_id IS NULL';
  } else if (branchId) {
    query += ` AND branch_id = $${params.push(branchId)}`;
  }

  if (year) {
    query += ` AND date >= $${params.push(`${year}-01-01`)} AND date <= $${params.push(`${year}-12-31`)}`;
  }

  query += ' ORDER BY date ASC';
  const { rows } = await pool.query(query, params);
  return rows.map(mapHoliday);
}

async function createHoliday({ user, payload }) {
  const pool = getPool();
  const branchId      = payload.branchId      || null;
  const payMultiplier = payload.payMultiplier  != null ? Number(payload.payMultiplier) : null;
  const { rows } = await pool.query(
    'INSERT INTO holidays (tenant_id, branch_id, name, date, type, pay_multiplier) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
    [user.tenantId, branchId, payload.name, payload.date, payload.type, payMultiplier],
  );
  return mapHoliday(rows[0]);
}

async function bulkCreateHolidays({ user, holidays, branchId }) {
  const pool = getPool();
  const resolvedBranchId = branchId || null;
  const created = [];
  for (const holiday of holidays || []) {
    const hBranchId = holiday.branchId || resolvedBranchId;
    const hPayMultiplier = holiday.payMultiplier != null ? Number(holiday.payMultiplier) : null;
    const { rows } = await pool.query(
      `INSERT INTO holidays (tenant_id, branch_id, name, date, type, pay_multiplier)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (tenant_id, COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), date)
       DO NOTHING RETURNING *`,
      [user.tenantId, hBranchId, holiday.name, holiday.date, holiday.type, hPayMultiplier],
    );
    if (rows[0]) created.push(mapHoliday(rows[0]));
  }
  return created;
}

async function deleteHoliday({ user, id }) {
  const pool = getPool();
  await pool.query('DELETE FROM holidays WHERE id = $1 AND tenant_id = $2', [id, user.tenantId]);
  return true;
}

// Used by payroll engine — returns company-wide AND branch-specific holidays for a given branch
async function listForRange({ tenantId, startDate, endDate, branchId }) {
  const pool = getPool();
  const params = [tenantId, startDate, endDate];
  let branchClause = 'AND branch_id IS NULL';
  if (branchId) {
    branchClause = `AND (branch_id IS NULL OR branch_id = $${params.push(branchId)})`;
  }
  const { rows } = await pool.query(
    `SELECT * FROM holidays WHERE tenant_id = $1 AND date >= $2 AND date <= $3 ${branchClause} ORDER BY date ASC`,
    params,
  );
  return rows.map(mapHoliday);
}

module.exports = {
  listHolidays,
  createHoliday,
  bulkCreateHolidays,
  deleteHoliday,
  listForRange,
};
