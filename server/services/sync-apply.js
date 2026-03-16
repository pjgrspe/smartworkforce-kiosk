function resolveIncomingUpdatedAt(payload) {
  const raw = payload?.updatedAt || payload?.deactivatedAt;
  if (!raw) return new Date();

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

async function applyEmployeeEvent(client, eventType, payload) {
  if (!payload || !payload.id || !payload.tenantId || !payload.branchId) return;
  const incomingUpdatedAt = resolveIncomingUpdatedAt(payload);

  if (eventType === 'employee.deactivated') {
    await client.query(
      `
        UPDATE employees
        SET is_active = FALSE,
            updated_at = $2
        WHERE id = $1
          AND updated_at <= $2
      `,
      [payload.id, incomingUpdatedAt],
    );
    return;
  }

  await client.query(
    `
      INSERT INTO employees (
        id, tenant_id, branch_id, department_id, employee_code,
        first_name, middle_name, last_name, photo_url,
        date_of_birth, gender, contact_number, email, address,
        employment, gov_ids, bank, tax_status, dependents,
        face_data, schedule_id, is_active, created_by, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        $10, $11, $12, $13, $14,
        $15, $16, $17, $18, $19,
        $20, $21, $22, $23, $24
      )
      ON CONFLICT (id)
      DO UPDATE SET
        tenant_id = EXCLUDED.tenant_id,
        branch_id = EXCLUDED.branch_id,
        department_id = EXCLUDED.department_id,
        employee_code = EXCLUDED.employee_code,
        first_name = EXCLUDED.first_name,
        middle_name = EXCLUDED.middle_name,
        last_name = EXCLUDED.last_name,
        photo_url = EXCLUDED.photo_url,
        date_of_birth = EXCLUDED.date_of_birth,
        gender = EXCLUDED.gender,
        contact_number = EXCLUDED.contact_number,
        email = EXCLUDED.email,
        address = EXCLUDED.address,
        employment = EXCLUDED.employment,
        gov_ids = EXCLUDED.gov_ids,
        bank = EXCLUDED.bank,
        tax_status = EXCLUDED.tax_status,
        dependents = EXCLUDED.dependents,
        face_data = EXCLUDED.face_data,
        schedule_id = EXCLUDED.schedule_id,
        is_active = EXCLUDED.is_active,
        created_by = EXCLUDED.created_by,
        updated_at = EXCLUDED.updated_at
      WHERE employees.updated_at <= EXCLUDED.updated_at
    `,
    [
      payload.id,
      payload.tenantId,
      payload.branchId,
      payload.departmentId || null,
      payload.employeeCode,
      payload.firstName,
      payload.middleName || null,
      payload.lastName,
      payload.photoUrl || null,
      payload.dateOfBirth || null,
      payload.gender || null,
      payload.contactNumber || null,
      payload.email || null,
      payload.address || null,
      payload.employment || {},
      payload.govIds || {},
      payload.bank || {},
      payload.taxStatus || null,
      payload.dependents == null ? 0 : payload.dependents,
      payload.faceData || {},
      payload.scheduleId || null,
      payload.isActive == null ? true : Boolean(payload.isActive),
      payload.createdBy || null,
      incomingUpdatedAt,
    ],
  );
}

async function applyAttendanceEvent(client, eventType, payload) {
  if (eventType !== 'attendance.created' || !payload || !payload.id) return;

  await client.query(
    `
      INSERT INTO attendance_logs (
        id, tenant_id, branch_id, employee_id, timestamp,
        type, source, device_id, confidence_score, exceptions,
        synced, synced_at, local_id, correction_ref, notes
      )
      VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        TRUE, NOW(), NULL, NULL, $11
      )
      ON CONFLICT (id)
      DO NOTHING
    `,
    [
      payload.id,
      payload.tenantId,
      payload.branchId || null,
      payload.employeeId,
      payload.timestamp,
      payload.type || 'IN',
      payload.source || 'face_kiosk',
      payload.deviceId || null,
      payload.confidenceScore == null ? null : Number(payload.confidenceScore),
      payload.exceptions || {},
      payload.notes || null,
    ],
  );
}

async function applyDepartmentEvent(client, eventType, payload) {
  if (!payload || !payload.id || !payload.tenantId) return;
  const incomingUpdatedAt = resolveIncomingUpdatedAt(payload);

  if (eventType === 'department.deactivated') {
    await client.query(
      'UPDATE departments SET is_active = FALSE, updated_at = $2 WHERE id = $1 AND updated_at <= $2',
      [payload.id, incomingUpdatedAt],
    );
    return;
  }

  await client.query(
    `
      INSERT INTO departments (id, tenant_id, branch_id, name, code, description, is_active, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (id)
      DO UPDATE SET
        tenant_id = EXCLUDED.tenant_id,
        branch_id = EXCLUDED.branch_id,
        name = EXCLUDED.name,
        code = EXCLUDED.code,
        description = EXCLUDED.description,
        is_active = EXCLUDED.is_active,
        updated_at = EXCLUDED.updated_at
      WHERE departments.updated_at <= EXCLUDED.updated_at
    `,
    [
      payload.id,
      payload.tenantId,
      payload.branchId || null,
      payload.name,
      payload.code || null,
      payload.description || null,
      payload.isActive == null ? true : Boolean(payload.isActive),
      incomingUpdatedAt,
    ],
  );
}

async function applyScheduleEvent(client, eventType, payload) {
  if (!payload || !payload.id || !payload.tenantId) return;
  const incomingUpdatedAt = resolveIncomingUpdatedAt(payload);

  if (eventType === 'schedule.deactivated') {
    await client.query(
      'UPDATE schedules SET is_active = FALSE, updated_at = $2 WHERE id = $1 AND updated_at <= $2',
      [payload.id, incomingUpdatedAt],
    );
    return;
  }

  await client.query(
    `
      INSERT INTO schedules (
        id, tenant_id, name, code, type,
        shift_start, shift_end, break_start, break_end,
        break_duration_minutes, is_paid_break, grace_period_minutes,
        undertime_policy_minutes, rounding_rule_minutes, allow_multiple_punches,
        rest_days, is_active, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        $10, $11, $12,
        $13, $14, $15,
        $16, $17, $18
      )
      ON CONFLICT (id)
      DO UPDATE SET
        tenant_id = EXCLUDED.tenant_id,
        name = EXCLUDED.name,
        code = EXCLUDED.code,
        type = EXCLUDED.type,
        shift_start = EXCLUDED.shift_start,
        shift_end = EXCLUDED.shift_end,
        break_start = EXCLUDED.break_start,
        break_end = EXCLUDED.break_end,
        break_duration_minutes = EXCLUDED.break_duration_minutes,
        is_paid_break = EXCLUDED.is_paid_break,
        grace_period_minutes = EXCLUDED.grace_period_minutes,
        undertime_policy_minutes = EXCLUDED.undertime_policy_minutes,
        rounding_rule_minutes = EXCLUDED.rounding_rule_minutes,
        allow_multiple_punches = EXCLUDED.allow_multiple_punches,
        rest_days = EXCLUDED.rest_days,
        is_active = EXCLUDED.is_active,
        updated_at = EXCLUDED.updated_at
      WHERE schedules.updated_at <= EXCLUDED.updated_at
    `,
    [
      payload.id,
      payload.tenantId,
      payload.name,
      payload.code,
      payload.type || 'fixed',
      payload.shiftStart || null,
      payload.shiftEnd || null,
      payload.breakStart || null,
      payload.breakEnd || null,
      payload.breakDurationMinutes == null ? 60 : payload.breakDurationMinutes,
      payload.isPaidBreak == null ? false : Boolean(payload.isPaidBreak),
      payload.gracePeriodMinutes == null ? 5 : payload.gracePeriodMinutes,
      payload.undertimePolicyMinutes == null ? 0 : payload.undertimePolicyMinutes,
      payload.roundingRuleMinutes == null ? 0 : payload.roundingRuleMinutes,
      payload.allowMultiplePunches == null ? false : Boolean(payload.allowMultiplePunches),
      payload.restDays || [],
      payload.isActive == null ? true : Boolean(payload.isActive),
      incomingUpdatedAt,
    ],
  );
}

async function applyBranchEvent(client, eventType, payload) {
  if (!payload || !payload.id || !payload.tenantId) return;
  const incomingUpdatedAt = resolveIncomingUpdatedAt(payload);

  if (eventType === 'branch.deactivated') {
    await client.query(
      'UPDATE branches SET is_active = FALSE, updated_at = $2 WHERE id = $1 AND updated_at <= $2',
      [payload.id, incomingUpdatedAt],
    );
    return;
  }

  await client.query(
    `
      INSERT INTO branches (id, tenant_id, name, code, address, phone, timezone, is_active, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (id)
      DO UPDATE SET
        tenant_id = EXCLUDED.tenant_id,
        name = EXCLUDED.name,
        code = EXCLUDED.code,
        address = EXCLUDED.address,
        phone = EXCLUDED.phone,
        timezone = EXCLUDED.timezone,
        is_active = EXCLUDED.is_active,
        updated_at = EXCLUDED.updated_at
      WHERE branches.updated_at <= EXCLUDED.updated_at
    `,
    [
      payload.id,
      payload.tenantId,
      payload.name,
      payload.code,
      payload.address || null,
      payload.phone || null,
      payload.timezone || 'Asia/Manila',
      payload.isActive == null ? true : Boolean(payload.isActive),
      incomingUpdatedAt,
    ],
  );
}

async function applyUserEvent(client, eventType, payload) {
  if (!payload || !payload.id) return;
  const incomingUpdatedAt = resolveIncomingUpdatedAt(payload);

  if (eventType === 'user.deleted') {
    await client.query('DELETE FROM users WHERE id = $1', [payload.id]);
    return;
  }

  await client.query(
    `
      INSERT INTO users (
        id, tenant_id, branch_id, email, password_hash,
        first_name, last_name, profile_picture_url, role,
        employee_id, is_active, last_login_at, password_changed_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        $10, $11, $12, $13, $14
      )
      ON CONFLICT (id)
      DO UPDATE SET
        tenant_id = EXCLUDED.tenant_id,
        branch_id = EXCLUDED.branch_id,
        email = EXCLUDED.email,
        password_hash = EXCLUDED.password_hash,
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        profile_picture_url = EXCLUDED.profile_picture_url,
        role = EXCLUDED.role,
        employee_id = EXCLUDED.employee_id,
        is_active = EXCLUDED.is_active,
        last_login_at = EXCLUDED.last_login_at,
        password_changed_at = EXCLUDED.password_changed_at,
        updated_at = EXCLUDED.updated_at
      WHERE users.updated_at <= EXCLUDED.updated_at
    `,
    [
      payload.id,
      payload.tenantId || null,
      payload.branchId || null,
      payload.email,
      payload.passwordHash,
      payload.firstName,
      payload.lastName,
      payload.profilePictureUrl || null,
      payload.role,
      payload.employeeId || null,
      payload.isActive == null ? true : Boolean(payload.isActive),
      payload.lastLoginAt || null,
      payload.passwordChangedAt || null,
      incomingUpdatedAt,
    ],
  );
}

async function applySyncEvent(client, event) {
  const { eventType, entityType, payload } = event;

  if (entityType === 'employee') return applyEmployeeEvent(client, eventType, payload);
  if (entityType === 'attendance_log') return applyAttendanceEvent(client, eventType, payload);
  if (entityType === 'department') return applyDepartmentEvent(client, eventType, payload);
  if (entityType === 'schedule') return applyScheduleEvent(client, eventType, payload);
  if (entityType === 'branch') return applyBranchEvent(client, eventType, payload);
  if (entityType === 'user') return applyUserEvent(client, eventType, payload);
}

module.exports = {
  applySyncEvent,
};
