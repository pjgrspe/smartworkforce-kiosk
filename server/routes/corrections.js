const express = require('express');
const router  = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const logger  = require('../utils/logger');
const { getCorrectionRepository } = require('../repositories/correction');
const { getAttendanceRepository } = require('../repositories/attendance');
const { getEmployeeRepository } = require('../repositories/employee');

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

  const employeeRepo = getEmployeeRepository();
  const attendanceRepo = getAttendanceRepository();

  const employee = await employeeRepo.findActiveEmployeeById({
    id: correction.employeeId,
    tenantId: correction.tenantId,
  });

  if (!employee) throw new Error('Employee not found while applying correction');

  if (adjustment.operation === 'create') {
    if (!adjustment.type || !ATTENDANCE_TYPES.includes(adjustment.type)) {
      throw new Error('Adjustment type must be IN, OUT, BREAK_IN, or BREAK_OUT');
    }

    const timestamp = buildTimestampFromAdjustment(correction.targetDate, adjustment);
    const created = await attendanceRepo.createCorrectionAttendance({
      tenantId: correction.tenantId,
      branchId: employee.branchId,
      employeeId: correction.employeeId,
      timestamp,
      type: adjustment.type,
      correctionRef: correction._id,
      notes: adjustment.notes || correction.notes || `Approved correction by ${reviewerId}`,
    });

    return { action: 'created', logId: String(created._id || created.id) };
  }

  if (adjustment.operation === 'update') {
    if (!adjustment.logId) throw new Error('Adjustment logId is required for update');

    const log = await attendanceRepo.getCorrectionAttendanceLog({
      id: adjustment.logId,
      tenantId: correction.tenantId,
      employeeId: correction.employeeId,
    });
    if (!log) throw new Error('Attendance log for update was not found');

    const patch = {
      source: 'admin_correction',
      synced: true,
      syncedAt: new Date(),
      correctionRef: correction._id,
      notes: adjustment.notes || correction.notes || log.notes,
    };

    if (adjustment.type && ATTENDANCE_TYPES.includes(adjustment.type)) {
      patch.type = adjustment.type;
    }
    if (adjustment.time || adjustment.timestamp) {
      patch.timestamp = buildTimestampFromAdjustment(correction.targetDate, adjustment);
    }

    const updated = await attendanceRepo.updateCorrectionAttendanceLog({
      id: adjustment.logId,
      tenantId: correction.tenantId,
      employeeId: correction.employeeId,
      patch,
    });

    if (!updated) throw new Error('Attendance log for update was not found');

    return { action: 'updated', logId: String(updated._id || updated.id) };
  }

  if (adjustment.operation === 'delete') {
    if (!adjustment.logId) throw new Error('Adjustment logId is required for delete');

    const deleted = await attendanceRepo.deleteCorrectionAttendanceLog({
      id: adjustment.logId,
      tenantId: correction.tenantId,
      employeeId: correction.employeeId,
    });

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
  if (['super_admin', 'client_admin'].includes(req.user.role) || !req.user.branchId) return null;

  const employeeRepo = getEmployeeRepository();
  const employees = await employeeRepo.listActive({ user: req.user });
  return employees.map((employee) => employee._id || employee.id);
}

router.use(authenticate);

// GET /api/corrections/me — current authenticated employee requests
router.get('/me', async (req, res) => {
  try {
    if (!req.user.employeeId) {
      return res.status(404).json({ error: 'No employee profile is linked to this account' });
    }

    const correctionRepo = getCorrectionRepository();
    const corrections = await correctionRepo.listMyCorrections({
      tenantId: req.user.tenantId,
      employeeId: req.user.employeeId,
      status: req.query.status,
    });

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

    const employeeRepo = getEmployeeRepository();
    const employee = await employeeRepo.findActiveEmployeeById({
      id: req.user.employeeId,
      tenantId: req.user.tenantId,
    });

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found for current account' });
    }

    const targetDate = req.body.targetDate || req.body.date;
    if (!targetDate) {
      return res.status(400).json({ error: 'targetDate is required' });
    }

    const correctionRepo = getCorrectionRepository();
    const correction = await correctionRepo.createCorrection({
      ...req.body,
      employeeId: req.user.employeeId,
      tenantId: req.user.tenantId,
      requestedBy: req.user.sub,
      targetDate,
      reasonCode: inferReasonCode(req.body.reasonCode, req.body.reason),
      notes: req.body.notes || req.body.reason || '',
      after: normalizeAdjustment(req.body),
      status: 'pending',
    });
    logger.info(`Correction request created by self-service: ${correction._id || correction.id}`);
    return res.status(201).json({ data: correction });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// GET /api/corrections?status=pending&employeeId=xxx
router.get('/', authorize(...REVIEWER_ROLES, 'auditor'), async (req, res) => {
  try {
    const scopedEmployeeIds = await getScopedEmployeeIds(req);
    const correctionRepo = getCorrectionRepository();
    const corrections = await correctionRepo.listCorrections({
      tenantId: req.user.tenantId,
      status: req.query.status,
      employeeId: req.query.employeeId,
      scopedEmployeeIds,
    });
    return res.json({ data: corrections });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/corrections — submit a correction request
router.post('/', authorize(...REVIEWER_ROLES), async (req, res) => {
  try {
    const employeeRepo = getEmployeeRepository();
    const employee = await employeeRepo.findActiveEmployeeById({
      id: req.body.employeeId,
      tenantId: req.user.tenantId,
    });

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found for current tenant' });
    }

    if (!['super_admin', 'client_admin'].includes(req.user.role) && req.user.branchId && String(employee.branchId) !== String(req.user.branchId)) {
      return res.status(403).json({ error: 'You can only submit corrections for your assigned branch' });
    }

    const targetDate = req.body.targetDate || req.body.date;
    if (!targetDate) {
      return res.status(400).json({ error: 'targetDate is required' });
    }

    const correctionRepo = getCorrectionRepository();
    const correction = await correctionRepo.createCorrection({
      ...req.body,
      tenantId:    req.user.tenantId,
      requestedBy: req.user.sub,
      targetDate,
      reasonCode: inferReasonCode(req.body.reasonCode, req.body.reason),
      notes: req.body.notes || req.body.reason || '',
      after: normalizeAdjustment(req.body),
      status:      'pending',
    });
    logger.info(`Correction request created: ${correction._id || correction.id}`);
    return res.status(201).json({ data: correction });
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
      const correctionRepo = getCorrectionRepository();
      const correction = await correctionRepo.findPendingCorrection({
        id: req.params.id,
        tenantId: req.user.tenantId,
        scopedEmployeeIds,
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

      const populated = await correctionRepo.saveCorrection(correction);

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
      const correctionRepo = getCorrectionRepository();
      const correction = await correctionRepo.rejectCorrection({
        id: req.params.id,
        tenantId: req.user.tenantId,
        scopedEmployeeIds,
        reviewerId: req.user.sub,
        notes: req.body.notes,
      });
      if (!correction) return res.status(404).json({ error: 'Not found or already reviewed' });
      return res.json({ data: correction });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

module.exports = router;
