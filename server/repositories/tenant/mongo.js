const Tenant = require('../../models/Tenant');

function mapTenant(doc) {
  if (!doc) return null;
  return {
    ...doc,
    _id: doc._id,
    id: doc._id,
  };
}

async function findActiveByCode(code) {
  const tenant = await Tenant.findOne({ code, isActive: true }).lean();
  return mapTenant(tenant);
}

async function listTenants({ user }) {
  const filter = user.role === 'super_admin' ? {} : { _id: user.tenantId };
  const rows = await Tenant.find(filter).sort('name').lean();
  return rows.map(mapTenant);
}

async function findById(id) {
  const tenant = await Tenant.findById(id).lean();
  return mapTenant(tenant);
}

async function createTenant(payload) {
  const tenant = await new Tenant(payload).save();
  return mapTenant(tenant.toObject());
}

async function updateTenant(id, patch) {
  const tenant = await Tenant.findByIdAndUpdate(id, { $set: patch }, { new: true, runValidators: true }).lean();
  return mapTenant(tenant);
}

module.exports = {
  findActiveByCode,
  listTenants,
  findById,
  createTenant,
  updateTenant,
};