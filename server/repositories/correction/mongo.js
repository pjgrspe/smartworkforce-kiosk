const AttendanceCorrectionRequest = require('../../models/AttendanceCorrectionRequest');

async function listMyCorrections({ tenantId, employeeId, status }) {
  const filter = { tenantId, employeeId };
  if (status) filter.status = status;

  return AttendanceCorrectionRequest.find(filter)
    .populate('reviewedBy', 'firstName lastName email')
    .sort('-createdAt')
    .lean();
}

async function listCorrections({ tenantId, status, employeeId, scopedEmployeeIds }) {
  const filter = { tenantId };
  if (status) filter.status = status;
  if (employeeId) filter.employeeId = employeeId;

  if (scopedEmployeeIds) {
    filter.employeeId = filter.employeeId
      ? { $in: scopedEmployeeIds.filter((id) => String(id) === String(employeeId)) }
      : { $in: scopedEmployeeIds };
  }

  return AttendanceCorrectionRequest.find(filter)
    .populate('employeeId', 'firstName lastName employeeCode')
    .populate('requestedBy', 'firstName lastName email')
    .populate('reviewedBy', 'firstName lastName email')
    .sort('-createdAt')
    .lean();
}

async function createCorrection(payload) {
  const correction = await new AttendanceCorrectionRequest(payload).save();
  return correction.toObject();
}

async function findPendingCorrection({ id, tenantId, scopedEmployeeIds }) {
  return AttendanceCorrectionRequest.findOne({
    _id: id,
    tenantId,
    status: 'pending',
    ...(scopedEmployeeIds ? { employeeId: { $in: scopedEmployeeIds } } : {}),
  });
}

async function saveCorrection(doc) {
  await doc.save();
  return AttendanceCorrectionRequest.findById(doc._id)
    .populate('employeeId', 'firstName lastName employeeCode')
    .populate('requestedBy', 'firstName lastName email')
    .populate('reviewedBy', 'firstName lastName email')
    .lean();
}

async function rejectCorrection({ id, tenantId, scopedEmployeeIds, reviewerId, notes }) {
  const correction = await AttendanceCorrectionRequest.findOneAndUpdate(
    {
      _id: id,
      tenantId,
      status: 'pending',
      ...(scopedEmployeeIds ? { employeeId: { $in: scopedEmployeeIds } } : {}),
    },
    {
      status: 'rejected',
      reviewedBy: reviewerId,
      reviewedAt: new Date(),
      reviewNotes: notes,
    },
    { new: true },
  );

  if (!correction) return null;

  return AttendanceCorrectionRequest.findById(correction._id)
    .populate('employeeId', 'firstName lastName employeeCode')
    .populate('requestedBy', 'firstName lastName email')
    .populate('reviewedBy', 'firstName lastName email')
    .lean();
}

module.exports = {
  listMyCorrections,
  listCorrections,
  createCorrection,
  findPendingCorrection,
  saveCorrection,
  rejectCorrection,
};