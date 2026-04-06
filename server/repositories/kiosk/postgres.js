const { getPool } = require('../../config/postgres');
const { enqueueOutboxEvent } = require('../../services/sync-outbox');

function mapEmployeeForKiosk(row) {
  return {
    _id: row.id,
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    employeeCode: row.employee_code,
    branchId: row.branch_id,
    faceData: {
      faceApiDescriptors: row.face_api_descriptors || [],
      enrollmentDate: row.enrollment_date,
    },
  };
}

function mapRecentAttendance(row) {
  return {
    _id: row.id,
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id,
    timestamp: row.timestamp,
    type: row.type,
    source: row.source,
    confidenceScore: row.confidence_score == null ? null : Number(row.confidence_score),
    synced: row.synced,
    syncedAt: row.synced_at,
    employeeId: row.employee_ref_id
      ? {
        _id: row.employee_ref_id,
        firstName: row.employee_first_name,
        lastName: row.employee_last_name,
        employeeCode: row.employee_code,
      }
      : row.employee_id,
  };
}

async function getEmployeesForKiosk(tenantId) {
  const pool = getPool();
  const { rows } = await pool.query(
    `
      SELECT
        id,
        first_name,
        last_name,
        employee_code,
        branch_id,
        face_data->'faceApiDescriptors' AS face_api_descriptors,
        face_data->>'enrollmentDate' AS enrollment_date
      FROM employees
      WHERE tenant_id = $1
        AND is_active = TRUE
      ORDER BY last_name ASC, first_name ASC
    `,
    [tenantId],
  );
  return rows.map(mapEmployeeForKiosk);
}

async function getRecentAttendance(tenantId, limit = 15) {
  const pool = getPool();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const { rows } = await pool.query(
    `
      SELECT
        al.*,
        e.id AS employee_ref_id,
        e.first_name AS employee_first_name,
        e.last_name AS employee_last_name,
        e.employee_code AS employee_code
      FROM attendance_logs al
      LEFT JOIN employees e ON e.id = al.employee_id
      WHERE al.tenant_id = $1
        AND al.timestamp >= $2
      ORDER BY al.timestamp DESC
      LIMIT $3
    `,
    [tenantId, today, limit],
  );
  return rows.map(mapRecentAttendance);
}

const VALID_NEXT = {
  null:        ['IN'],
  'IN':        ['OUT', 'BREAK_IN'],
  'OUT':       ['IN'],
  'BREAK_IN':  ['BREAK_OUT'],
  'BREAK_OUT': ['OUT', 'BREAK_IN'],
};

function punchSequenceError(last, next) {
  if ((VALID_NEXT[last] ?? VALID_NEXT[null]).includes(next)) return null;
  if (next === 'IN'        && last === 'IN')        return 'Already clocked in. Clock out first.';
  if (next === 'IN'        && last === 'BREAK_IN')  return 'Break in progress. End your break first.';
  if (next === 'IN'        && last === 'BREAK_OUT') return 'Already clocked in. Clock out first.';
  if (next === 'OUT'       && !last)                return 'Not clocked in. Clock in first.';
  if (next === 'OUT'       && last === 'OUT')       return 'Already clocked out.';
  if (next === 'OUT'       && last === 'BREAK_IN')  return 'Break in progress. End your break before clocking out.';
  if (next === 'BREAK_IN'  && !last)                return 'Not clocked in. Clock in before starting a break.';
  if (next === 'BREAK_IN'  && last === 'OUT')       return 'Not clocked in. Clock in before starting a break.';
  if (next === 'BREAK_IN'  && last === 'BREAK_IN')  return 'Already on break.';
  if (next === 'BREAK_OUT' && last !== 'BREAK_IN')  return 'Not on break.';
  return `Cannot record ${next} after ${last || 'no punch today'}.`;
}

