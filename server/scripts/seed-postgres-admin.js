require('dotenv').config({ path: '../.env' });
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const DEFAULT_PASSWORD = 'admin123';

(async () => {
  const pool = new Pool({ connectionString: process.env.POSTGRES_URL });
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 12);

  const accounts = [
     { email: 'admin@dewebnet.com', role: 'super_admin', firstName: 'System', lastName: 'Admin', tenantId: 1, branchId: 1 },
     { email: 'clientadmin@dewebnet.com', role: 'client_admin', firstName: 'Client', lastName: 'Admin', tenantId: 1, branchId: 1 },
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
      [a.email, passwordHash, a.firstName, a.lastName, a.role, a.tenantId, a.branchId],
     );
  }

  const { rows } = await pool.query("SELECT email, role, is_active FROM users WHERE role IN ('super_admin','client_admin') ORDER BY role,email");
  console.log(JSON.stringify(rows, null, 2));
  await pool.end();
})();
