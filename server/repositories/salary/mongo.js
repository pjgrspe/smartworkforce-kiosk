const SalaryStructure = require('../../models/SalaryStructure');
const Employee = require('../../models/Employee');

function mapSalary(row) {
  if (!row) return null;
  return {
    ...row,
    _id: row._id,
    id: row._id,
  };
}

async function ensureEmployeeBelongsToTenant(employeeId, tenantId) {
  const employee = await Employee.findOne({ _id: employeeId, tenantId, isActive: true }).select('_id').lean();
  if (!employee) {
    throw new Error('Employee not found for current tenant');
  }
}

async function listActiveSalaryStructures({ user }) {
  const rows = await SalaryStructure.find({ tenantId: user.tenantId, isActive: true })
    .populate('employeeId', 'firstName lastName employeeCode branchId employment.position')
    .sort({ updatedAt: -1, createdAt: -1 })
    .lean();
  return rows.map(mapSalary);
}

async function getSalaryHistory({ user, employeeId }) {
  await ensureEmployeeBelongsToTenant(employeeId, user.tenantId);
  const rows = await SalaryStructure.find({ employeeId, tenantId: user.tenantId }).sort('-effectiveDate').lean();
  return rows.map(mapSalary);
}

async function createSalaryStructure({ user, payload }) {
  await ensureEmployeeBelongsToTenant(payload.employeeId, user.tenantId);
  await SalaryStructure.updateMany(
    { employeeId: payload.employeeId, tenantId: user.tenantId, isActive: true },
    { isActive: false },
  );
  const row = await new SalaryStructure({ ...payload, tenantId: user.tenantId }).save();
  return mapSalary(row.toObject());
}

async function updateSalaryStructure({ user, id, patch }) {
  if (patch.employeeId) {
    await ensureEmployeeBelongsToTenant(patch.employeeId, user.tenantId);
  }
  const row = await SalaryStructure.findOneAndUpdate(
    { _id: id, tenantId: user.tenantId },
    { $set: patch },
    { new: true, runValidators: true },
  ).lean();
  return mapSalary(row);
}

async function findActiveByEmployeeId(employeeId) {
  const row = await SalaryStructure.findOne({ employeeId, isActive: true }).lean();
  return mapSalary(row);
}

module.exports = {
  listActiveSalaryStructures,
  getSalaryHistory,
  createSalaryStructure,
  updateSalaryStructure,
  findActiveByEmployeeId,
};