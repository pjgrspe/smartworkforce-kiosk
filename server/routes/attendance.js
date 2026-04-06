/**
 * Attendance Routes
 */

const express       = require('express');
const router        = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const logger        = require('../utils/logger');
const { getAttendanceRepository } = require('../repositories/attendance');

function parseLimit(value, fallback) {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function sendRepositoryError(res, err) {
  if (err && err.code === 'NOT_IMPLEMENTED') {
    return res.status(501).json({ error: err.message });
  }
  return res.status(500).json({ error: err.message });
}

router.use(authenticate);

// GET /api/attendance/me — current authenticated employee attendance
router.get('/me', async (req, res) => {
  try {
    if (!req.user.employeeId) {
      return res.status(404).json({ error: 'No employee profile is linked to this account' });
    }

    const { start_date, end_date, limit } = req.query;
    const attendanceRepo = getAttendanceRepository();
    const rows = await attendanceRepo.getMyAttendance({
      user: req.user,
      startDate: start_date,
      endDate: end_date,
      limit: parseLimit(limit, 100),
    });

    return res.json({ data: rows });
  } catch (err) {
    logger.error('GET /attendance/me:', err.message);
    return sendRepositoryError(res, err);
  }
});

// GET /api/attendance — filtered list
router.get('/', async (req, res) => {
  try {
    const { employeeId, branchId, start_date, end_date, limit } = req.query;
    const attendanceRepo = getAttendanceRepository();
    const rows = await attendanceRepo.listAttendance({
      user: req.user,
      employeeId,
      branchId,
      startDate: start_date,
      endDate: end_date,
      limit: parseLimit(limit, 200),
    });

    return res.json({ data: rows });
  } catch (err) {
    logger.error('GET /attendance:', err.message);
    return sendRepositoryError(res, err);
  }
});

// GET /api/attendance/today
router.get('/today', async (req, res) => {
  try {
    const attendanceRepo = getAttendanceRepository();
    const rows = await attendanceRepo.listToday({ user: req.user });
    return res.json({ data: rows });
  } catch (err) {
    logger.error('GET /attendance/today:', err.message);
    return sendRepositoryError(res, err);
  }
});

// POST /api/attendance — admin/HR manual entry
router.post('/', authorize('super_admin', 'client_admin', 'hr_payroll', 'branch_manager'), async (req, res) => {
  try {
    const attendanceRepo = getAttendanceRepository();
    const log = await attendanceRepo.createManualAttendance({
      user: req.user,
      payload: req.body,
    });

    logger.info(`Manual attendance log created: ${log._id || log.id}`);
    return res.status(201).json({ data: log });
  } catch (err) {
    logger.error('POST /attendance:', err.message);
    if (err && err.code === 'NOT_IMPLEMENTED') {
      return res.status(501).json({ error: err.message });
    }
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
