const { getPool } = require('../../config/postgres');

function mapHoliday(row) {
  if (!row) return null;
  return {
    _id: row.id,
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    date: row.date,
    type: row.type,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listHolidays({ user, year }) {
  const pool = getPool();
  const params = [user.tenantId];
  let query = 'SELECT * FROM holidays WHERE tenant_id = $1';
  if (year) {
    params.push(`${year}-01-01`);
    params.push(`${year}-12-31`);
    query += ` AND date >= $${params.length - 1} AND date <= $${params.length}`;
  }
  query += ' ORDER BY date ASC';
  const { rows } = await pool.query(query, params);
  return rows.map(mapHoliday);
}

async function createHoliday({ user, payload }) {
  const pool = getPool();
  const { rows } = await pool.query(
    'INSERT INTO holidays (tenant_id, name, date, type) VALUES ($1, $2, $3, $4) RETURNING *',
    [user.tenantId, payload.name, payload.date, payload.type],
  );
  return mapHoliday(rows[0]);
}

async function bulkCreateHolidays({ user, holidays }) {
  const pool = getPool();
  const created = [];
  for (const holiday of holidays || []) {
    const { rows } = await pool.query(
      'INSERT INTO holidays (tenant_id, name, date, type) VALUES ($1, $2, $3, $4) ON CONFLICT (tenant_id, date) DO NOTHING RETURNING *',
      [user.tenantId, holiday.name, holiday.date, holiday.type],
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

async function listForRange({ tenantId, startDate, endDate }) {
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT * FROM holidays WHERE tenant_id = $1 AND date >= $2 AND date <= $3 ORDER BY date ASC',
    [tenantId, startDate, endDate],
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