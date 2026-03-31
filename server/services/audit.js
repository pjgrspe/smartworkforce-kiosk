/**
 * Audit Service
 * Writes a row to audit_log for any sensitive INSERT / UPDATE / DELETE.
 * Failures are logged but never thrown — audit must never break the main flow.
 */

const { getPool } = require('../config/postgres');
const logger = require('../utils/logger');

/**
 * @param {object} opts
 * @param {string}      opts.tableName   - e.g. 'employees'
 * @param {string}      opts.recordId    - primary key of the affected row
 * @param {'INSERT'|'UPDATE'|'DELETE'} opts.operation
 * @param {string|null} opts.changedBy   - user UUID (req.user.sub)
 * @param {object|null} opts.beforeData  - snapshot before change (UPDATE/DELETE)
 * @param {object|null} opts.afterData   - snapshot after change (INSERT/UPDATE)
 * @param {string|null} opts.ipAddress   - req.ip
 * @param {string|null} opts.notes       - optional human-readable context
 */
async function writeAuditLog({
  tableName,
  recordId,
  operation,
  changedBy = null,
  beforeData = null,
  afterData = null,
  ipAddress = null,
  notes = null,
}) {
  try {
    const pool = getPool();
    await pool.query(
      `INSERT INTO audit_log
         (table_name, record_id, operation, changed_by, before_data, after_data, ip_address, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        tableName,
        String(recordId),
        operation,
        changedBy || null,
        beforeData ? JSON.stringify(beforeData) : null,
        afterData  ? JSON.stringify(afterData)  : null,
        ipAddress  || null,
        notes      || null,
      ],
    );
  } catch (err) {
    logger.error(`Audit log write failed (${operation} ${tableName} ${recordId}): ${err.message}`);
  }
}

module.exports = { writeAuditLog };
