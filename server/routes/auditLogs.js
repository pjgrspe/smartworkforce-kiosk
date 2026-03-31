/**
 * Audit Logs — read-only endpoint for viewing the audit_log table.
 * Accessible by super_admin, client_admin, hr_payroll, auditor.
 */
const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { getPool } = require('../config/postgres');

const ALLOWED_ROLES = ['super_admin', 'client_admin', 'hr_payroll', 'auditor'];

router.use(authenticate);

// GET /api/audit-logs
// Query params: table, operation, changedBy, recordId, from, to, page, limit
router.get('/', authorize(...ALLOWED_ROLES), async (req, res) => {
  try {
    const pool = getPool();
    const {
      table, operation, changedBy, recordId,
      from, to,
      page = 1, limit = 50,
    } = req.query;

    const offset = (Math.max(1, parseInt(page)) - 1) * Math.min(200, parseInt(limit) || 50);
    const pageSize = Math.min(200, parseInt(limit) || 50);

    const conditions = [];
    const params = [];
    let p = 1;

    // Tenant scope — super_admin sees all, others see logs from their tenant's users only
    if (req.user.role !== 'super_admin') {
      conditions.push(`(al.changed_by IN (SELECT id FROM users WHERE tenant_id = $${p++}) OR al.changed_by IS NULL)`);
      params.push(req.user.tenantId);
    }

    if (table)      { conditions.push(`al.table_name = $${p++}`);  params.push(table); }
    if (operation)  { conditions.push(`al.operation = $${p++}`);   params.push(operation.toUpperCase()); }
    if (changedBy)  { conditions.push(`al.changed_by = $${p++}`);  params.push(changedBy); }
    if (recordId)   { conditions.push(`al.record_id = $${p++}`);   params.push(recordId); }
    if (from)       { conditions.push(`al.changed_at >= $${p++}`); params.push(from); }
    if (to)         { conditions.push(`al.changed_at <= $${p++}`); params.push(to); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [rows, countRow] = await Promise.all([
      pool.query(
        `SELECT
           al.id, al.table_name, al.record_id, al.operation,
           al.changed_at, al.ip_address, al.notes,
           al.before_data, al.after_data,
           u.email AS changed_by_email,
           u.first_name || ' ' || u.last_name AS changed_by_name
         FROM audit_log al
         LEFT JOIN users u ON u.id = al.changed_by
         ${where}
         ORDER BY al.changed_at DESC
         LIMIT $${p} OFFSET $${p + 1}`,
        [...params, pageSize, offset],
      ),
      pool.query(
        `SELECT COUNT(*) FROM audit_log al ${where}`,
        params,
      ),
    ]);

    return res.json({
      data:  rows.rows,
      total: parseInt(countRow.rows[0].count),
      page:  parseInt(page),
      limit: pageSize,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
