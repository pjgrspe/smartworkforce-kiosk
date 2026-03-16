require('dotenv').config({ path: '../.env' });
const { Pool } = require('pg');

(async () => {
  const pool = new Pool({ connectionString: process.env.POSTGRES_URL });
  const { rows } = await pool.query(
    "SELECT email, role, is_active FROM users WHERE role IN ('super_admin','client_admin') ORDER BY role, email"
  );
  console.log(JSON.stringify(rows, null, 2));
  await pool.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
