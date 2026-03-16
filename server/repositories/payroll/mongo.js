const PayrollRun = require('../../models/PayrollRun');

function mapRun(doc) {
  if (!doc) return null;
  const row = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    ...row,
    _id: row._id,
    id: row._id,
    payslipItems: row.payslipItems || [],
  };
}

function applyScope(filter, scope) {
  const next = { ...filter, tenantId: scope.tenantId };
  if (scope.branchId) next.branchId = scope.branchId;
  return next;
}

async function listRuns({ scope, includePayslipItems = false }) {
  const query = PayrollRun.find(applyScope({}, scope))
    .populate('branchId', 'name code')
    .sort('-cutoffStart');

  if (!includePayslipItems) query.select('-payslipItems');
  const rows = await query.lean();
  return rows.map(mapRun);
}

async function findRunById({ id, scope, includePayslipItems = true }) {
  const query = PayrollRun.findOne(applyScope({ _id: id }, scope)).populate('branchId', 'name code');
  if (!includePayslipItems) query.select('-payslipItems');
  const row = await query.lean();
  return mapRun(row);
}

async function findRunByIdAndStatuses({ id, scope, statuses }) {
  return PayrollRun.findOne(applyScope({ _id: id, status: { $in: statuses } }, scope));
}

async function findExistingCutoffRun({ tenantId, branchId, cutoffStart, cutoffEnd }) {
  return PayrollRun.findOne({ tenantId, branchId: branchId || null, cutoffStart, cutoffEnd }).select('_id status').lean();
}

async function createRun(payload) {
  const run = await new PayrollRun(payload).save();
  return mapRun(run);
}

async function updateRun({ id, scope, patch }) {
  const row = await PayrollRun.findOneAndUpdate(
    applyScope({ _id: id }, scope),
    { $set: patch },
    { new: true },
  ).populate('branchId', 'name code').lean();
  return mapRun(row);
}

async function deleteRun({ id, scope }) {
  const result = await PayrollRun.deleteOne(applyScope({ _id: id }, scope));
  return result.deletedCount > 0;
}

async function listEmployeePayslipRuns({ tenantId, employeeId }) {
  const rows = await PayrollRun.find({
    tenantId,
    status: { $in: ['approved', 'finalized'] },
    'payslipItems.employeeId': employeeId,
  })
    .populate('branchId', 'name code')
    .sort('-cutoffStart')
    .lean();

  return rows.map(mapRun);
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