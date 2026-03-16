const User = require('../../models/User');

function mapUserDoc(user) {
  if (!user) return null;
  return {
    ...user,
    _id: user._id,
    id: user._id,
  };
}

async function findByEmail(email) {
  const user = await User.findOne({ email }).lean();
  return mapUserDoc(user);
}

async function findByEmailExcludingId(email, excludedId) {
  const user = await User.findOne({ email, _id: { $ne: excludedId } }).lean();
  return mapUserDoc(user);
}

async function findById(id) {
  const user = await User.findById(id).lean();
  return mapUserDoc(user);
}

async function findPasswordById(id) {
  const user = await User.findById(id).select('passwordHash').lean();
  return user ? user.passwordHash : null;
}

async function touchLastLogin(id) {
  await User.findByIdAndUpdate(id, { lastLoginAt: new Date() });
}

async function findMeById(id) {
  const user = await User.findById(id)
    .select('-passwordHash')
    .populate('branchId', 'name')
    .populate('employeeId', 'firstName lastName employeeCode')
    .lean();
  return mapUserDoc(user);
}

async function updateSelf(id, updates) {
  const user = await User.findByIdAndUpdate(
    id,
    { $set: updates },
    { new: true }
  ).select('-passwordHash').lean();
  return mapUserDoc(user);
}

async function listUsers({ requestUser }) {
  const filter = requestUser.role === 'super_admin'
    ? {}
    : { tenantId: requestUser.tenantId };
  if (requestUser.role !== 'super_admin' && requestUser.branchId) {
    filter.branchId = requestUser.branchId;
  }

  return User.find(filter)
    .select('-passwordHash')
    .sort('lastName')
    .populate('branchId', 'name')
    .populate('employeeId', 'firstName lastName employeeCode')
    .lean();
}

async function findScopedUser({ requestUser, userId }) {
  const filter = requestUser.role === 'super_admin'
    ? { _id: userId }
    : { _id: userId, tenantId: requestUser.tenantId, ...(requestUser.branchId ? { branchId: requestUser.branchId } : {}) };
  const user = await User.findOne(filter).select('role branchId employeeId').lean();
  return mapUserDoc(user);
}

async function createUser(payload) {
  const user = await new User(payload).save();
  const obj = user.toObject();
  delete obj.passwordHash;
  return mapUserDoc(obj);
}

async function updateUserById(id, updates) {
  const user = await User.findByIdAndUpdate(
    id,
    { $set: updates },
    { new: true }
  ).select('-passwordHash').lean();
  return mapUserDoc(user);
}

async function deleteScopedUser({ requestUser, userId }) {
  const filter = requestUser.role === 'super_admin'
    ? { _id: userId }
    : { _id: userId, tenantId: requestUser.tenantId, ...(requestUser.branchId ? { branchId: requestUser.branchId } : {}) };
  const result = await User.deleteOne(filter);
  return result.deletedCount > 0;
}

module.exports = {
  findByEmail,
  findByEmailExcludingId,
  findById,
  findPasswordById,
  touchLastLogin,
  findMeById,
  updateSelf,
  listUsers,
  findScopedUser,
  createUser,
  updateUserById,
  deleteScopedUser,
};
