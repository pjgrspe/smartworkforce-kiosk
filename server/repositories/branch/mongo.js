const Branch = require('../../models/Branch');

async function listBranches({ user }) {
  const filter = { tenantId: user.tenantId, isActive: true };
  if (user.role !== 'super_admin' && user.branchId) {
    filter._id = user.branchId;
  }
  return Branch.find(filter).sort('name').lean();
}

async function createBranch({ user, payload }) {
  const branch = await new Branch({ ...payload, tenantId: user.tenantId }).save();
  return branch.toObject();
}

async function findActiveBranchById({ id, tenantId }) {
  const filter = { _id: id, isActive: true };
  if (tenantId) filter.tenantId = tenantId;
  return Branch.findOne(filter).lean();
}

async function updateBranch({ user, id, patch }) {
  return Branch.findOneAndUpdate(
    { _id: id, tenantId: user.tenantId },
    { $set: patch },
    { new: true, runValidators: true }
  ).lean();
}

async function softDeleteBranch({ user, id }) {
  await Branch.findOneAndUpdate(
    { _id: id, tenantId: user.tenantId },
    { isActive: false }
  );
  return true;
}

module.exports = {
  listBranches,
  createBranch,
  findActiveBranchById,
  updateBranch,
  softDeleteBranch,
};
