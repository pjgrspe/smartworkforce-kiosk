const AttendanceLog = require('../../models/AttendanceLog');

function buildDateRangeFilter(startDate, endDate) {
  if (!startDate && !endDate) return undefined;

  const range = {};
  if (startDate) range.$gte = new Date(startDate);

  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    range.$lte = end;
  }

  return range;
}

async function getMyAttendance({ user, startDate, endDate, limit }) {
  const filter = {
    tenantId: user.tenantId,
    employeeId: user.employeeId,
  };

  const range = buildDateRangeFilter(startDate, endDate);
  if (range) filter.timestamp = range;

  return AttendanceLog.find(filter)
    .sort({ timestamp: -1 })
    .limit(limit || 100)
    .lean();
}

async function listAttendance({ user, employeeId, branchId, startDate, endDate, limit }) {
  const filter = { tenantId: user.tenantId };

  if (employeeId) filter.employeeId = employeeId;
  if (branchId) filter.branchId = branchId;

  const range = buildDateRangeFilter(startDate, endDate);
  if (range) filter.timestamp = range;

  if (user.role !== 'super_admin' && user.branchId) {
    filter.branchId = user.branchId;
  }

  return AttendanceLog.find(filter)
    .populate('employeeId', 'firstName lastName employeeCode')
    .sort({ timestamp: -1 })
    .limit(limit || 200)
    .lean();
}

async function listToday({ user }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const filter = {
    tenantId: user.tenantId,
    timestamp: { $gte: today },
  };

  if (user.role !== 'super_admin' && user.branchId) {
    filter.branchId = user.branchId;
  }

  return AttendanceLog.find(filter)
    .populate('employeeId', 'firstName lastName employeeCode')
    .sort({ timestamp: -1 })
    .lean();
}

async function createManualAttendance({ user, payload }) {
  const body = { ...payload };
  if (user.role !== 'super_admin' && user.branchId) {
    body.branchId = user.branchId;
  }

  const log = await new AttendanceLog({
    ...body,
    tenantId: user.tenantId,
    source: 'admin_correction',
    synced: true,
    syncedAt: new Date(),
  }).save();

  return log.toObject();
}

async function createCorrectionAttendance({ tenantId, branchId, employeeId, timestamp, type, correctionRef, notes }) {
  const log = await new AttendanceLog({
    tenantId,
    branchId,
    employeeId,
    timestamp,
    type,
    source: 'admin_correction',
    synced: true,
    syncedAt: new Date(),
    correctionRef,
    notes,
  }).save();

  return log.toObject();
}

async function getCorrectionAttendanceLog({ id, tenantId, employeeId }) {
  const row = await AttendanceLog.findOne({
    _id: id,
    tenantId,
    employeeId,
  });
  return row || null;
}

async function updateCorrectionAttendanceLog({ id, tenantId, employeeId, patch }) {
  return AttendanceLog.findOneAndUpdate(
    { _id: id, tenantId, employeeId },
    { $set: patch },
    { new: true }
  ).lean();
}

async function deleteCorrectionAttendanceLog({ id, tenantId, employeeId }) {
  return AttendanceLog.findOneAndDelete({ _id: id, tenantId, employeeId }).lean();
}

module.exports = {
  getMyAttendance,
  listAttendance,
  listToday,
  createManualAttendance,
  createCorrectionAttendance,
  getCorrectionAttendanceLog,
  updateCorrectionAttendanceLog,
  deleteCorrectionAttendanceLog,
};
