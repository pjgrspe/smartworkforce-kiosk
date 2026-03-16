const { Pool } = require('pg');
const fs = require('fs');
const pool = new Pool({ connectionString: fs.readFileSync('../.env', 'utf8').match(/POSTGRES_URL=(.+)/)[1].trim() });
pool.query("DELETE FROM payroll_runs WHERE status = 'draft'")
  .then(r => { console.log('Deleted:', r.rowCount, 'draft runs'); pool.end(); })
  .catch(e => { console.error(e.message); pool.end(); });
