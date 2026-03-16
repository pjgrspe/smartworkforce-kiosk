const { getPool } = require('../../config/postgres');

function mapTenant(row) {
  if (!row) return null;
  return {
    _id: row.id,
    id: row.id,
    name: row.name,
    code: row.code,
    domain: row.domain,
    logoUrl: row.logo_url,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    address: row.address,
    subscription: row.subscription || {},
    settings: row.settings || {},
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function findActiveByCode(code) {
  const pool = getPool();
  const { rows } = await pool.query('SELECT * FROM tenants WHERE code = $1 AND is_active = TRUE LIMIT 1', [code]);
  return mapTenant(rows[0]);
}

async function listTenants({ user }) {
  const pool = getPool();
  const params = [];
  let query = 'SELECT * FROM tenants';
  if (user.role !== 'super_admin') {
    params.push(user.tenantId);
    query += ' WHERE id = $1';
  }
  query += ' ORDER BY name ASC';
  const { rows } = await pool.query(query, params);
  return rows.map(mapTenant);
}

async function findById(id) {
  const pool = getPool();
  const { rows } = await pool.query('SELECT * FROM tenants WHERE id = $1 LIMIT 1', [id]);
  return mapTenant(rows[0]);
}

async function createTenant(payload) {
  const pool = getPool();
  const { rows } = await pool.query(
    `
      INSERT INTO tenants (name, code, domain, logo_url, contact_email, contact_phone, address, subscription, settings, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, TRUE))
      RETURNING *
    `,
    [
      payload.name,
      payload.code,
      payload.domain || null,
      payload.logoUrl || null,
      payload.contactEmail || null,
      payload.contactPhone || null,
      payload.address || null,
      payload.subscription || {},
      payload.settings || {},
      Object.prototype.hasOwnProperty.call(payload, 'isActive') ? Boolean(payload.isActive) : true,
    ],
  );
  return mapTenant(rows[0]);
}

async function updateTenant(id, patch) {
  const current = await findById(id);
  if (!current) return null;

  const next = {
    name: Object.prototype.hasOwnProperty.call(patch, 'name') ? patch.name : current.name,
    code: Object.prototype.hasOwnProperty.call(patch, 'code') ? patch.code : current.code,
    domain: Object.prototype.hasOwnProperty.call(patch, 'domain') ? patch.domain : current.domain,
    logoUrl: Object.prototype.hasOwnProperty.call(patch, 'logoUrl') ? patch.logoUrl : current.logoUrl,
    contactEmail: Object.prototype.hasOwnProperty.call(patch, 'contactEmail') ? patch.contactEmail : current.contactEmail,
    contactPhone: Object.prototype.hasOwnProperty.call(patch, 'contactPhone') ? patch.contactPhone : current.contactPhone,
    address: Object.prototype.hasOwnProperty.call(patch, 'address') ? patch.address : current.address,
    subscription: Object.prototype.hasOwnProperty.call(patch, 'subscription') ? patch.subscription : current.subscription,
    settings: Object.prototype.hasOwnProperty.call(patch, 'settings') ? patch.settings : current.settings,
    isActive: Object.prototype.hasOwnProperty.call(patch, 'isActive') ? Boolean(patch.isActive) : current.isActive,
  };

  const pool = getPool();
  const { rows } = await pool.query(
    `
      UPDATE tenants
      SET name = $2,
          code = $3,
          domain = $4,
          logo_url = $5,
          contact_email = $6,
          contact_phone = $7,
          address = $8,
          subscription = $9,
          settings = $10,
          is_active = $11,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [id, next.name, next.code, next.domain, next.logoUrl, next.contactEmail, next.contactPhone, next.address, next.subscription, next.settings, next.isActive],
  );
  return mapTenant(rows[0]);
}

module.exports = {
  findActiveByCode,
  listTenants,
  findById,
  createTenant,
  updateTenant,
};