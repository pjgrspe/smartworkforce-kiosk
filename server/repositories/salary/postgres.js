const { getPool } = require('../../config/postgres');

function mapSalaryRow(row) {
  if (!row) return null;
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
        branchId: row.employee_branch_id,
        employment: row.employee_employment || {},
      }
      : row.employee_id,
    salaryType: row.salary_type,
    basicRate: row.basic_rate == null ? 0 : Number(row.basic_rate),
    paymentFrequency: row.payment_frequency,
    allowances: row.allowances || [],
    additionalDeductions: row.additional_deductions || [],
    leaveCredits: row.leave_credits || { vacationLeave: 15, sickLeave: 15 },
    overtimeEligible: row.overtime_eligible,
    nightDiffEligible: row.night_diff_eligible,
    effectiveDate: row.effective_date,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function ensureEmployeeBelongsToTenant(employeeId, tenantId) {
  const pool = getPool();
  const { rowCount } = await pool.query(
    'SELECT 1 FROM employees WHERE id = $1 AND tenant_id = $2 AND is_active = TRUE LIMIT 1',
    [employeeId, tenantId],
  );
  if (!rowCount) {
    throw new Error('Employee not found for current tenant');
  }
}

async function listActiveSalaryStructures({ user }) {
  const pool = getPool();
  const { rows } = await pool.query(
    `
      SELECT
        ss.*,
        e.id AS employee_ref_id,
        e.first_name AS employee_first_name,
        e.last_name AS employee_last_name,
        e.employee_code AS employee_code,
        e.branch_id AS employee_branch_id,
        e.employment AS employee_employment
      FROM salary_structures ss
      LEFT JOIN employees e ON e.id = ss.employee_id
      WHERE ss.tenant_id = $1
        AND ss.is_active = TRUE
      ORDER BY ss.updated_at DESC, ss.created_at DESC
    `,
    [user.tenantId],
  );
  return rows.map(mapSalaryRow);
}

async function getSalaryHistory({ user, employeeId }) {
  await ensureEmployeeBelongsToTenant(employeeId, user.tenantId);
  const pool = getPool();
  const { rows } = await pool.query(
    `
      SELECT *
      FROM salary_structures
      WHERE employee_id = $1 AND tenant_id = $2
      ORDER BY effective_date DESC, created_at DESC
    `,
    [employeeId, user.tenantId],
  );
  return rows.map(mapSalaryRow);
}

async function createSalaryStructure({ user, payload }) {
  await ensureEmployeeBelongsToTenant(payload.employeeId, user.tenantId);
  const pool = getPool();
  await pool.query(
    'UPDATE salary_structures SET is_active = FALSE, updated_at = NOW() WHERE employee_id = $1 AND tenant_id = $2 AND is_active = TRUE',
    [payload.employeeId, user.tenantId],
  );
  const { rows } = await pool.query(
    `
      INSERT INTO salary_structures (
        tenant_id, employee_id, salary_type, basic_rate, payment_frequency,
        allowances, additional_deductions, leave_credits, overtime_eligible,
        night_diff_eligible, effective_date, is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, COALESCE($11, NOW()), COALESCE($12, TRUE))
      RETURNING *
    `,
    [
      user.tenantId,
      payload.employeeId,
      payload.salaryType || 'monthly',
      payload.basicRate,
      payload.paymentFrequency || 'semi_monthly',
      payload.allowances || [],
      payload.additionalDeductions || [],
      payload.leaveCredits || { vacationLeave: 15, sickLeave: 15 },
      payload.overtimeEligible == null ? true : Boolean(payload.overtimeEligible),
      payload.nightDiffEligible == null ? true : Boolean(payload.nightDiffEligible),
      payload.effectiveDate || null,
      payload.isActive,
    ],
  );
  return mapSalaryRow(rows[0]);
}

async function updateSalaryStructure({ user, id, patch }) {
  const pool = getPool();
  const { rows: existingRows } = await pool.query('SELECT * FROM salary_structures WHERE id = $1 AND tenant_id = $2 LIMIT 1', [id, user.tenantId]);
  if (!existingRows.length) return null;

  const current = existingRows[0];
  const nextEmployeeId = Object.prototype.hasOwnProperty.call(patch, 'employeeId') ? patch.employeeId : current.employee_id;
  if (nextEmployeeId) {
    await ensureEmployeeBelongsToTenant(nextEmployeeId, user.tenantId);
  }

  const { rows } = await pool.query(
    `
      UPDATE salary_structures
      SET employee_id = $2,
          salary_type = $3,
          basic_rate = $4,
          payment_frequency = $5,
          allowances = $6,
          additional_deductions = $7,
          leave_credits = $8,
          overtime_eligible = $9,
          night_diff_eligible = $10,
          effective_date = $11,
          is_active = $12,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [
      id,
      nextEmployeeId,
      Object.prototype.hasOwnProperty.call(patch, 'salaryType') ? patch.salaryType : current.salary_type,
      Object.prototype.hasOwnProperty.call(patch, 'basicRate') ? patch.basicRate : current.basic_rate,
      Object.prototype.hasOwnProperty.call(patch, 'paymentFrequency') ? patch.paymentFrequency : current.payment_frequency,
      Object.prototype.hasOwnProperty.call(patch, 'allowances') ? patch.allowances : (current.allowances || []),
      Object.prototype.hasOwnProperty.call(patch, 'additionalDeductions') ? patch.additionalDeductions : (current.additional_deductions || []),
      Object.prototype.hasOwnProperty.call(patch, 'leaveCredits') ? patch.leaveCredits : (current.leave_credits || { vacationLeave: 15, sickLeave: 15 }),
      Object.prototype.hasOwnProperty.call(patch, 'overtimeEligible') ? Boolean(patch.overtimeEligible) : current.overtime_eligible,
      Object.prototype.hasOwnProperty.call(patch, 'nightDiffEligible') ? Boolean(patch.nightDiffEligible) : current.night_diff_eligible,
      Object.prototype.hasOwnProperty.call(patch, 'effectiveDate') ? patch.effectiveDate : current.effective_date,
      Object.prototype.hasOwnProperty.call(patch, 'isActive') ? Boolean(patch.isActive) : current.is_active,
    ],
  );
  return mapSalaryRow(rows[0]);
}

async function findActiveByEmployeeId(employeeId) {
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT * FROM salary_structures WHERE employee_id = $1 AND is_active = TRUE ORDER BY effective_date DESC, created_at DESC LIMIT 1',
    [employeeId],
  );
  return mapSalaryRow(rows[0]);
}

module.exports = {
  listActiveSalaryStructures,
  getSalaryHistory,
  createSalaryStructure,
  updateSalaryStructure,
  findActiveByEmployeeId,
};