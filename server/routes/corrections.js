const express = require('express');
const router  = express.Router();
const AttendanceCorrectionRequest = require('../models/AttendanceCorrectionRequest');
const AttendanceLog = require('../models/AttendanceLog');
const Employee = require('../models/Employee');
const { authenticate, authorize } = require('../middleware/auth');
const logger  = require('../utils/logger');

const REVIEWER_ROLES = ['super_admin', 'client_admin', 'hr_payroll', 'branch_manager'];
const ATTENDANCE_TYPES = ['IN', 'OUT', 'BREAK_IN', 'BREAK_OUT'];

function canReviewRole(role) {
  return REVIEWER_ROLES.includes(role);
}

function normalizeAdjustment(body = {}) {
  const source = body.after || body.adjustment || {};
  const operationRaw = source.operation || source.action || body.adjustmentOperation || body.action;
  const operation = String(operationRaw || '').toLowerCase();
  if (!operation || operation === 'none') return null;

  const type = String(source.type || body.adjustmentType || '').toUpperCase();
  const normalizedType = ATTENDANCE_TYPES.includes(type) ? type : undefined;

  const time = String(source.time || body.adjustmentTime || '').trim();
  const timestamp = source.timestamp || body.adjustmentTimestamp;
  const logId = source.logId || body.adjustmentLogId;

  return {
    operation,
    type: normalizedType,
    time: time || undefined,
    timestamp: timestamp || undefined,
    logId: logId || undefined,
    notes: source.notes || body.adjustmentNotes || undefined,
  };
}

function buildTimestampFromAdjustment(targetDate, adjustment) {
  if (adjustment.timestamp) {
    const ts = new Date(adjustment.timestamp);
    if (Number.isNaN(ts.getTime())) throw new Error('Invalid adjustment timestamp');
    return ts;
  }

  if (!adjustment.time) throw new Error('Adjustment time is required');
  const match = /^(\d{2}):(\d{2})$/.exec(adjustment.time);
  if (!match) throw new Error('Adjustment time must be HH:mm');

  const [, hh, mm] = match;
  const ts = new Date(targetDate);
  ts.setHours(Number(hh), Number(mm), 0, 0);
  return ts;
}

async function applyAttendanceAdjustment(correction, reviewerId) {
  const adjustment = correction.after;
  if (!adjustment || !adjustment.operation) return null;

  const employee = await Employee.findOne({
    _id: correction.employeeId,
    tenantId: correction.tenantId,
    isActive: true,
  }).select('_id branchId').lean();

  if (!employee) throw new Error('Employee not found while applying correction');

  if (adjustment.operation === 'create') {
    if (!adjustment.type || !ATTENDANCE_TYPES.includes(adjustment.type)) {
      throw new Error('Adjustment type must be IN, OUT, BREAK_IN, or BREAK_OUT');
    }

    const timestamp = buildTimestampFromAdjustment(correction.targetDate, adjustment);
    const created = await new AttendanceLog({
      tenantId: correction.tenantId,
      branchId: employee.branchId,
      employeeId: correction.employeeId,
      timestamp,
      type: adjustment.type,
      source: 'admin_correction',
      synced: true,
      syncedAt: new Date(),
      correctionRef: correction._id,
      notes: adjustment.notes || correction.notes || `Approved correction by ${reviewerId}`,
    }).save();

    return { action: 'created', logId: created._id.toString() };
  }

  if (adjustment.operation === 'update') {
    if (!adjustment.logId) throw new Error('Adjustment logId is required for update');

    const log = await AttendanceLog.findOne({
      _id: adjustment.logId,
      tenantId: correction.tenantId,
      employeeId: correction.employeeId,
    });
    if (!log) throw new Error('Attendance log for update was not found');

    if (adjustment.type && ATTENDANCE_TYPES.includes(adjustment.type)) {
      log.type = adjustment.type;
    }
    if (adjustment.time || adjustment.timestamp) {
      log.timestamp = buildTimestampFromAdjustment(correction.targetDate, adjustment);
    }
    log.source = 'admin_correction';
    log.synced = true;
    log.syncedAt = new Date();
    log.correctionRef = correction._id;
    log.notes = adjustment.notes || correction.notes || log.notes;
    await log.save();

    return { action: 'updated', logId: log._id.toString() };
  }

  if (adjustment.operation === 'delete') {
    if (!adjustment.logId) throw new Error('Adjustment logId is required for delete');

    const deleted = await AttendanceLog.findOneAndDelete({
      _id: adjustment.logId,
      tenantId: correction.tenantId,
      employeeId: correction.employeeId,
    }).lean();

    if (!deleted) throw new Error('Attendance log for delete was not found');
    return { action: 'deleted', logId: adjustment.logId };
  }

  throw new Error(`Unsupported adjustment operation: ${adjustment.operation}`);
}

