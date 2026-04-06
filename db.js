/**
 * SQLite database for the kiosk offline service.
 * Uses the built-in node:sqlite module (Node 22+) — no native compilation needed.
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || './data/kiosk.db';

// Ensure the data directory exists
fs.mkdirSync(path.dirname(path.resolve(DB_PATH)), { recursive: true });

let _db = null;

function getDb() {
  if (_db) return _db;

  _db = new DatabaseSync(path.resolve(DB_PATH));
  _db.exec('PRAGMA journal_mode = WAL');
  _db.exec('PRAGMA foreign_keys = ON');

  _db.exec(`
    CREATE TABLE IF NOT EXISTS employee_cache (
      id          TEXT PRIMARY KEY,
      first_name  TEXT NOT NULL,
      last_name   TEXT NOT NULL,
      employee_code TEXT,
      branch_id   TEXT,
      face_descriptors TEXT,
      enrollment_date  TEXT,
      updated_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS punch_queue (
      id            TEXT PRIMARY KEY,
      employee_id   TEXT NOT NULL,
      type          TEXT NOT NULL,
      punched_at    TEXT NOT NULL,
      confidence    REAL,
      synced        INTEGER DEFAULT 0,
      retry_count   INTEGER DEFAULT 0,
      created_at    TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS recent_punches (
      id          TEXT PRIMARY KEY,
      employee_id TEXT,
      first_name  TEXT,
      last_name   TEXT,
      employee_code TEXT,
      type        TEXT NOT NULL,
      timestamp   TEXT NOT NULL,
      source      TEXT DEFAULT 'face_kiosk',
      confidence  REAL,
      synced      INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS sync_meta (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  return _db;
}

// ── Employee cache ────────────────────────────────────────────────────────────

function upsertEmployees(employees) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO employee_cache (id, first_name, last_name, employee_code, branch_id, face_descriptors, enrollment_date, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      first_name      = excluded.first_name,
      last_name       = excluded.last_name,
      employee_code   = excluded.employee_code,
      branch_id       = excluded.branch_id,
      face_descriptors= excluded.face_descriptors,
      enrollment_date = excluded.enrollment_date,
      updated_at      = excluded.updated_at
  `);

  db.exec('BEGIN');
  try {
    for (const e of employees) {
      stmt.run(
        e.id || e._id,
        e.firstName,
        e.lastName,
        e.employeeCode || null,
        e.branchId || null,
        JSON.stringify(e.faceData?.faceApiDescriptors || []),
        e.faceData?.enrollmentDate || null,
      );
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function getEmployees() {
  const db = getDb();
  return db.prepare('SELECT * FROM employee_cache ORDER BY last_name ASC, first_name ASC').all().map(row => ({
    _id: row.id,
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    employeeCode: row.employee_code,
    branchId: row.branch_id,
    faceData: {
      faceApiDescriptors: row.face_descriptors ? JSON.parse(row.face_descriptors) : [],
      enrollmentDate: row.enrollment_date,
    },
  }));
}

function getEmployeeById(id) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM employee_cache WHERE id = ?').get(id);
  if (!row) return null;
  return {
    _id: row.id,
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    employeeCode: row.employee_code,
    branchId: row.branch_id,
  };
}

// ── Punch queue ───────────────────────────────────────────────────────────────

function enqueuePunch({ id, employeeId, type, punchedAt, confidence }) {
  const db = getDb();
  db.prepare(`
    INSERT OR IGNORE INTO punch_queue (id, employee_id, type, punched_at, confidence)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, employeeId, type, punchedAt, confidence ?? null);
}

function getPendingPunches(limit = 50) {
  return getDb().prepare(
    'SELECT * FROM punch_queue WHERE synced = 0 AND retry_count < 10 ORDER BY created_at ASC LIMIT ?',
  ).all(limit);
}

function markPunchSynced(id) {
  getDb().prepare('UPDATE punch_queue SET synced = 1 WHERE id = ?').run(id);
}

function incrementPunchRetry(id) {
  getDb().prepare('UPDATE punch_queue SET retry_count = retry_count + 1 WHERE id = ?').run(id);
}

function pendingCount() {
  return getDb().prepare('SELECT COUNT(*) as c FROM punch_queue WHERE synced = 0').get().c;
}

// ── Recent punches ────────────────────────────────────────────────────────────

function insertRecentPunch({ id, employeeId, firstName, lastName, employeeCode, type, timestamp, confidence, synced = 1 }) {
  getDb().prepare(`
    INSERT OR IGNORE INTO recent_punches (id, employee_id, first_name, last_name, employee_code, type, timestamp, confidence, synced)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, employeeId, firstName, lastName, employeeCode, type, timestamp, confidence ?? null, synced ? 1 : 0);
}

function getRecentPunches(limit = 15) {
  return getDb().prepare(
    'SELECT * FROM recent_punches ORDER BY timestamp DESC LIMIT ?',
  ).all(limit).map(row => ({
    _id: row.id,
    id: row.id,
    type: row.type,
    timestamp: row.timestamp,
    source: row.source,
    confidenceScore: row.confidence,
    synced: !!row.synced,
    employeeId: {
      _id: row.employee_id,
      firstName: row.first_name,
      lastName: row.last_name,
      employeeCode: row.employee_code,
    },
  }));
}

// ── Sync metadata ─────────────────────────────────────────────────────────────

function getLastPunchToday(employeeId) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const row = getDb().prepare(
    `SELECT type FROM recent_punches
     WHERE employee_id = ? AND timestamp >= ?
     ORDER BY timestamp DESC LIMIT 1`,
  ).get(employeeId, todayStart.toISOString());
  return row ? row.type : null;
}

function getMeta(key) {
  const row = getDb().prepare('SELECT value FROM sync_meta WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setMeta(key, value) {
  getDb().prepare(`
    INSERT INTO sync_meta (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, String(value));
}

module.exports = {
  getDb,
  upsertEmployees,
  getEmployees,
  getEmployeeById,
  enqueuePunch,
  getPendingPunches,
  markPunchSynced,
  incrementPunchRetry,
  pendingCount,
  insertRecentPunch,
  getRecentPunches,
  getLastPunchToday,
  getMeta,
  setMeta,
};
