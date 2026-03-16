const Employee = require('../../models/Employee');
const AttendanceLog = require('../../models/AttendanceLog');

async function getEmployeesForKiosk(tenantId) {
  return Employee.find(
    { tenantId, isActive: true, 'employment.status': 'active' },
    'firstName lastName employeeCode branchId faceData.faceApiDescriptors faceData.enrollmentDate'
  ).lean();
}

async function getRecentAttendance(tenantId, limit = 15) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return AttendanceLog.find({ tenantId, timestamp: { $gte: today } })
    .populate('employeeId', 'firstName lastName employeeCode')
    .sort({ timestamp: -1 })
    .limit(limit)
    .lean();
}

async function createPunch({ tenantId, employeeId, type, confidenceScore, timestamp }) {
  const employee = await Employee.findOne(
    { _id: employeeId, tenantId, isActive: true },
    'firstName lastName employeeCode branchId'
  ).lean();
  if (!employee) return null;

  const log = await new AttendanceLog({
    tenantId,
    branchId: employee.branchId,
    employeeId,
    type,
    timestamp,
    source: 'face_kiosk',
    confidenceScore: confidenceScore != null ? Number(confidenceScore) : undefined,
    synced: true,
    syncedAt: new Date(),
  }).save();

  return AttendanceLog.findById(log._id)
    .populate('employeeId', 'firstName lastName employeeCode')
    .lean();
}

async function flushQueuedPunch(punch) {
  await new AttendanceLog({
    tenantId: punch.tenantId,
    branchId: punch.branchId || undefined,
    employeeId: punch.employeeId,
    type: punch.type,
    timestamp: new Date(punch.timestamp),
    source: 'face_kiosk',
    confidenceScore: punch.confidenceScore != null ? punch.confidenceScore : undefined,
    synced: true,
    syncedAt: new Date(),
  }).save();
}

module.exports = {
  getEmployeesForKiosk,
  getRecentAttendance,
  createPunch,
  flushQueuedPunch,
};