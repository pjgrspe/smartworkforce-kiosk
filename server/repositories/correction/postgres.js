const { getPool } = require('../../config/postgres');

function mapCorrectionRow(row) {
  return {
    _id: row.id,
    id: row.id,
    tenantId: row.tenant_id,
    employeeId: row.employee_ref_id
      ? {
        _id: row.employee_ref_id,
        firstName: row.employee_first_name,
        lastName: row.employee_last_name,
        employeeCode: row.employee_code,
      }
      : row.employee_id,
    requestedBy: row.requested_by_ref_id
      ? {
        _id: row.requested_by_ref_id,
        firstName: row.requested_by_first_name,
        lastName: row.requested_by_last_name,
        email: row.requested_by_email,
      }
      : row.requested_by,
    targetDate: row.target_date,
    reasonCode: row.reason_code,
    notes: row.notes,
    before: row.before_state,
    after: row.after_state,
    status: row.status,
    reviewedBy: row.reviewed_by_ref_id
      ? {
        _id: row.reviewed_by_ref_id,
        firstName: row.reviewed_by_first_name,
        lastName: row.reviewed_by_last_name,
        email: row.reviewed_by_email,
      }
      : row.reviewed_by,
    reviewedAt: row.reviewed_at,
    reviewNotes: row.review_notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function baseSelect() {
  return `
    SELECT
      c.*,
      e.id AS employee_ref_id,
      e.first_name AS employee_first_name,
      e.last_name AS employee_last_name,
      e.employee_code AS employee_code,
      ru.id AS requested_by_ref_id,
      ru.first_name AS requested_by_first_name,
      ru.last_name AS requested_by_last_name,
      ru.email AS requested_by_email,
      rv.id AS reviewed_by_ref_id,
      rv.first_name AS reviewed_by_first_name,
      rv.last_name AS reviewed_by_last_name,
      rv.email AS reviewed_by_email
    FROM attendance_correction_requests c
    LEFT JOIN employees e ON e.id = c.employee_id
    LEFT JOIN users ru ON ru.id = c.requested_by
    LEFT JOIN users rv ON rv.id = c.reviewed_by
  `;
}

async function listMyCorrections({ tenantId, employeeId, status }) {
  const pool = getPool();
  const params = [tenantId, employeeId];
  const where = ['c.tenant_id = $1', 'c.employee_id = $2'];
  if (status) {
    params.push(status);
    where.push(`c.status = $${params.length}`);
  }

  const { rows } = await pool.query(
    `${baseSelect()} WHERE ${where.join(' AND ')} ORDER BY c.created_at DESC`,
    params,
  );

  return rows.map(mapCorrectionRow);
}

async function listCorrections({ tenantId, status, employeeId, scopedEmployeeIds }) {
  const pool = getPool();
  const params = [tenantId];
  const where = ['c.tenant_id = $1'];

  if (status) {
    params.push(status);
    where.push(`c.status = $${params.length}`);
  }

  if (employeeId) {
    params.push(employeeId);
    where.push(`c.employee_id = $${params.length}`);
  }

  if (scopedEmployeeIds) {
    params.push(scopedEmployeeIds);
    where.push(`c.employee_id = ANY($${params.length}::uuid[])`);
  }

  const { rows } = await pool.query(
    `${baseSelect()} WHERE ${where.join(' AND ')} ORDER BY c.created_at DESC`,
    params,
  );

  return rows.map(mapCorrectionRow);
}

async function createCorrection(payload) {
  const pool = getPool();
  const { rows } = await pool.query(
    `
      INSERT INTO attendance_correction_requests (
        tenant_id,
        employee_id,
        requested_by,
        target_date,
        reason_code,
        notes,
        before_state,
        after_state,
        status,
        reviewed_by,
        reviewed_at,
        review_notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, 'pending'), $10, $11, $12)
      RETURNING id
    `,
    [
      payload.tenantId,
      payload.employeeId,
      payload.requestedBy,
      payload.targetDate,
      payload.reasonCode,
      payload.notes || null,
      payload.before || null,
      payload.after || null,
      payload.status || 'pending',
      payload.reviewedBy || null,
      payload.reviewedAt || null,
      payload.reviewNotes || null,
    ],
  );

  const createdId = rows[0].id;
  const { rows: mappedRows } = await pool.query(
    `${baseSelect()} WHERE c.id = $1 LIMIT 1`,
    [createdId],
  );

  return mappedRows[0] ? mapCorrectionRow(mappedRows[0]) : null;
}

async function findPendingCorrection({ id, tenantId, scopedEmployeeIds }) {
  const pool = getPool();
  const params = [id, tenantId];
  const where = ['c.id = $1', 'c.tenant_id = $2', `c.status = 'pending'`];
  if (scopedEmployeeIds) {
    params.push(scopedEmployeeIds);
    where.push(`c.employee_id = ANY($${params.length}::uuid[])`);
  }

  const { rows } = await pool.query(
    `${baseSelect()} WHERE ${where.join(' AND ')} LIMIT 1`,
    params,
  );

  if (!rows[0]) return null;
  const mapped = mapCorrectionRow(rows[0]);

  return {
    ...mapped,
    employeeId: mapped.employeeId && typeof mapped.employeeId === 'object' ? mapped.employeeId._id : mapped.employeeId,
    requestedBy: mapped.requestedBy && typeof mapped.requestedBy === 'object' ? mapped.requestedBy._id : mapped.requestedBy,
    reviewedBy: mapped.reviewedBy && typeof mapped.reviewedBy === 'object' ? mapped.reviewedBy._id : mapped.reviewedBy,
  };
}

async function saveCorrection(doc) {
  const pool = getPool();
  await pool.query(
    `
      UPDATE attendance_correction_requests
      SET before_state = $2,
          after_state = $3,
          status = $4,
          reviewed_by = $5,
          reviewed_at = $6,
          review_notes = $7,
          updated_at = NOW()
      WHERE id = $1
    `,
    [
      doc._id || doc.id,
      doc.before || null,
      doc.after || null,
      doc.status,
      doc.reviewedBy || null,
      doc.reviewedAt || null,
      doc.reviewNotes || null,
    ],
  );

  const { rows } = await pool.query(
    `${baseSelect()} WHERE c.id = $1 LIMIT 1`,
    [doc._id || doc.id],
  );

  return rows[0] ? mapCorrectionRow(rows[0]) : null;
}

async function rejectCorrection({ id, tenantId, scopedEmployeeIds, reviewerId, notes }) {
  const pool = getPool();
  const params = [id, tenantId, reviewerId, notes || null];
  let scopeSql = '';
  if (scopedEmployeeIds) {
    params.push(scopedEmployeeIds);
    scopeSql = ` AND employee_id = ANY($${params.length}::uuid[])`;
  }

  const updateQuery = `
    UPDATE attendance_correction_requests
    SET status = 'rejected',
        reviewed_by = $3,
        reviewed_at = NOW(),
        review_notes = $4,
        updated_at = NOW()
    WHERE id = $1
      AND tenant_id = $2
      AND status = 'pending'
      ${scopeSql}
    RETURNING id
  `;

  const { rows: updatedRows } = await pool.query(updateQuery, params);
  if (!updatedRows.length) return null;

  const { rows } = await pool.query(
    `${baseSelect()} WHERE c.id = $1 LIMIT 1`,
    [updatedRows[0].id],
  );

  return rows[0] ? mapCorrectionRow(rows[0]) : null;
}

module.exports = {
  listMyCorrections,
  listCorrections,
  createCorrection,
  findPendingCorrection,
  saveCorrection,
  rejectCorrection,
};