/**
 * Kiosk Routes — Public endpoints for the in-browser face recognition kiosk.
 * No JWT required. Authenticated by tenant code (query param or body).
 */

const express        = require('express');
const router         = express.Router();
const { checkDatabaseConnection } = require('../config/database');
const { getTenantRepository } = require('../repositories/tenant');
const { getKioskRepository } = require('../repositories/kiosk');
const logger         = require('../utils/logger');
const offlineBuf     = require('../services/offline-buffer');

function normalizeTenantCode(raw) {
  const normalized = (raw || '').toString().toUpperCase().trim();
  if (normalized === 'APOLLO') return 'DEWEBNET';
  return normalized;
}

// Middleware: resolve tenant by code
const resolveTenant = async (req, res, next) => {
  const code = normalizeTenantCode(req.query.tenant || req.body?.tenant || '');
  if (!code) return res.status(400).json({ error: 'tenant code is required' });

  try {
    const tenantRepo = getTenantRepository();
    const tenant = await tenantRepo.findActiveByCode(code);
    if (!tenant) return res.status(404).json({ error: 'Invalid company code' });
    req.tenantId = tenant._id;
    req.tenant   = tenant;
    next();
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// GET /api/kiosk/employees?tenant=ACME
// Returns active employees with face-api.js descriptors (no sensitive data).
// Falls back to SQLite cache when MongoDB is unreachable.
router.get('/employees', resolveTenant, async (req, res) => {
  if (!(await checkDatabaseConnection())) {
    const cached = offlineBuf.getCachedEmployees(req.tenantId);
    if (cached.length) {
      logger.warn('GET /kiosk/employees: DB offline - serving employee cache (%d employees)', cached.length);
      return res.json({ data: cached, offline: true });
    }
    return res.status(503).json({ error: 'Database offline and no local cache available' });
  }

  try {
    const kioskRepo = getKioskRepository();
    const employees = await kioskRepo.getEmployeesForKiosk(req.tenantId);

    offlineBuf.cacheEmployees(req.tenantId, employees);

    return res.json({ data: employees });
  } catch (err) {
    logger.error('GET /kiosk/employees:', err.message);
    const cached = offlineBuf.getCachedEmployees(req.tenantId);
    if (cached.length) {
      logger.warn('GET /kiosk/employees: DB error - serving employee cache (%d employees)', cached.length);
      return res.json({ data: cached, offline: true });
    }
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/kiosk/recent?tenant=ACME
// Returns the last 15 punches today (for the recent activity feed).
router.get('/recent', resolveTenant, async (req, res) => {
  try {
    const kioskRepo = getKioskRepository();
    const logs = await kioskRepo.getRecentAttendance(req.tenantId, 15);

    return res.json({ data: logs });
  } catch (err) {
    logger.error('GET /kiosk/recent:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/kiosk/punch?tenant=ACME
// Body: { tenant, employeeId, type, confidenceScore }
// Queues to SQLite offline buffer when the database is unreachable.
router.post('/punch', resolveTenant, async (req, res) => {
  const { employeeId, type, confidenceScore } = req.body;

  if (!employeeId) return res.status(400).json({ error: 'employeeId required' });
  if (!['IN', 'OUT', 'BREAK_IN', 'BREAK_OUT'].includes(type)) {
    return res.status(400).json({ error: 'type must be IN | OUT | BREAK_IN | BREAK_OUT' });
  }

  const now = new Date();

  // ── Offline path ────────────────────────────────────────────────────────────
  if (!(await checkDatabaseConnection())) {
    offlineBuf.queuePunch({
      tenantId: req.tenantId, branchId: null,
      employeeId, type, timestamp: now, confidenceScore,
    });
    logger.warn('Kiosk punch queued offline: %s %s', type, employeeId);
    return res.status(201).json({
      data: { employeeId, type, timestamp: now, source: 'face_kiosk', synced: false },
      offline: true,
      queued:  offlineBuf.pendingCount(),
    });
  }

  try {
    const kioskRepo = getKioskRepository();
    const created = await kioskRepo.createPunch({
      tenantId: req.tenantId,
      employeeId,
      type,
      confidenceScore,
      timestamp: now,
    });
    if (!created) return res.status(404).json({ error: 'Employee not found' });

    const employeeName = created.employeeId
      ? `${created.employeeId.firstName} ${created.employeeId.lastName}`.trim()
      : employeeId;
    logger.info(`Kiosk punch: ${type} - ${employeeName}`);
    return res.status(201).json({ data: created });
  } catch (err) {
    logger.error('POST /kiosk/punch DB error - buffering offline:', err.message);
    offlineBuf.queuePunch({
      tenantId: req.tenantId, branchId: null,
      employeeId, type, timestamp: now, confidenceScore,
    });
    return res.status(201).json({
      data: { employeeId, type, timestamp: now, source: 'face_kiosk', synced: false },
      offline: true,
      queued:  offlineBuf.pendingCount(),
    });
  }
});

module.exports = router;
