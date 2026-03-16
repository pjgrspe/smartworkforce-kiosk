const { getPool } = require('../../config/postgres');
const { enqueueOutboxEvent } = require('../../services/sync-outbox');

function mapRow(row) {
  return {
    _id: row.id,
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    code: row.code,
    address: row.address,
    phone: row.phone,
    timezone: row.timezone,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listBranches({ user }) {
  const pool = getPool();
  const params = [user.tenantId];
  let query = `
    SELECT * FROM branches
    WHERE tenant_id = $1
      AND is_active = TRUE
  `;

  if (user.role !== 'super_admin' && user.branchId) {
    params.push(user.branchId);
    query += ` AND id = $${params.length}`;
  }

  query += ' ORDER BY name ASC';
  const { rows } = await pool.query(query, params);
  return rows.map(mapRow);
}

async function createBranch({ user, payload }) {
  const pool = getPool();
  const { rows } = await pool.query(
    `
      INSERT INTO branches (tenant_id, name, code, address, phone, timezone, is_active)
      VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'Asia/Manila'), TRUE)
      RETURNING *
    `,
    [
      user.tenantId,
      payload.name,
      payload.code,
      payload.address || null,
      payload.phone || null,
      payload.timezone || null,
    ]
  );

  const created = mapRow(rows[0]);
  await enqueueOutboxEvent({
    branchId: created.id,
    eventType: 'branch.created',
    entityType: 'branch',
    entityId: created.id,
    payload: created,
  });
  return created;
}

async function findActiveBranchById({ id, tenantId }) {
  const pool = getPool();
  const params = [id];
  let query = 'SELECT * FROM branches WHERE id = $1 AND is_active = TRUE';
  if (tenantId) {
    params.push(tenantId);
    query += ` AND tenant_id = $${params.length}`;
  }
  query += ' LIMIT 1';
  const { rows } = await pool.query(query, params);
  return rows[0] ? mapRow(rows[0]) : null;
}

async function updateBranch({ user, id, patch }) {
  const pool = getPool();
  const existing = await pool.query(
    'SELECT * FROM branches WHERE id = $1 AND tenant_id = $2 LIMIT 1',
    [id, user.tenantId]
  );
  if (!existing.rowCount) return null;

  const current = existing.rows[0];
  const next = {
    name: patch.name ?? current.name,
    code: patch.code ?? current.code,
    address: Object.prototype.hasOwnProperty.call(patch, 'address') ? patch.address : current.address,
    phone: Object.prototype.hasOwnProperty.call(patch, 'phone') ? patch.phone : current.phone,
    timezone: patch.timezone ?? current.timezone,
    isActive: Object.prototype.hasOwnProperty.call(patch, 'isActive') ? Boolean(patch.isActive) : current.is_active,
  };

  const { rows } = await pool.query(
    `
      UPDATE branches
      SET name = $2,
          code = $3,
          address = $4,
          phone = $5,
          timezone = $6,
          is_active = $7,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [id, next.name, next.code, next.address, next.phone, next.timezone, next.isActive]
  );

  const updated = mapRow(rows[0]);
  await enqueueOutboxEvent({
    branchId: updated.id,
    eventType: 'branch.updated',
    entityType: 'branch',
    entityId: updated.id,
    payload: updated,
  });
  return updated;
}

async function softDeleteBranch({ user, id }) {
  const pool = getPool();
  const { rows } = await pool.query(
    `
      UPDATE branches
      SET is_active = FALSE,
          updated_at = NOW()
      WHERE id = $1
        AND tenant_id = $2
      RETURNING *
    `,
    [id, user.tenantId]
  );

  if (!rows.length) return false;
  const deleted = mapRow(rows[0]);
  await enqueueOutboxEvent({
    branchId: deleted.id,
    eventType: 'branch.deactivated',
    entityType: 'branch',
    entityId: deleted.id,
    payload: { id: deleted.id, deactivatedAt: new Date().toISOString() },
  });
  return true;
}

module.exports = {
  listBranches,
  createBranch,
  findActiveBranchById,
  updateBranch,
  softDeleteBranch,
};
