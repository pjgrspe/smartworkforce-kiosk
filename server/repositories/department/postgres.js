const { getPool } = require('../../config/postgres');
const { enqueueOutboxEvent } = require('../../services/sync-outbox');

function mapRow(row) {
  return {
    _id: row.id,
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id,
    name: row.name,
    code: row.code,
    description: row.description,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listDepartments({ user, branchId }) {
  const pool = getPool();
  const params = [user.tenantId];
  let query = `
    SELECT *
    FROM departments
    WHERE tenant_id = $1
      AND is_active = TRUE
  `;

  if (!['super_admin', 'client_admin'].includes(user.role) && user.branchId) {
    params.push(user.branchId);
    query += ` AND branch_id = $${params.length}`;
  } else if (branchId) {
    params.push(branchId);
    query += ` AND branch_id = $${params.length}`;
  }

  query += ' ORDER BY name ASC';
  const { rows } = await pool.query(query, params);
  return rows.map(mapRow);
}

async function createDepartment({ user, payload }) {
  const pool = getPool();
  const { rows } = await pool.query(
    `
      INSERT INTO departments (tenant_id, branch_id, name, code, description, is_active)
      VALUES ($1, $2, $3, $4, $5, TRUE)
      RETURNING *
    `,
    [
      user.tenantId,
      payload.branchId || null,
      payload.name,
      payload.code || null,
      payload.description || null,
    ]
  );

  const created = mapRow(rows[0]);
  await enqueueOutboxEvent({
    branchId: created.branchId,
    eventType: 'department.created',
    entityType: 'department',
    entityId: created.id,
    payload: created,
  });
  return created;
}

async function updateDepartment({ user, id, patch }) {
  const pool = getPool();
  const existing = await pool.query(
    'SELECT * FROM departments WHERE id = $1 AND tenant_id = $2 LIMIT 1',
    [id, user.tenantId]
  );
  if (!existing.rowCount) return null;

  const current = existing.rows[0];
  const next = {
    branchId: Object.prototype.hasOwnProperty.call(patch, 'branchId') ? patch.branchId : current.branch_id,
    name: patch.name ?? current.name,
    code: Object.prototype.hasOwnProperty.call(patch, 'code') ? patch.code : current.code,
    description: Object.prototype.hasOwnProperty.call(patch, 'description') ? patch.description : current.description,
    isActive: Object.prototype.hasOwnProperty.call(patch, 'isActive') ? Boolean(patch.isActive) : current.is_active,
  };

  const { rows } = await pool.query(
    `
      UPDATE departments
      SET branch_id = $2,
          name = $3,
          code = $4,
          description = $5,
          is_active = $6,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [id, next.branchId, next.name, next.code, next.description, next.isActive]
  );

  const updated = mapRow(rows[0]);
  await enqueueOutboxEvent({
    branchId: updated.branchId,
    eventType: 'department.updated',
    entityType: 'department',
    entityId: updated.id,
    payload: updated,
  });
  return updated;
}

async function softDeleteDepartment({ user, id }) {
  const pool = getPool();
  const { rows } = await pool.query(
    `
      UPDATE departments
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
    branchId: deleted.branchId,
    eventType: 'department.deactivated',
    entityType: 'department',
    entityId: deleted.id,
    payload: { id: deleted.id, deactivatedAt: new Date().toISOString() },
  });
  return true;
}

module.exports = {
  listDepartments,
  createDepartment,
  updateDepartment,
  softDeleteDepartment,
};