function inferReasonCode(reasonCode, reasonText) {
  if (reasonCode) return reasonCode;

  const text = String(reasonText || '').toLowerCase();
  if (text.includes('forgot')) return 'forgot_to_log';
  if (text.includes('device')) return 'device_down';
  if (text.includes('field')) return 'field_work';
  if (text.includes('system')) return 'system_error';
  return 'other';
}

async function getScopedEmployeeIds(req) {
  if (req.user.role === 'super_admin' || !req.user.branchId) return null;

  const employees = await Employee.find({
    tenantId: req.user.tenantId,
    branchId: req.user.branchId,
    isActive: true,
  }).select('_id').lean();

  return employees.map((employee) => employee._id);
}

router.use(authenticate);

// GET /api/corrections/me — current authenticated employee requests
router.get('/me', async (req, res) => {
  try {
    if (!req.user.employeeId) {
      return res.status(404).json({ error: 'No employee profile is linked to this account' });
    }

    const filter = { tenantId: req.user.tenantId, employeeId: req.user.employeeId };
    if (req.query.status) filter.status = req.query.status;

    const corrections = await AttendanceCorrectionRequest.find(filter)
      .populate('reviewedBy', 'firstName lastName email')
      .sort('-createdAt')
      .lean();

    return res.json({ data: corrections });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/corrections/me — submit own correction request
router.post('/me', async (req, res) => {
  try {
    if (!req.user.employeeId) {
      return res.status(404).json({ error: 'No employee profile is linked to this account' });
    }

    const employee = await Employee.findOne({
      _id: req.user.employeeId,
      tenantId: req.user.tenantId,
      isActive: true,
    }).select('_id branchId').lean();

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found for current account' });
    }

    const targetDate = req.body.targetDate || req.body.date;
    if (!targetDate) {
      return res.status(400).json({ error: 'targetDate is required' });
    }

    const correction = await new AttendanceCorrectionRequest({
      ...req.body,
      employeeId: req.user.employeeId,
      tenantId: req.user.tenantId,
      requestedBy: req.user.sub,
      targetDate,
      reasonCode: inferReasonCode(req.body.reasonCode, req.body.reason),
      notes: req.body.notes || req.body.reason || '',
      after: normalizeAdjustment(req.body),
      status: 'pending'
    }).save();
    logger.info(`Correction request created by self-service: ${correction._id}`);
    return res.status(201).json({ data: correction.toObject() });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// GET /api/corrections?status=pending&employeeId=xxx
router.get('/', authorize(...REVIEWER_ROLES, 'auditor'), async (req, res) => {
  try {
    const filter = { tenantId: req.user.tenantId };
    if (req.query.status)     filter.status     = req.query.status;
    if (req.query.employeeId) filter.employeeId = req.query.employeeId;

    const scopedEmployeeIds = await getScopedEmployeeIds(req);
    if (scopedEmployeeIds) {
      filter.employeeId = filter.employeeId
        ? { $in: scopedEmployeeIds.filter((id) => String(id) === String(req.query.employeeId)) }
        : { $in: scopedEmployeeIds };
    }

    const corrections = await AttendanceCorrectionRequest.find(filter)
      .populate('employeeId',  'firstName lastName employeeCode')
      .populate('requestedBy', 'firstName lastName email')
      .populate('reviewedBy',  'firstName lastName email')
      .sort('-createdAt').lean();
    return res.json({ data: corrections });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/corrections — submit a correction request
router.post('/', authorize(...REVIEWER_ROLES), async (req, res) => {
  try {
    const employee = await Employee.findOne({
      _id: req.body.employeeId,
      tenantId: req.user.tenantId,
      isActive: true,
    }).select('_id branchId').lean();

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found for current tenant' });
    }

    if (req.user.role !== 'super_admin' && req.user.branchId && String(employee.branchId) !== String(req.user.branchId)) {
      return res.status(403).json({ error: 'You can only submit corrections for your assigned branch' });
    }

    const targetDate = req.body.targetDate || req.body.date;
    if (!targetDate) {
      return res.status(400).json({ error: 'targetDate is required' });
    }

    const correction = await new AttendanceCorrectionRequest({
      ...req.body,
      tenantId:    req.user.tenantId,
      requestedBy: req.user.sub,
      targetDate,
      reasonCode: inferReasonCode(req.body.reasonCode, req.body.reason),
      notes: req.body.notes || req.body.reason || '',
      after: normalizeAdjustment(req.body),
      status:      'pending'
    }).save();
    logger.info(`Correction request created: ${correction._id}`);
    return res.status(201).json({ data: correction.toObject() });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// PATCH /api/corrections/:id/approve
router.patch(
  '/:id/approve',
  authorize('super_admin', 'client_admin', 'hr_payroll', 'branch_manager'),
  async (req, res) => {
    try {
      if (!canReviewRole(req.user.role)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      const scopedEmployeeIds = await getScopedEmployeeIds(req);
      const correction = await AttendanceCorrectionRequest.findOne({
        _id: req.params.id,
        tenantId: req.user.tenantId,
        status: 'pending',
        ...(scopedEmployeeIds ? { employeeId: { $in: scopedEmployeeIds } } : {}),
      });
      if (!correction) return res.status(404).json({ error: 'Not found or already reviewed' });

      const applyResult = await applyAttendanceAdjustment(correction, req.user.sub);

      correction.status = 'approved';
      correction.reviewedBy = req.user.sub;
      correction.reviewedAt = new Date();
      correction.reviewNotes = req.body.notes;

      if (applyResult) {
        correction.before = {
          ...(correction.before || {}),
          appliedBy: req.user.sub,
          appliedAt: new Date(),
          applyResult,
        };
      }

      await correction.save();
      const populated = await AttendanceCorrectionRequest.findById(correction._id)
        .populate('employeeId', 'firstName lastName employeeCode')
        .populate('requestedBy', 'firstName lastName email')
        .populate('reviewedBy', 'firstName lastName email')
        .lean();

      logger.info(`Correction ${req.params.id} approved by ${req.user.email}`);
      return res.json({ data: populated });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

// PATCH /api/corrections/:id/reject
router.patch(
  '/:id/reject',
  authorize('super_admin', 'client_admin', 'hr_payroll', 'branch_manager'),
  async (req, res) => {
    try {
      if (!canReviewRole(req.user.role)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      const scopedEmployeeIds = await getScopedEmployeeIds(req);
      const correction = await AttendanceCorrectionRequest.findOneAndUpdate(
        {
          _id: req.params.id,
          tenantId: req.user.tenantId,
          status: 'pending',
          ...(scopedEmployeeIds ? { employeeId: { $in: scopedEmployeeIds } } : {}),
        },
        { status: 'rejected', reviewedBy: req.user.sub, reviewedAt: new Date(), reviewNotes: req.body.notes },
        { new: true }
      )
      if (!correction) return res.status(404).json({ error: 'Not found or already reviewed' });
      const populated = await AttendanceCorrectionRequest.findById(correction._id)
        .populate('employeeId', 'firstName lastName employeeCode')
        .populate('requestedBy', 'firstName lastName email')
        .populate('reviewedBy', 'firstName lastName email')
        .lean();
      return res.json({ data: populated });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

module.exports = router;
