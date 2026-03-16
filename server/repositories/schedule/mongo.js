const Schedule = require('../../models/Schedule');

async function listSchedules({ user }) {
  return Schedule.find({ tenantId: user.tenantId, isActive: true })
    .sort('name')
    .lean();
}

async function createSchedule({ user, payload }) {
  const schedule = await new Schedule({ ...payload, tenantId: user.tenantId }).save();
  return schedule.toObject();
}

async function updateSchedule({ user, id, patch }) {
  return Schedule.findOneAndUpdate(
    { _id: id, tenantId: user.tenantId },
    { $set: patch },
    { new: true, runValidators: true }
  ).lean();
}

async function softDeleteSchedule({ user, id }) {
  await Schedule.findOneAndUpdate(
    { _id: id, tenantId: user.tenantId },
    { isActive: false }
  );
  return true;
}

module.exports = {
  listSchedules,
  createSchedule,
  updateSchedule,
  softDeleteSchedule,
};
