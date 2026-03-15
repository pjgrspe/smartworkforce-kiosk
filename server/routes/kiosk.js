/**
 * Kiosk Routes — Public endpoints for the in-browser face recognition kiosk.
 * No JWT required. Authenticated by tenant code (query param or body).
 */

const express        = require('express');
const mongoose       = require('mongoose');
const router         = express.Router();
const Tenant         = require('../models/Tenant');
const Employee       = require('../models/Employee');
const AttendanceLog  = require('../models/AttendanceLog');
const logger         = require('../utils/logger');
const offlineBuf     = require('../services/offline-buffer');

const isDbOnline = () => mongoose.connection.readyState === 1;

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
    const tenant = await Tenant.findOne({ code, isActive: true }).lean();
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
  if (!isDbOnline()) {
    const cached = offlineBuf.getCachedEmployees(req.tenantId);
    if (cached.length) {
      logger.warn('GET /kiosk/employees: DB offline — serving employee cache (%d employees)', cached.length);
      return res.json({ data: cached, offline: true });
    }
    return res.status(503).json({ error: 'Database offline and no local cache available' });
  }

  try {
    const employees = await Employee.find(
      { tenantId: req.tenantId, isActive: true, 'employment.status': 'active' },
      'firstName lastName employeeCode branchId faceData.faceApiDescriptors faceData.enrollmentDate'
    ).lean();

    // Update local cache so next offline session has fresh data
    offlineBuf.cacheEmployees(req.tenantId, employees);

    return res.json({ data: employees });
  } catch (err) {
    logger.error('GET /kiosk/employees:', err.message);
    // MongoDB query failed mid-request — try cache as last resort
    const cached = offlineBuf.getCachedEmployees(req.tenantId);
    if (cached.length) {
      logger.warn('GET /kiosk/employees: DB error — serving employee cache (%d employees)', cached.length);
      return res.json({ data: cached, offline: true });
    }
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/kiosk/recent?tenant=ACME
// Returns the last 15 punches today (for the recent activity feed).
router.get('/recent', resolveTenant, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const logs = await AttendanceLog.find(
      { tenantId: req.tenantId, timestamp: { $gte: today } }
    )
      .populate('employeeId', 'firstName lastName employeeCode')
      .sort({ timestamp: -1 })
      .limit(15)
      .lean();

    return res.json({ data: logs });
  } catch (err) {
    logger.error('GET /kiosk/recent:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/kiosk/punch?tenant=ACME
// Body: { tenant, employeeId, type, confidenceScore }
// Queues to SQLite offline buffer when MongoDB is unreachable.
router.post('/punch', resolveTenant, async (req, res) => {
  const { employeeId, type, confidenceScore } = req.body;

  if (!employeeId) return res.status(400).json({ error: 'employeeId required' });
  if (!['IN', 'OUT', 'BREAK_IN', 'BREAK_OUT'].includes(type)) {
    return res.status(400).json({ error: 'type must be IN | OUT | BREAK_IN | BREAK_OUT' });
  }

  const now = new Date();

  // ── Offline path ────────────────────────────────────────────────────────────
  if (!isDbOnline()) {
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

  // ── Online path ─────────────────────────────────────────────────────────────
  try {
    // Verify employee belongs to this tenant
    const emp = await Employee.findOne(
      { _id: employeeId, tenantId: req.tenantId, isActive: true },
      'firstName lastName employeeCode branchId'
    ).lean();
    if (!emp) return res.status(404).json({ error: 'Employee not found' });

    const log = await new AttendanceLog({
      tenantId:        req.tenantId,
      branchId:        emp.branchId,
      employeeId,
      type,
      timestamp:       now,
      source:          'face_kiosk',
      confidenceScore: confidenceScore != null ? Number(confidenceScore) : undefined,
      synced:          true,
      syncedAt:        now,
    }).save();

    const populated = await AttendanceLog.findById(log._id)
      .populate('employeeId', 'firstName lastName employeeCode')
      .lean();

    logger.info(`Kiosk punch: ${type} - ${emp.firstName} ${emp.lastName}`);
    return res.status(201).json({ data: populated });
  } catch (err) {
    // MongoDB query failed after readyState check — queue as fallback
    logger.error('POST /kiosk/punch DB error — buffering offline:', err.message);
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
