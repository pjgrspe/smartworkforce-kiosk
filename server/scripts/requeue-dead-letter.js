const { Pool } = require('pg');
const fs = require('fs');

const connStr = fs.readFileSync('../.env', 'utf8').match(/POSTGRES_URL=(.+)/)[1].trim();
const pool = new Pool({ connectionString: connStr });

async function main() {
  const requeue = await pool.query(`
    INSERT INTO sync_inbox (branch_id, idempotency_key, payload)
    SELECT branch_id, idempotency_key, payload FROM sync_dead_letter
    ON CONFLICT (branch_id, idempotency_key) DO NOTHING
  `);
  console.log('Re-queued rows:', requeue.rowCount);

  const del = await pool.query('DELETE FROM sync_dead_letter');
  console.log('Cleared dead letter:', del.rowCount);

  const tenants = await pool.query('SELECT id, name FROM tenants');
  console.log('\nLocal tenants:');
  console.table(tenants.rows);

  const attTenants = await pool.query(`
    SELECT payload->>'tenantId' AS tenant_id, COUNT(*)
    FROM sync_inbox
    WHERE payload->>'eventType' = 'attendance.created'
    GROUP BY 1
  `);
  console.log('\nAttendance tenant IDs in inbox:');
  console.table(attTenants.rows);

  await pool.end();
}

main().catch(e => { console.error(e.message); pool.end(); });
