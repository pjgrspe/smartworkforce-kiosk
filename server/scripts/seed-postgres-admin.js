require('dotenv').config({ path: '../.env' });
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const DEFAULT_PASSWORD = 'admin123';

(async () => {
  const pool = new Pool({ connectionString: process.env.POSTGRES_URL });
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 12);

  // Ensure default tenant exists
  const tenantRes = await pool.query(`
    INSERT INTO tenants (name, code, contact_email, is_active)
    VALUES ('DE WEBNET', 'DEWEBNET', 'admin@dewebnet.com', TRUE)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
    RETURNING id
  `);
  const tenantId = tenantRes.rows[0].id;

  // Ensure default branch exists
  const branchRes = await pool.query(`
    INSERT INTO branches (tenant_id, name, code, is_active)
    VALUES ($1, 'Head Office', 'HO', TRUE)
    ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name
    RETURNING id
  `, [tenantId]);
  const branchId = branchRes.rows[0].id;

  const accounts = [
    { email: 'admin@dewebnet.com', role: 'super_admin', firstName: 'System', lastName: 'Admin' },
    { email: 'clientadmin@dewebnet.com', role: 'client_admin', firstName: 'Client', lastName: 'Admin' },
  ];

  for (const a of accounts) {
    await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role, tenant_id, branch_id, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE)
       ON CONFLICT (email) DO UPDATE
       SET password_hash=EXCLUDED.password_hash,
           first_name=EXCLUDED.first_name,
           last_name=EXCLUDED.last_name,
           role=EXCLUDED.role,
           tenant_id=EXCLUDED.tenant_id,
           branch_id=EXCLUDED.branch_id,
           is_active=TRUE,
           updated_at=NOW()`,
      [a.email, passwordHash, a.firstName, a.lastName, a.role, tenantId, branchId],
    );
  }

  const { rows } = await pool.query(
    "SELECT email, role, is_active FROM users WHERE role IN ('super_admin','client_admin') ORDER BY role, email"
  );
  console.log(JSON.stringify(rows, null, 2));
  console.log(`\nTenant ID: ${tenantId}`);
  console.log(`Branch ID: ${branchId}`);
  await pool.end();
})();
