/**
 * Kiosk API routes — mirrors the central server's /api/kiosk/* endpoints.
 * Reads from the local SQLite cache; writes go to the local punch queue and
 * are flushed to central by the background sync worker.
 */

const express    = require('express');
const { v4: uuidv4 } = require('uuid');
const { spawnSync } = require('child_process');
const db   = require('../db');
const sync = require('../sync');

const router = express.Router();

// Read version once at startup — avoids spawning a process on every /config request
const _versionResult = spawnSync('git describe --tags --exact-match HEAD', {
  shell: true, encoding: 'utf8', cwd: __dirname, windowsHide: true,
});
const _kioskVersion = _versionResult.status === 0 ? _versionResult.stdout.trim() : null;

const MIN_CONFIDENCE = 0.5;

const VALID_NEXT = {
  null:        ['IN'],
  'IN':        ['OUT', 'BREAK_IN'],
  'OUT':       ['IN'],
  'BREAK_IN':  ['BREAK_OUT'],
  'BREAK_OUT': ['OUT', 'BREAK_IN'],
};

function punchSequenceError(last, next) {
  if ((VALID_NEXT[last] ?? VALID_NEXT[null]).includes(next)) return null;
  if (next === 'IN'        && last === 'IN')        return 'Already clocked in. Clock out first.';
  if (next === 'IN'        && last === 'BREAK_IN')  return 'Break in progress. End your break first.';
  if (next === 'IN'        && last === 'BREAK_OUT') return 'Already clocked in. Clock out first.';
  if (next === 'OUT'       && !last)                return 'Not clocked in. Clock in first.';
  if (next === 'OUT'       && last === 'OUT')       return 'Already clocked out.';
  if (next === 'OUT'       && last === 'BREAK_IN')  return 'Break in progress. End your break before clocking out.';
  if (next === 'BREAK_IN'  && !last)                return 'Not clocked in. Clock in before starting a break.';
  if (next === 'BREAK_IN'  && last === 'OUT')       return 'Not clocked in. Clock in before starting a break.';
  if (next === 'BREAK_IN'  && last === 'BREAK_IN')  return 'Already on break.';
  if (next === 'BREAK_OUT' && last !== 'BREAK_IN')  return 'Not on break.';
  return `Cannot record ${next} after ${last || 'no punch today'}.`;
}

// POST /api/kiosk/sync — manually trigger an immediate employee cache pull from central
router.post('/sync', async (req, res) => {
  const result = await sync.forcePull();
  const lastSync = db.getMeta('last_employee_sync');
  return res.json({ ...result, lastSync });
});

// GET /api/kiosk/config — returns the tenant code baked into this kiosk's .env
// The browser uses this to auto-configure and skip the manual setup screen.
router.get('/config', (req, res) => {
  const tenantCode = (process.env.TENANT_CODE || '').toUpperCase().trim();
  if (!tenantCode) return res.status(404).json({ error: 'TENANT_CODE not set in .env' });

  const version = _kioskVersion;

  return res.json({ tenantCode, version });
});

// GET /api/kiosk/employees?tenant=CODE
router.get('/employees', (req, res) => {
  const employees = db.getEmployees();
  const offline   = !sync.isOnline();
  const lastSync  = db.getMeta('last_employee_sync');

  if (!employees.length) {
    if (offline) {
      return res.status(503).json({
        error: 'No employee data cached yet. Connect to central server to populate the cache.',
      });
    }
  }

  return res.json({ data: employees, offline, lastSync });
});

// GET /api/kiosk/recent?tenant=CODE
router.get('/recent', (req, res) => {
  const punches = db.getRecentPunches(15);
  return res.json({ data: punches, offline: !sync.isOnline() });
});

// POST /api/kiosk/punch
// Body: { employeeId, type, confidenceScore, tenant }
router.post('/punch', (req, res) => {
  const { employeeId, type, confidenceScore } = req.body;

  if (!employeeId) return res.status(400).json({ error: 'employeeId required' });
  if (!['IN', 'OUT', 'BREAK_IN', 'BREAK_OUT'].includes(type)) {
    return res.status(400).json({ error: 'type must be IN | OUT | BREAK_IN | BREAK_OUT' });
  }

  // Reject if no face confidence or below threshold
  if (confidenceScore == null || confidenceScore < MIN_CONFIDENCE) {
    return res.status(403).json({ error: 'Face verification required' });
  }

  const employee = db.getEmployeeById(employeeId);
  if (!employee) return res.status(404).json({ error: 'Employee not found in local cache' });

  const lastPunch = db.getLastPunchToday(employeeId);
  const seqErr = punchSequenceError(lastPunch, type);
  if (seqErr) return res.status(409).json({ error: seqErr });

  const id  = uuidv4();
  const now = new Date().toISOString();

  // Always write to local queue first
  db.enqueuePunch({
    id,
    employeeId,
    type,
    punchedAt:  now,
    confidence: confidenceScore ?? null,
  });

  // Keep a local recent-punches log so the activity feed works offline
  db.insertRecentPunch({
    id,
    employeeId,
    firstName:    employee.firstName,
    lastName:     employee.lastName,
    employeeCode: employee.employeeCode,
    type,
    timestamp:    now,
    confidence:   confidenceScore ?? null,
    synced:       sync.isOnline() ? 1 : 0,
  });

  const responseData = {
    _id:            id,
    id,
    type,
    timestamp:      now,
    source:         'face_kiosk',
    confidenceScore: confidenceScore ?? null,
    synced:         false,
    employeeId: {
      _id:          employee.id,
      firstName:    employee.firstName,
      lastName:     employee.lastName,
      employeeCode: employee.employeeCode,
    },
  };

  return res.status(201).json({
    data:    responseData,
    offline: !sync.isOnline(),
    queued:  db.pendingCount(),
  });
});

module.exports = router;
