/**
 * Background sync worker for the kiosk offline service.
 *
 * Two jobs run on separate intervals:
 *  1. pushPunches   — flush pending punch_queue entries to the central server
 *  2. pullEmployees — refresh the local employee/face-encoding cache from central
 *
 * Both jobs are no-ops when the central server is unreachable, so the kiosk
 * keeps working offline and syncs automatically when connectivity is restored.
 */

const fetch = require('node-fetch');
const db    = require('./db');

const CENTRAL_URL              = (process.env.CENTRAL_URL || '').replace(/\/$/, '');
const TENANT_CODE              = process.env.TENANT_CODE || '';
const SYNC_INTERVAL_MS         = Number(process.env.SYNC_INTERVAL_MS)         || 30_000;
const ENCODING_REFRESH_MS      = Number(process.env.ENCODING_REFRESH_INTERVAL_MS) || 600_000;

let _statusListeners = [];
let _isOnline = false;

function onStatusChange(fn) { _statusListeners.push(fn); }
function isOnline() { return _isOnline; }

function broadcast(msg) {
  _statusListeners.forEach(fn => { try { fn(msg); } catch (_) {} });
}

function setOnline(val) {
  if (_isOnline !== val) {
    _isOnline = val;
    broadcast({ type: 'SYNC_STATUS', online: val, pending: db.pendingCount() });
  }
}

// ── Push pending punches to central ──────────────────────────────────────────

async function pushPunches() {
  const pending = db.getPendingPunches(50);
  if (!pending.length) return;

  for (const punch of pending) {
    try {
      const res = await fetch(`${CENTRAL_URL}/api/kiosk/punch?tenant=${TENANT_CODE}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          employeeId:      punch.employee_id,
          type:            punch.type,
          confidenceScore: punch.confidence,
          timestamp:       punch.punched_at,
          tenant:          TENANT_CODE,
        }),
        timeout: 8000,
      });

      if (res.ok) {
        db.markPunchSynced(punch.id);
        setOnline(true);
      } else {
        db.incrementPunchRetry(punch.id);
      }
    } catch (_err) {
      db.incrementPunchRetry(punch.id);
      setOnline(false);
      break; // stop trying if network is down
    }
  }

  broadcast({ type: 'SYNC_STATUS', online: _isOnline, pending: db.pendingCount() });
}

// ── Pull latest employee / face-encoding data from central ───────────────────

async function pullEmployees() {
  try {
    const res = await fetch(`${CENTRAL_URL}/api/kiosk/employees?tenant=${TENANT_CODE}`, {
      timeout: 15000,
    });

    if (!res.ok) { setOnline(false); return; }

    const { data } = await res.json();
    if (Array.isArray(data) && data.length) {
      db.upsertEmployees(data);
      db.setMeta('last_employee_sync', new Date().toISOString());
      setOnline(true);
      broadcast({ type: 'CACHE_REFRESHED', count: data.length });
      console.log(`[sync] Employee cache refreshed: ${data.length} employees`);
    }
  } catch (_err) {
    setOnline(false);
  }
}

// ── Heartbeat check ───────────────────────────────────────────────────────────

async function heartbeat() {
  try {
    const res = await fetch(`${CENTRAL_URL}/api/health`, { timeout: 5000 });
    setOnline(res.ok);
  } catch (_) {
    setOnline(false);
  }
}

// ── Start ─────────────────────────────────────────────────────────────────────

function start() {
  if (!CENTRAL_URL || !TENANT_CODE) {
    console.warn('[sync] CENTRAL_URL or TENANT_CODE not set — sync disabled');
    return;
  }

  // Initial run
  heartbeat().then(() => {
    if (_isOnline) {
      pullEmployees();
      pushPunches();
    }
  });

  // Punch flush runs on the shorter interval
  setInterval(async () => {
    await heartbeat();
    if (_isOnline) await pushPunches();
  }, SYNC_INTERVAL_MS);

  // Face encoding refresh runs less frequently
  setInterval(() => {
    if (_isOnline) pullEmployees();
  }, ENCODING_REFRESH_MS);

  console.log(`[sync] Started — push every ${SYNC_INTERVAL_MS / 1000}s, pull encodings every ${ENCODING_REFRESH_MS / 1000}s`);
}

module.exports = { start, isOnline, onStatusChange };
