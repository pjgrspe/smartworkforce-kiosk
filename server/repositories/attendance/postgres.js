const { getPool } = require('../../config/postgres');
const { enqueueOutboxEvent } = require('../../services/sync-outbox');

function mapAttendanceRow(row) {
  return {
    _id: row.id,
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id,
    employeeId: row.employee_id,
    timestamp: row.timestamp,
    type: row.type,
    source: row.source,
    deviceId: row.device_id,
    confidenceScore: row.confidence_score == null ? null : Number(row.confidence_score),
    exceptions: row.exceptions || {},
    synced: row.synced,
    syncedAt: row.synced_at,
    localId: row.local_id,
    correctionRef: row.correction_ref,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAttendanceWithEmployeeRow(row) {
  return {
    ...mapAttendanceRow(row),
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

function buildListFilters({ user, employeeId, branchId, startDate, endDate }) {
  const filters = ['al.tenant_id = $1'];
  const params = [user.tenantId];

  if (employeeId) {
    params.push(employeeId);
    filters.push(`al.employee_id = $${params.length}`);
  }

  if (branchId) {
    params.push(branchId);
    filters.push(`al.branch_id = $${params.length}`);
  }

  if (startDate) {
    params.push(new Date(startDate));
    filters.push(`al.timestamp >= $${params.length}`);
  }

  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    params.push(end);
    filters.push(`al.timestamp <= $${params.length}`);
  }

  if (user.role !== 'super_admin' && user.branchId) {
    params.push(user.branchId);
    filters.push(`al.branch_id = $${params.length}`);
  }

  return { filters, params };
}

async function getMyAttendance({ user, startDate, endDate, limit }) {
  const pool = getPool();
  const filters = ['tenant_id = $1', 'employee_id = $2'];
  const params = [user.tenantId, user.employeeId];

  if (startDate) {
    params.push(new Date(startDate));
    filters.push(`timestamp >= $${params.length}`);
  }

  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    params.push(end);
    filters.push(`timestamp <= $${params.length}`);
  }

  params.push(limit || 100);
  const query = `
    SELECT *
    FROM attendance_logs
    WHERE ${filters.join(' AND ')}
    ORDER BY timestamp DESC
    LIMIT $${params.length}
  `;

  const { rows } = await pool.query(query, params);
  return rows.map(mapAttendanceRow);
}

async function listAttendance({ user, employeeId, branchId, startDate, endDate, limit }) {
  const pool = getPool();
  const { filters, params } = buildListFilters({ user, employeeId, branchId, startDate, endDate });

  params.push(limit || 200);
  const query = `
    SELECT
      al.*,
      e.id AS employee_ref_id,
      e.first_name AS employee_first_name,
      e.last_name AS employee_last_name,
      e.employee_code AS employee_code
    FROM attendance_logs al
    LEFT JOIN employees e ON e.id = al.employee_id
    WHERE ${filters.join(' AND ')}
    ORDER BY al.timestamp DESC
    LIMIT $${params.length}
  `;

  const { rows } = await pool.query(query, params);
  return rows.map(mapAttendanceWithEmployeeRow);
}

async function listToday({ user }) {
  const pool = getPool();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const params = [user.tenantId, today];
  const filters = ['al.tenant_id = $1', 'al.timestamp >= $2'];

  if (user.role !== 'super_admin' && user.branchId) {
    params.push(user.branchId);
    filters.push(`al.branch_id = $${params.length}`);
  }

  const query = `
    SELECT
      al.*,
      e.id AS employee_ref_id,
      e.first_name AS employee_first_name,
      e.last_name AS employee_last_name,
      e.employee_code AS employee_code
    FROM attendance_logs al
    LEFT JOIN employees e ON e.id = al.employee_id
    WHERE ${filters.join(' AND ')}
    ORDER BY al.timestamp DESC
  `;

  const { rows } = await pool.query(query, params);
  return rows.map(mapAttendanceWithEmployeeRow);
}

async function createManualAttendance({ user, payload }) {
  const pool = getPool();
  const effectiveBranchId = user.role !== 'super_admin' && user.branchId
    ? user.branchId
    : (payload.branchId || null);

  const query = `
    INSERT INTO attendance_logs (
      tenant_id,
      branch_id,
      employee_id,
      timestamp,
      type,
      source,
      device_id,
      confidence_score,
      synced,
      synced_at,
      notes
    )
    VALUES ($1, $2, $3, COALESCE($4, NOW()), COALESCE($5, 'IN'), 'admin_correction', $6, $7, TRUE, NOW(), $8)
    RETURNING *
  `;

  const params = [
    user.tenantId,
    effectiveBranchId,
    payload.employeeId,
    payload.timestamp ? new Date(payload.timestamp) : null,
    payload.type || 'IN',
    payload.deviceId || null,
    payload.confidenceScore == null ? null : Number(payload.confidenceScore),
    payload.notes || null,
  ];

  const { rows } = await pool.query(query, params);
  const created = mapAttendanceRow(rows[0]);

  await enqueueOutboxEvent({
    branchId: effectiveBranchId,
    eventType: 'attendance.created',
    entityType: 'attendance_log',
    entityId: created.id,
    payload: {
      id: created.id,
      tenantId: created.tenantId,
      branchId: created.branchId,
      employeeId: created.employeeId,
      timestamp: created.timestamp,
      type: created.type,
      source: created.source,
      confidenceScore: created.confidenceScore,
      notes: created.notes,
    },
  });

  return created;
}

async function createCorrectionAttendance({ tenantId, branchId, employeeId, timestamp, type, correctionRef, notes }) {
  const pool = getPool();
  const { rows } = await pool.query(
    `
      INSERT INTO attendance_logs (
        tenant_id,
        branch_id,
        employee_id,
        timestamp,
        type,
        source,
        synced,
        synced_at,
        correction_ref,
        notes
      )
      VALUES ($1, $2, $3, $4, $5, 'admin_correction', TRUE, NOW(), $6, $7)
      RETURNING *
    `,
    [tenantId, branchId || null, employeeId, timestamp, type, correctionRef || null, notes || null],
  );

  const created = mapAttendanceRow(rows[0]);
  await enqueueOutboxEvent({
    branchId: created.branchId,
    eventType: 'attendance.created',
    entityType: 'attendance_log',
    entityId: created.id,
    payload: {
      id: created.id,
      tenantId: created.tenantId,
      branchId: created.branchId,
      employeeId: created.employeeId,
      timestamp: created.timestamp,
      type: created.type,
      source: created.source,
      notes: created.notes,
    },
  });

  return created;
}

async function getCorrectionAttendanceLog({ id, tenantId, employeeId }) {
  const pool = getPool();
  const { rows } = await pool.query(
    `
      SELECT *
      FROM attendance_logs
      WHERE id = $1
        AND tenant_id = $2
        AND employee_id = $3
      LIMIT 1
    `,
    [id, tenantId, employeeId],
  );
  return rows[0] ? mapAttendanceRow(rows[0]) : null;
}

async function updateCorrectionAttendanceLog({ id, tenantId, employeeId, patch }) {
  const current = await getCorrectionAttendanceLog({ id, tenantId, employeeId });
  if (!current) return null;

  const next = {
    type: Object.prototype.hasOwnProperty.call(patch, 'type') ? patch.type : current.type,
    timestamp: Object.prototype.hasOwnProperty.call(patch, 'timestamp') ? patch.timestamp : current.timestamp,
    source: Object.prototype.hasOwnProperty.call(patch, 'source') ? patch.source : current.source,
    synced: Object.prototype.hasOwnProperty.call(patch, 'synced') ? patch.synced : current.synced,
    syncedAt: Object.prototype.hasOwnProperty.call(patch, 'syncedAt') ? patch.syncedAt : current.syncedAt,
    correctionRef: Object.prototype.hasOwnProperty.call(patch, 'correctionRef') ? patch.correctionRef : current.correctionRef,
    notes: Object.prototype.hasOwnProperty.call(patch, 'notes') ? patch.notes : current.notes,
  };

  const pool = getPool();
  const { rows } = await pool.query(
    `
      UPDATE attendance_logs
      SET type = $4,
          timestamp = $5,
          source = $6,
          synced = $7,
          synced_at = $8,
          correction_ref = $9,
          notes = $10,
          updated_at = NOW()
      WHERE id = $1
        AND tenant_id = $2
        AND employee_id = $3
      RETURNING *
    `,
    [id, tenantId, employeeId, next.type, next.timestamp, next.source, next.synced, next.syncedAt, next.correctionRef, next.notes],
  );

  return rows[0] ? mapAttendanceRow(rows[0]) : null;
}

async function deleteCorrectionAttendanceLog({ id, tenantId, employeeId }) {
  const pool = getPool();
  const { rows } = await pool.query(
    `
      DELETE FROM attendance_logs
      WHERE id = $1
        AND tenant_id = $2
        AND employee_id = $3
      RETURNING *
    `,
    [id, tenantId, employeeId],
  );
  return rows[0] ? mapAttendanceRow(rows[0]) : null;
}

module.exports = {
  getMyAttendance,
  listAttendance,
  listToday,
  createManualAttendance,
  createCorrectionAttendance,
  getCorrectionAttendanceLog,
  updateCorrectionAttendanceLog,
  deleteCorrectionAttendanceLog,
};
