/**
 * Attendance Routes
 */

const express       = require('express');
const router        = express.Router();
const AttendanceLog = require('../models/AttendanceLog');
const { authenticate, authorize } = require('../middleware/auth');
const logger        = require('../utils/logger');

router.use(authenticate);

// GET /api/attendance — filtered list
router.get('/', async (req, res) => {
  try {
    const { employeeId, branchId, start_date, end_date, limit } = req.query;

    const filter = { tenantId: req.user.tenantId };
    if (employeeId)  filter.employeeId  = employeeId;
    if (branchId)    filter.branchId    = branchId;
    if (start_date || end_date) {
      filter.timestamp = {};
      if (start_date) filter.timestamp.$gte = new Date(start_date);
      if (end_date) {
        const end = new Date(end_date);
        end.setHours(23, 59, 59, 999);          // include the whole day
        filter.timestamp.$lte = end;
      }
    }

    // Branch managers see only their branch
    if (req.user.role === 'branch_manager' && req.user.branchId) {
      filter.branchId = req.user.branchId;
    }

    const rows = await AttendanceLog.find(filter)
      .populate('employeeId', 'firstName lastName employeeCode')
      .sort({ timestamp: -1 })
      .limit(parseInt(limit) || 200)
      .lean();

    return res.json({ data: rows });
  } catch (err) {
    logger.error('GET /attendance:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/attendance/today
router.get('/today', async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  req.query.start_date = today.toISOString();
  // re-use the main handler
  const filter = { tenantId: req.user.tenantId, timestamp: { $gte: today } };
  if (req.user.role === 'branch_manager' && req.user.branchId) {
    filter.branchId = req.user.branchId;
  }
  try {
    const rows = await AttendanceLog.find(filter)
      .populate('employeeId', 'firstName lastName employeeCode')
      .sort({ timestamp: -1 })
      .lean();
    return res.json({ data: rows });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/attendance — admin/HR manual entry
router.post('/', authorize('super_admin', 'client_admin', 'hr_payroll', 'branch_manager'), async (req, res) => {
  try {
    const log = await new AttendanceLog({
      ...req.body,
      tenantId: req.user.tenantId,
      source: 'admin_correction',
      synced: true,
      syncedAt: new Date()
    }).save();

    logger.info(`Manual attendance log created: ${log._id}`);
    return res.status(201).json({ data: log.toObject() });
  } catch (err) {
    logger.error('POST /attendance:', err.message);
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