async function createPunch({ tenantId, employeeId, type, confidenceScore, timestamp }) {
  const pool = getPool();
  const employeeResult = await pool.query(
    `
      SELECT id, branch_id, first_name, last_name, employee_code
      FROM employees
      WHERE id = $1 AND tenant_id = $2 AND is_active = TRUE
      LIMIT 1
    `,
    [employeeId, tenantId],
  );

  if (!employeeResult.rowCount) return null;
  const employee = employeeResult.rows[0];

  // ── Sequence validation ──────────────────────────────────────────────────────
  const todayStart = new Date(timestamp);
  todayStart.setHours(0, 0, 0, 0);
  const lastPunchResult = await pool.query(
    `SELECT type FROM attendance_logs
     WHERE employee_id = $1 AND tenant_id = $2 AND timestamp >= $3
     ORDER BY timestamp DESC LIMIT 1`,
    [employeeId, tenantId, todayStart],
  );
  const lastType = lastPunchResult.rows[0]?.type ?? null;
  const seqErr = punchSequenceError(lastType, type);
  if (seqErr) {
    const err = new Error(seqErr);
    err.code = 'PUNCH_SEQUENCE_ERROR';
    throw err;
  }

  const { rows } = await pool.query(
    `
      INSERT INTO attendance_logs (
        tenant_id, branch_id, employee_id, timestamp, type, source, confidence_score, synced, synced_at
      )
      VALUES ($1, $2, $3, $4, $5, 'face_kiosk', $6, TRUE, NOW())
      RETURNING *
    `,
    [tenantId, employee.branch_id, employeeId, timestamp, type, confidenceScore != null ? Number(confidenceScore) : null],
  );

  const result = {
    _id: rows[0].id,
    id: rows[0].id,
    tenantId: rows[0].tenant_id,
    branchId: rows[0].branch_id,
    timestamp: rows[0].timestamp,
    type: rows[0].type,
    source: rows[0].source,
    confidenceScore: rows[0].confidence_score == null ? null : Number(rows[0].confidence_score),
    synced: rows[0].synced,
    syncedAt: rows[0].synced_at,
    employeeId: {
      _id: employee.id,
      firstName: employee.first_name,
      lastName: employee.last_name,
      employeeCode: employee.employee_code,
    },
  };

  await enqueueOutboxEvent({
    branchId: result.branchId,
    eventType: 'attendance.created',
    entityType: 'attendance_log',
    entityId: result.id,
    payload: {
      id: result.id,
      tenantId: result.tenantId,
      branchId: result.branchId,
      employeeId: employee.id,
      timestamp: result.timestamp,
      type: result.type,
      source: result.source,
      confidenceScore: result.confidenceScore,
    },
  });

  return result;
}

async function flushQueuedPunch(punch) {
  const pool = getPool();
  const { rows } = await pool.query(
    `
      INSERT INTO attendance_logs (
        tenant_id, branch_id, employee_id, timestamp, type, source, confidence_score, synced, synced_at
      )
      VALUES ($1, $2, $3, $4, $5, 'face_kiosk', $6, TRUE, NOW())
      RETURNING id, tenant_id, branch_id, employee_id, timestamp, type, source, confidence_score
    `,
    [
      punch.tenantId,
      punch.branchId || null,
      punch.employeeId,
      new Date(punch.timestamp),
      punch.type,
      punch.confidenceScore != null ? Number(punch.confidenceScore) : null,
    ],
  );

  if (rows[0]) {
    await enqueueOutboxEvent({
      branchId: rows[0].branch_id,
      eventType: 'attendance.created',
      entityType: 'attendance_log',
      entityId: rows[0].id,
      payload: {
        id: rows[0].id,
        tenantId: rows[0].tenant_id,
        branchId: rows[0].branch_id,
        employeeId: rows[0].employee_id,
        timestamp: rows[0].timestamp,
        type: rows[0].type,
        source: rows[0].source,
        confidenceScore: rows[0].confidence_score != null ? Number(rows[0].confidence_score) : null,
      },
    });
  }
}

module.exports = {
  getEmployeesForKiosk,
  getRecentAttendance,
  createPunch,
  flushQueuedPunch,
};