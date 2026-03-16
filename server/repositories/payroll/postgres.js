const { getPool } = require('../../config/postgres');

function mapRunRow(row) {
  if (!row) return null;
  return {
    _id: row.id,
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_ref_id
      ? { _id: row.branch_ref_id, name: row.branch_name, code: row.branch_code }
      : row.branch_id,
    cutoffStart: row.cutoff_start,
    cutoffEnd: row.cutoff_end,
    status: row.status,
    payslipItems: row.payslip_items || [],
    totalGross: row.total_gross == null ? 0 : Number(row.total_gross),
    totalDeductions: row.total_deductions == null ? 0 : Number(row.total_deductions),
    totalNet: row.total_net == null ? 0 : Number(row.total_net),
    createdBy: row.created_by,
    approvedBy: row.approved_by,
    finalizedAt: row.finalized_at,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function scopeWhere(scope, params, alias = 'pr') {
  params.push(scope.tenantId);
  const where = [`${alias}.tenant_id = $${params.length}`];
  if (scope.branchId) {
    params.push(scope.branchId);
    where.push(`${alias}.branch_id = $${params.length}`);
  }
  return where;
}

function buildSelect(includePayslipItems = true) {
  const payslipColumn = includePayslipItems ? 'pr.payslip_items,' : '';
  return `
    SELECT
      pr.id,
      pr.tenant_id,
      pr.branch_id,
      ${payslipColumn}
      pr.cutoff_start,
      pr.cutoff_end,
      pr.status,
      pr.total_gross,
      pr.total_deductions,
      pr.total_net,
      pr.created_by,
      pr.approved_by,
      pr.finalized_at,
      pr.notes,
      pr.created_at,
      pr.updated_at,
      b.id AS branch_ref_id,
      b.name AS branch_name,
      b.code AS branch_code
    FROM payroll_runs pr
    LEFT JOIN branches b ON b.id = pr.branch_id
  `;
}

async function listRuns({ scope, includePayslipItems = false }) {
  const pool = getPool();
  const params = [];
  const where = scopeWhere(scope, params);
  const { rows } = await pool.query(
    `${buildSelect(includePayslipItems)} WHERE ${where.join(' AND ')} ORDER BY pr.cutoff_start DESC`,
    params,
  );
  return rows.map(mapRunRow);
}

async function findRunById({ id, scope, includePayslipItems = true }) {
  const pool = getPool();
  const params = [];
  const where = scopeWhere(scope, params);
  params.push(id);
  where.push(`pr.id = $${params.length}`);

  const { rows } = await pool.query(
    `${buildSelect(includePayslipItems)} WHERE ${where.join(' AND ')} LIMIT 1`,
    params,
  );
  return rows[0] ? mapRunRow(rows[0]) : null;
}

async function findRunByIdAndStatuses({ id, scope, statuses }) {
  const pool = getPool();
  const params = [];
  const where = scopeWhere(scope, params);
  params.push(id);
  where.push(`pr.id = $${params.length}`);
  params.push(statuses);
  where.push(`pr.status = ANY($${params.length}::text[])`);

  const { rows } = await pool.query(
    `${buildSelect(true)} WHERE ${where.join(' AND ')} LIMIT 1`,
    params,
  );
  return rows[0] ? mapRunRow(rows[0]) : null;
}

async function findExistingCutoffRun({ tenantId, branchId, cutoffStart, cutoffEnd }) {
  const pool = getPool();
  const params = [tenantId, cutoffStart, cutoffEnd];
  let query = `
    SELECT id, status
    FROM payroll_runs
    WHERE tenant_id = $1
      AND cutoff_start = $2
      AND cutoff_end = $3
  `;

  if (branchId) {
    params.push(branchId);
    query += ` AND branch_id = $${params.length}`;
  } else {
    query += ' AND branch_id IS NULL';
  }

  query += ' LIMIT 1';
  const { rows } = await pool.query(query, params);
  return rows[0] || null;
}

async function createRun(payload) {
  const pool = getPool();
  const { rows } = await pool.query(
    `
      INSERT INTO payroll_runs (
        tenant_id,
        branch_id,
        cutoff_start,
        cutoff_end,
        status,
        payslip_items,
        total_gross,
        total_deductions,
        total_net,
        created_by,
        notes
      )
      VALUES ($1, $2, $3, $4, COALESCE($5, 'draft'), COALESCE($6, '[]'::jsonb), COALESCE($7, 0), COALESCE($8, 0), COALESCE($9, 0), $10, $11)
      RETURNING id
    `,
    [
      payload.tenantId,
      payload.branchId || null,
      payload.cutoffStart,
      payload.cutoffEnd,
      payload.status || 'draft',
      payload.payslipItems || [],
      payload.totalGross || 0,
      payload.totalDeductions || 0,
      payload.totalNet || 0,
      payload.createdBy,
      payload.notes || null,
    ],
  );

  return findRunById({
    id: rows[0].id,
    scope: { tenantId: payload.tenantId, branchId: payload.branchId || null },
    includePayslipItems: true,
  });
}

async function updateRun({ id, scope, patch }) {
  const current = await findRunById({ id, scope, includePayslipItems: true });
  if (!current) return null;

  const next = {
    status: Object.prototype.hasOwnProperty.call(patch, 'status') ? patch.status : current.status,
    payslipItems: Object.prototype.hasOwnProperty.call(patch, 'payslipItems') ? patch.payslipItems : current.payslipItems,
    totalGross: Object.prototype.hasOwnProperty.call(patch, 'totalGross') ? patch.totalGross : current.totalGross,
    totalDeductions: Object.prototype.hasOwnProperty.call(patch, 'totalDeductions') ? patch.totalDeductions : current.totalDeductions,
    totalNet: Object.prototype.hasOwnProperty.call(patch, 'totalNet') ? patch.totalNet : current.totalNet,
    approvedBy: Object.prototype.hasOwnProperty.call(patch, 'approvedBy') ? patch.approvedBy : current.approvedBy,
    finalizedAt: Object.prototype.hasOwnProperty.call(patch, 'finalizedAt') ? patch.finalizedAt : current.finalizedAt,
    notes: Object.prototype.hasOwnProperty.call(patch, 'notes') ? patch.notes : current.notes,
  };

  const pool = getPool();
  await pool.query(
    `
      UPDATE payroll_runs
      SET status = $3,
          payslip_items = $4,
          total_gross = $5,
          total_deductions = $6,
          total_net = $7,
          approved_by = $8,
          finalized_at = $9,
          notes = $10,
          updated_at = NOW()
      WHERE id = $1
        AND tenant_id = $2
    `,
    [
      id,
      scope.tenantId,
      next.status,
      next.payslipItems || [],
      next.totalGross,
      next.totalDeductions,
      next.totalNet,
      next.approvedBy || null,
      next.finalizedAt || null,
      next.notes || null,
    ],
  );

  return findRunById({ id, scope, includePayslipItems: true });
}

async function deleteRun({ id, scope }) {
  const pool = getPool();
  const params = [id, scope.tenantId];
  let query = 'DELETE FROM payroll_runs WHERE id = $1 AND tenant_id = $2';
  if (scope.branchId) {
    params.push(scope.branchId);
    query += ` AND branch_id = $${params.length}`;
  }
  const result = await pool.query(query, params);
  return result.rowCount > 0;
}

async function listEmployeePayslipRuns({ tenantId, employeeId }) {
  const pool = getPool();
  const { rows } = await pool.query(
    `
      SELECT
        pr.id,
        pr.tenant_id,
        pr.branch_id,
        pr.payslip_items,
        pr.cutoff_start,
        pr.cutoff_end,
        pr.status,
        pr.total_gross,
        pr.total_deductions,
        pr.total_net,
        pr.created_by,
        pr.approved_by,
        pr.finalized_at,
        pr.notes,
        pr.created_at,
        pr.updated_at,
        b.id AS branch_ref_id,
        b.name AS branch_name,
        b.code AS branch_code
      FROM payroll_runs pr
      LEFT JOIN branches b ON b.id = pr.branch_id
      WHERE pr.tenant_id = $1
        AND pr.status = ANY($2::text[])
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements(pr.payslip_items) AS item
          WHERE item->>'employeeId' = $3
        )
      ORDER BY pr.cutoff_start DESC
    `,
    [tenantId, ['approved', 'finalized'], String(employeeId)],
  );

  return rows.map(mapRunRow);
}

module.exports = {
  listRuns,
  findRunById,
  findRunByIdAndStatuses,
  findExistingCutoffRun,
  createRun,
  updateRun,
  deleteRun,
  listEmployeePayslipRuns,
};