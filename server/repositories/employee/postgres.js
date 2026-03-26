const crypto = require('crypto');
const { getPool } = require('../../config/postgres');
const { enqueueOutboxEvent } = require('../../services/sync-outbox');

function mapEmployeeRow(row) {
  return {
    _id: row.id,
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id,
    departmentId: row.department_id,
    employeeCode: row.employee_code,
    firstName: row.first_name,
    middleName: row.middle_name,
    lastName: row.last_name,
    photoUrl: row.photo_url,
    dateOfBirth: row.date_of_birth,
    gender: row.gender,
    contactNumber: row.contact_number,
    email: row.email,
    address: row.address,
    employment: row.employment || {},
    govIds: row.gov_ids || {},
    bank: row.bank || {},
    taxStatus: row.tax_status,
    dependents: row.dependents,
    faceData: row.face_data || {},
    scheduleId: row.schedule_id,
    documents: (row.documents || []).map(({ data: _d, ...meta }) => meta),
    reportsToId: row.reports_to || null,
    leaveConfig: row.leave_config || {},
    isActive: row.is_active,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapEmployeeWithBranchRow(row) {
  const mapped = mapEmployeeRow(row);
  if (row.branch_ref_id) {
    mapped.branchId = {
      _id: row.branch_ref_id,
      name: row.branch_name,
      code: row.branch_code,
    };
  }
  return mapped;
}

function mapCreateOrUpdatePayload(payload) {
  return {
    branchId: payload.branchId,
    departmentId: payload.departmentId || null,
    employeeCode: payload.employeeCode,
    firstName: payload.firstName,
    middleName: payload.middleName || null,
    lastName: payload.lastName,
    photoUrl: payload.photoUrl || null,
    dateOfBirth: payload.dateOfBirth || null,
    gender: payload.gender || null,
    contactNumber: payload.contactNumber || null,
    email: payload.email || null,
    address: payload.address || null,
    employment: payload.employment || {},
    govIds: payload.govIds || {},
    bank: payload.bank || {},
    taxStatus: payload.taxStatus || null,
    dependents: payload.dependents == null ? 0 : payload.dependents,
    faceData: payload.faceData || {},
    scheduleId: payload.scheduleId || null,
    reportsToId: payload.reportsToId || null,
    leaveConfig: payload.leaveConfig != null ? payload.leaveConfig : {},
    isActive: payload.isActive == null ? true : Boolean(payload.isActive),
    createdBy: payload.createdBy || null,
  };
}

async function ensureRelations(pool, tenantId, payload) {
  if (!payload.branchId) {
    throw new Error('Please select a branch for this employee.');
  }

  const branch = await pool.query(
    'SELECT id FROM branches WHERE id = $1 AND tenant_id = $2 LIMIT 1',
    [payload.branchId, tenantId],
  );
  if (!branch.rowCount) {
    throw new Error('Invalid branch for current tenant');
  }

  if (payload.departmentId) {
    const department = await pool.query(
      'SELECT id FROM departments WHERE id = $1 AND tenant_id = $2 LIMIT 1',
      [payload.departmentId, tenantId],
    );
    if (!department.rowCount) throw new Error('Invalid department for current tenant');
  }

  if (payload.scheduleId) {
    const schedule = await pool.query(
      'SELECT id FROM schedules WHERE id = $1 AND tenant_id = $2 LIMIT 1',
      [payload.scheduleId, tenantId],
    );
    if (!schedule.rowCount) throw new Error('Invalid schedule for current tenant');
  }

  if (payload.reportsToId) {
    const supervisor = await pool.query(
      'SELECT id FROM employees WHERE id = $1 AND tenant_id = $2 AND is_active = TRUE LIMIT 1',
      [payload.reportsToId, tenantId],
    );
    if (!supervisor.rowCount) throw new Error('Invalid supervisor for current tenant');
  }
}

async function ensureEmployeeCodeAvailable(pool, tenantId, employeeCode, currentEmployeeId = null) {
  if (!employeeCode) return;

  const params = [tenantId, employeeCode];
  let query = `
    SELECT id, is_active
    FROM employees
    WHERE tenant_id = $1 AND employee_code = $2
  `;

  if (currentEmployeeId) {
    params.push(currentEmployeeId);
    query += ` AND id <> $${params.length}`;
  }

  query += ' LIMIT 1';
  const existing = await pool.query(query, params);
  if (!existing.rowCount) return;

  const row = existing.rows[0];
  if (row.is_active) {
    const err = new Error(`Employee code "${employeeCode}" is already in use.`);
    err.code = 'DUPLICATE_EMPLOYEE_CODE';
    throw err;
  }

  const archiveSuffix = Date.now().toString(36);
  await pool.query(
    `
      UPDATE employees
      SET employee_code = $1,
          email = CASE WHEN email IS NULL THEN NULL ELSE CONCAT(email, '.archived.', $2) END,
          updated_at = NOW()
      WHERE id = $3
    `,
    [`${employeeCode}__archived__${archiveSuffix}`, archiveSuffix, row.id],
  );
}

async function getProfile({ user }) {
  const pool = getPool();
  const { rows } = await pool.query(
    `
      SELECT
        e.*,
        b.id AS branch_ref_id,
        b.name AS branch_name,
        b.code AS branch_code
      FROM employees e
      LEFT JOIN branches b ON b.id = e.branch_id
      WHERE e.id = $1
        AND e.tenant_id = $2
        AND e.is_active = TRUE
      LIMIT 1
    `,
    [user.employeeId, user.tenantId],
  );

  return rows[0] ? mapEmployeeWithBranchRow(rows[0]) : null;
}

async function listActive({ user }) {
  const pool = getPool();
  const params = [user.tenantId];
  let query = `
    SELECT *
    FROM employees
    WHERE tenant_id = $1
      AND is_active = TRUE
  `;

  if (!['super_admin', 'client_admin'].includes(user.role) && user.branchId) {
    params.push(user.branchId);
    query += ` AND branch_id = $${params.length}`;
  }

  query += ' ORDER BY last_name ASC';
  const { rows } = await pool.query(query, params);
  return rows.map(mapEmployeeRow);
}

async function listActiveForPayroll({ tenantId, branchId }) {
  const pool = getPool();
  const params = [tenantId];
  let query = `
    SELECT *
    FROM employees
    WHERE tenant_id = $1
      AND is_active = TRUE
  `;

  if (branchId) {
    params.push(branchId);
    query += ` AND branch_id = $${params.length}`;
  }

  query += ' ORDER BY last_name ASC';
  const { rows } = await pool.query(query, params);
  return rows.map(mapEmployeeRow);
}

async function getById({ user, id }) {
  const pool = getPool();
  const params = [id, user.tenantId];
  let query = `
    SELECT *
    FROM employees
    WHERE id = $1
      AND tenant_id = $2
  `;

  if (!['super_admin', 'client_admin'].includes(user.role) && user.branchId) {
    params.push(user.branchId);
    query += ` AND branch_id = $${params.length}`;
  }

  query += ' LIMIT 1';
  const { rows } = await pool.query(query, params);
  return rows[0] ? mapEmployeeRow(rows[0]) : null;
}

async function findActiveEmployeeById({ id, tenantId }) {
  const pool = getPool();
  const { rows } = await pool.query(
    `
      SELECT *
      FROM employees
      WHERE id = $1
        AND tenant_id = $2
        AND is_active = TRUE
      LIMIT 1
    `,
    [id, tenantId],
  );
  return rows[0] ? mapEmployeeRow(rows[0]) : null;
}

async function createEmployee({ user, payload }) {
  const pool = getPool();
  const mapped = mapCreateOrUpdatePayload(payload);

  await ensureRelations(pool, user.tenantId, mapped);
  await ensureEmployeeCodeAvailable(pool, user.tenantId, mapped.employeeCode);

  const { rows } = await pool.query(
    `
      INSERT INTO employees (
        tenant_id,
        branch_id,
        department_id,
        employee_code,
        first_name,
        middle_name,
        last_name,
        photo_url,
        date_of_birth,
        gender,
        contact_number,
        email,
        address,
        employment,
        gov_ids,
        bank,
        tax_status,
        dependents,
        face_data,
        schedule_id,
        reports_to,
        is_active,
        created_by,
        leave_config
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19,
        $20, $21, $22, $23, $24
      )
      RETURNING *
    `,
    [
      user.tenantId,
      mapped.branchId,
      mapped.departmentId,
      mapped.employeeCode,
      mapped.firstName,
      mapped.middleName,
      mapped.lastName,
      mapped.photoUrl,
      mapped.dateOfBirth,
      mapped.gender,
      mapped.contactNumber,
      mapped.email,
      mapped.address,
      mapped.employment,
      mapped.govIds,
      mapped.bank,
      mapped.taxStatus,
      mapped.dependents,
      mapped.faceData,
      mapped.scheduleId,
      mapped.reportsToId,
      mapped.isActive,
      mapped.createdBy,
      mapped.leaveConfig,
    ],
  );

  const created = mapEmployeeRow(rows[0]);

  await enqueueOutboxEvent({
    branchId: created.branchId,
    eventType: 'employee.created',
    entityType: 'employee',
    entityId: created.id,
    payload: created,
  });

  return created;
}

async function updateEmployee({ user, id, patch }) {
  const pool = getPool();
  const existing = await getById({ user, id });
  if (!existing) return null;

  const merged = {
    ...existing,
    ...patch,
  };

  const mapped = mapCreateOrUpdatePayload(merged);
  await ensureRelations(pool, user.tenantId, mapped);
  await ensureEmployeeCodeAvailable(pool, user.tenantId, mapped.employeeCode, id);

  const { rows } = await pool.query(
    `
      UPDATE employees
      SET
        branch_id = $2,
        department_id = $3,
        employee_code = $4,
        first_name = $5,
        middle_name = $6,
        last_name = $7,
        photo_url = $8,
        date_of_birth = $9,
        gender = $10,
        contact_number = $11,
        email = $12,
        address = $13,
        employment = $14,
        gov_ids = $15,
        bank = $16,
        tax_status = $17,
        dependents = $18,
        face_data = $19,
        schedule_id = $20,
        reports_to = $21,
        is_active = $22,
        leave_config = $23,
        updated_at = NOW()
      WHERE id = $1
        AND tenant_id = $24
      RETURNING *
    `,
    [
      id,
      mapped.branchId,
      mapped.departmentId,
      mapped.employeeCode,
      mapped.firstName,
      mapped.middleName,
      mapped.lastName,
      mapped.photoUrl,
      mapped.dateOfBirth,
      mapped.gender,
      mapped.contactNumber,
      mapped.email,
      mapped.address,
      mapped.employment,
      mapped.govIds,
      mapped.bank,
      mapped.taxStatus,
      mapped.dependents,
      mapped.faceData,
      mapped.scheduleId,
      mapped.reportsToId,
      mapped.isActive,
      mapped.leaveConfig,
      user.tenantId,
    ],
  );

  const updated = rows[0] ? mapEmployeeRow(rows[0]) : null;
  if (updated) {
    await enqueueOutboxEvent({
      branchId: updated.branchId,
      eventType: 'employee.updated',
      entityType: 'employee',
      entityId: updated.id,
      payload: updated,
    });
  }

  return updated;
}

async function enrollFace({ user, id, descriptors }) {
  const pool = getPool();
  const existing = await getById({ user, id });
  if (!existing) return null;

  const currentFaceData = existing.faceData || {};
  const history = Array.isArray(currentFaceData.reEnrollmentHistory)
    ? [...currentFaceData.reEnrollmentHistory]
    : [];

  history.push({
    enrolledAt: new Date().toISOString(),
    enrolledBy: user.sub,
    note: `Browser enrollment - ${descriptors.length} sample(s)`,
  });

  const nextFaceData = {
    ...currentFaceData,
    faceApiDescriptors: descriptors,
    enrollmentDate: new Date().toISOString(),
    enrollmentBranchId: user.branchId || null,
    reEnrollmentHistory: history,
  };

  const { rows } = await pool.query(
    `
      UPDATE employees
      SET face_data = $2,
          updated_at = NOW()
      WHERE id = $1
        AND tenant_id = $3
      RETURNING *
    `,
    [id, nextFaceData, user.tenantId],
  );

  const updated = rows[0] ? mapEmployeeRow(rows[0]) : null;
  if (updated) {
    await enqueueOutboxEvent({
      branchId: updated.branchId,
      eventType: 'employee.face_enrolled',
      entityType: 'employee',
      entityId: updated.id,
      payload: {
        id: updated.id,
        tenantId: updated.tenantId,
        employeeCode: updated.employeeCode,
        faceData: updated.faceData,
      },
    });
  }

  return updated;
}

async function softDeleteEmployee({ user, id }) {
  const pool = getPool();
  const existing = await getById({ user, id });
  if (!existing) return null;

  await pool.query(
    `
      UPDATE employees
      SET
        is_active = FALSE,
        employee_code = $2,
        email = CASE WHEN email IS NULL THEN NULL ELSE CONCAT(email, '.archived.', $3::text) END,
        employment = jsonb_set(COALESCE(employment, '{}'::jsonb), '{status}', '"inactive"'::jsonb),
        updated_at = NOW()
      WHERE id = $1
        AND tenant_id = $4
    `,
    [
      id,
      `${existing.employeeCode}__archived__${Date.now().toString(36)}`,
      Date.now().toString(36),
      user.tenantId,
    ],
  );

  await enqueueOutboxEvent({
    branchId: existing.branchId,
    eventType: 'employee.deactivated',
    entityType: 'employee',
    entityId: existing.id,
    payload: {
      id: existing.id,
      employeeCode: existing.employeeCode,
      email: existing.email,
      deactivatedAt: new Date().toISOString(),
    },
  });

  return true;
}

async function addDocument({ user, id, doc }) {
  const pool = getPool();
  const newDoc = {
    id: crypto.randomUUID(),
    category: doc.category,
    label: doc.label || '',
    fileName: doc.fileName,
    mimeType: doc.mimeType,
    size: doc.size,
    data: doc.data,
    uploadedAt: new Date().toISOString(),
    uploadedBy: user.sub,
  };

  const { rows } = await pool.query(
    `
      UPDATE employees
      SET documents   = COALESCE(documents, '[]'::jsonb) || $2::jsonb,
          updated_at  = NOW()
      WHERE id = $1 AND tenant_id = $3
      RETURNING *
    `,
    [id, JSON.stringify([newDoc]), user.tenantId],
  );
  return rows[0] ? mapEmployeeRow(rows[0]) : null;
}

async function removeDocument({ user, id, docId }) {
  const pool = getPool();
  const { rows } = await pool.query(
    `
      UPDATE employees
      SET documents  = (
            SELECT COALESCE(jsonb_agg(doc ORDER BY (doc->>'uploadedAt')), '[]'::jsonb)
            FROM   jsonb_array_elements(COALESCE(documents, '[]'::jsonb)) AS doc
            WHERE  doc->>'id' <> $2
          ),
          updated_at = NOW()
      WHERE id = $1 AND tenant_id = $3
      RETURNING *
    `,
    [id, docId, user.tenantId],
  );
  return rows[0] ? mapEmployeeRow(rows[0]) : null;
}

async function getDocumentData({ user, id, docId }) {
  const pool = getPool();
  const { rows } = await pool.query(
    `
      SELECT doc
      FROM   employees,
             jsonb_array_elements(COALESCE(documents, '[]'::jsonb)) AS doc
      WHERE  employees.id          = $1
        AND  employees.tenant_id   = $2
        AND  doc->>'id'            = $3
      LIMIT 1
    `,
    [id, user.tenantId, docId],
  );
  return rows[0] ? rows[0].doc : null;
}

module.exports = {
  getProfile,
  listActive,
  listActiveForPayroll,
  getById,
  findActiveEmployeeById,
  createEmployee,
  updateEmployee,
  enrollFace,
  softDeleteEmployee,
  addDocument,
  removeDocument,
  getDocumentData,
};
