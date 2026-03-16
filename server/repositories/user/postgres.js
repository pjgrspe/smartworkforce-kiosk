const { getPool } = require('../../config/postgres');
const { enqueueOutboxEvent } = require('../../services/sync-outbox');

function mapUserRow(row) {
  if (!row) return null;

  return {
    _id: row.id,
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id,
    email: row.email,
    passwordHash: row.password_hash,
    firstName: row.first_name,
    lastName: row.last_name,
    profilePictureUrl: row.profile_picture_url,
    role: row.role,
    employeeId: row.employee_id,
    isActive: row.is_active,
    lastLoginAt: row.last_login_at,
    passwordChangedAt: row.password_changed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function findByEmail(email) {
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT * FROM users WHERE email = $1 LIMIT 1',
    [email],
  );
  return mapUserRow(rows[0]);
}

async function findByEmailExcludingId(email, excludedId) {
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT * FROM users WHERE email = $1 AND id <> $2 LIMIT 1',
    [email, excludedId],
  );
  return mapUserRow(rows[0]);
}

async function findById(id) {
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT * FROM users WHERE id = $1 LIMIT 1',
    [id],
  );
  return mapUserRow(rows[0]);
}

async function findPasswordById(id) {
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT password_hash FROM users WHERE id = $1 LIMIT 1',
    [id],
  );
  return rows[0] ? rows[0].password_hash : null;
}

async function touchLastLogin(id) {
  const pool = getPool();
  await pool.query(
    'UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1',
    [id],
  );
}

async function findMeById(id) {
  const pool = getPool();
  const { rows } = await pool.query(
    `
      SELECT
        u.*,
        b.id AS branch_ref_id,
        b.name AS branch_name,
        e.id AS employee_ref_id,
        e.first_name AS employee_first_name,
        e.last_name AS employee_last_name,
        e.employee_code AS employee_code
      FROM users u
      LEFT JOIN branches b ON b.id = u.branch_id
      LEFT JOIN employees e ON e.id = u.employee_id
      WHERE u.id = $1
      LIMIT 1
    `,
    [id],
  );

  if (!rows[0]) return null;
  const user = mapUserRow(rows[0]);
  return {
    ...user,
    branchId: rows[0].branch_ref_id ? { _id: rows[0].branch_ref_id, name: rows[0].branch_name } : null,
    employeeId: rows[0].employee_ref_id
      ? {
        _id: rows[0].employee_ref_id,
        firstName: rows[0].employee_first_name,
        lastName: rows[0].employee_last_name,
        employeeCode: rows[0].employee_code,
      }
      : null,
  };
}

