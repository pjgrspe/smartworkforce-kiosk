const Department = require('../../models/Department');

async function listDepartments({ user, branchId }) {
  const filter = { tenantId: user.tenantId, isActive: true };
  if (user.role !== 'super_admin' && user.branchId) {
    filter.branchId = user.branchId;
  } else if (branchId) {
    filter.branchId = branchId;
  }

  return Department.find(filter).sort('name').lean();
}

async function createDepartment({ user, payload }) {
  const dept = await new Department({ ...payload, tenantId: user.tenantId }).save();
  return dept.toObject();
}

async function updateDepartment({ user, id, patch }) {
  return Department.findOneAndUpdate(
    { _id: id, tenantId: user.tenantId },
    { $set: patch },
    { new: true, runValidators: true }
  ).lean();
}

async function softDeleteDepartment({ user, id }) {
  await Department.findOneAndUpdate(
    { _id: id, tenantId: user.tenantId },
    { isActive: false }
  );
  return true;
}

module.exports = {
  listDepartments,
  createDepartment,
  updateDepartment,
  softDeleteDepartment,
};