async function updateSelf(id, updates) {
  const pool = getPool();
  const existing = await findById(id);
  if (!existing) return null;

  const next = {
    firstName: Object.prototype.hasOwnProperty.call(updates, 'firstName') ? updates.firstName : existing.firstName,
    lastName: Object.prototype.hasOwnProperty.call(updates, 'lastName') ? updates.lastName : existing.lastName,
    email: Object.prototype.hasOwnProperty.call(updates, 'email') ? updates.email : existing.email,
    passwordHash: Object.prototype.hasOwnProperty.call(updates, 'passwordHash') ? updates.passwordHash : existing.passwordHash,
    profilePictureUrl: Object.prototype.hasOwnProperty.call(updates, 'profilePictureUrl') ? updates.profilePictureUrl : existing.profilePictureUrl,
    passwordChangedAt: Object.prototype.hasOwnProperty.call(updates, 'passwordChangedAt') ? updates.passwordChangedAt : existing.passwordChangedAt,
  };

  const { rows } = await pool.query(
    `
      UPDATE users
      SET first_name = $2,
          last_name = $3,
          email = $4,
          password_hash = $5,
          profile_picture_url = $6,
          password_changed_at = $7,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [id, next.firstName, next.lastName, next.email, next.passwordHash, next.profilePictureUrl, next.passwordChangedAt],
  );

  const updated = mapUserRow(rows[0]);
  if (updated) {
    await enqueueOutboxEvent({
      branchId: updated.branchId,
      eventType: 'user.updated',
      entityType: 'user',
      entityId: updated.id,
      payload: updated,
    });
  }

  return updated;
}

async function listUsers({ requestUser }) {
  const pool = getPool();
  const params = [];
  let where = 'WHERE 1=1';

  if (requestUser.role !== 'super_admin') {
    params.push(requestUser.tenantId);
    where += ` AND u.tenant_id = $${params.length}`;
    if (requestUser.branchId) {
      params.push(requestUser.branchId);
      where += ` AND u.branch_id = $${params.length}`;
    }
  }

  const { rows } = await pool.query(
    `
      SELECT
        u.*,
        b.id AS branch_ref_id,
        b.name AS branch_name,
        e.id AS employee_ref_id,
        e.first_name AS employee_first_name,
        e.last_name AS employee_last_name,
        e.employee_code AS employee_code
      FROM users u
      LEFT JOIN branches b ON b.id = u.branch_id
      LEFT JOIN employees e ON e.id = u.employee_id
      ${where}
      ORDER BY u.last_name ASC
    `,
    params,
  );

  return rows.map((row) => ({
    ...mapUserRow(row),
    branchId: row.branch_ref_id ? { _id: row.branch_ref_id, name: row.branch_name } : null,
    employeeId: row.employee_ref_id
      ? {
        _id: row.employee_ref_id,
        firstName: row.employee_first_name,
        lastName: row.employee_last_name,
        employeeCode: row.employee_code,
      }
      : null,
  }));
}

async function findScopedUser({ requestUser, userId }) {
  const pool = getPool();
  const params = [userId];
  let where = 'WHERE id = $1';

  if (requestUser.role !== 'super_admin') {
    params.push(requestUser.tenantId);
    where += ` AND tenant_id = $${params.length}`;
    if (requestUser.branchId) {
      params.push(requestUser.branchId);
      where += ` AND branch_id = $${params.length}`;
    }
  }

  const { rows } = await pool.query(
    `
      SELECT * FROM users
      ${where}
      LIMIT 1
    `,
    params,
  );
  return mapUserRow(rows[0]);
}

async function createUser(payload) {
  const pool = getPool();
  const { rows } = await pool.query(
    `
      INSERT INTO users (
        tenant_id, branch_id, email, password_hash, first_name, last_name,
        profile_picture_url, role, employee_id, is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `,
    [
      payload.tenantId || null,
      payload.branchId || null,
      payload.email,
      payload.passwordHash,
      payload.firstName,
      payload.lastName,
      payload.profilePictureUrl || null,
      payload.role,
      payload.employeeId || null,
      payload.isActive == null ? true : Boolean(payload.isActive),
    ],
  );
  const created = mapUserRow(rows[0]);
  await enqueueOutboxEvent({
    branchId: created.branchId,
    eventType: 'user.created',
    entityType: 'user',
    entityId: created.id,
    payload: created,
  });
  return created;
}

async function updateUserById(id, updates) {
  const pool = getPool();
  const existing = await findById(id);
  if (!existing) return null;

  const next = {
    tenantId: Object.prototype.hasOwnProperty.call(updates, 'tenantId') ? updates.tenantId : existing.tenantId,
    branchId: Object.prototype.hasOwnProperty.call(updates, 'branchId') ? updates.branchId : existing.branchId,
    firstName: Object.prototype.hasOwnProperty.call(updates, 'firstName') ? updates.firstName : existing.firstName,
    lastName: Object.prototype.hasOwnProperty.call(updates, 'lastName') ? updates.lastName : existing.lastName,
    role: Object.prototype.hasOwnProperty.call(updates, 'role') ? updates.role : existing.role,
    employeeId: Object.prototype.hasOwnProperty.call(updates, 'employeeId') ? updates.employeeId : existing.employeeId,
    passwordHash: Object.prototype.hasOwnProperty.call(updates, 'passwordHash') ? updates.passwordHash : existing.passwordHash,
    isActive: Object.prototype.hasOwnProperty.call(updates, 'isActive') ? Boolean(updates.isActive) : existing.isActive,
  };

  const { rows } = await pool.query(
    `
      UPDATE users
      SET tenant_id = $2,
          branch_id = $3,
          first_name = $4,
          last_name = $5,
          role = $6,
          employee_id = $7,
          password_hash = $8,
          is_active = $9,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [id, next.tenantId, next.branchId, next.firstName, next.lastName, next.role, next.employeeId, next.passwordHash, next.isActive],
  );

  const updated = mapUserRow(rows[0]);
  if (updated) {
    await enqueueOutboxEvent({
      branchId: updated.branchId,
      eventType: 'user.updated',
      entityType: 'user',
      entityId: updated.id,
      payload: updated,
    });
  }
  return updated;
}

async function deleteScopedUser({ requestUser, userId }) {
  const pool = getPool();
  const params = [userId];
  let where = 'WHERE id = $1';

  if (requestUser.role !== 'super_admin') {
    params.push(requestUser.tenantId);
    where += ` AND tenant_id = $${params.length}`;
    if (requestUser.branchId) {
      params.push(requestUser.branchId);
      where += ` AND branch_id = $${params.length}`;
    }
  }

  const existing = await pool.query(
    `
      SELECT * FROM users
      ${where}
      LIMIT 1
    `,
    params,
  );

  if (!existing.rowCount) return false;

  const existingUser = mapUserRow(existing.rows[0]);

  const result = await pool.query(
    `
      DELETE FROM users
      ${where}
    `,
    params,
  );

  if (result.rowCount > 0) {
    await enqueueOutboxEvent({
      branchId: existingUser.branchId,
      eventType: 'user.deleted',
      entityType: 'user',
      entityId: existingUser.id,
      payload: {
        id: existingUser.id,
        tenantId: existingUser.tenantId,
        branchId: existingUser.branchId,
        deletedAt: new Date().toISOString(),
      },
    });
    return true;
  }

  return false;
}

module.exports = {
  findByEmail,
  findByEmailExcludingId,
  findById,
  findPasswordById,
  touchLastLogin,
  findMeById,
  updateSelf,
  listUsers,
  findScopedUser,
  createUser,
  updateUserById,
  deleteScopedUser,
};
