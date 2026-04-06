/**
 * Offline Buffer — SQLite-backed queue for attendance punches and employee cache.
 * Used by the kiosk route to buffer punches when MongoDB Atlas is unreachable,
 * and to serve cached employee descriptors so face recognition still works offline.
 */

const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');

const DATA_DIR = path.join(__dirname, '../data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'offline-buffer.db'));

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS punch_queue (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    tenantId        TEXT    NOT NULL,
    branchId        TEXT,
    employeeId      TEXT    NOT NULL,
    type            TEXT    NOT NULL,
    timestamp       TEXT    NOT NULL,
    confidenceScore REAL,
    createdAt       TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS employee_cache (
    tenantId   TEXT NOT NULL,
    employeeId TEXT NOT NULL,
    data       TEXT NOT NULL,
    updatedAt  TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (tenantId, employeeId)
  );
`);

// ── Punch queue ────────────────────────────────────────────────────────────────

const stmtInsertPunch = db.prepare(`
  INSERT INTO punch_queue (tenantId, branchId, employeeId, type, timestamp, confidenceScore)
  VALUES (?, ?, ?, ?, ?, ?)
`);

function queuePunch({ tenantId, branchId, employeeId, type, timestamp, confidenceScore }) {
  stmtInsertPunch.run(
    String(tenantId),
    branchId ? String(branchId) : null,
    String(employeeId),
    type,
    timestamp instanceof Date ? timestamp.toISOString() : timestamp,
    confidenceScore != null ? Number(confidenceScore) : null,
  );
}

function getPendingPunches() {
  return db.prepare('SELECT * FROM punch_queue ORDER BY id ASC').all();
}

function deletePunch(id) {
  db.prepare('DELETE FROM punch_queue WHERE id = ?').run(id);
}

function pendingCount() {
  return db.prepare('SELECT COUNT(*) as n FROM punch_queue').get().n;
}

// ── Employee cache ─────────────────────────────────────────────────────────────

const stmtUpsertEmployee = db.prepare(`
  INSERT OR REPLACE INTO employee_cache (tenantId, employeeId, data, updatedAt)
  VALUES (?, ?, ?, datetime('now'))
`);

const upsertMany = db.transaction((tenantId, employees) => {
  // Clear old cache for this tenant before re-inserting so removed employees don't linger
  db.prepare('DELETE FROM employee_cache WHERE tenantId = ?').run(String(tenantId));
  for (const emp of employees) {
    stmtUpsertEmployee.run(String(tenantId), String(emp._id), JSON.stringify(emp));
  }
});

function cacheEmployees(tenantId, employees) {
  upsertMany(String(tenantId), employees);
}

function getCachedEmployees(tenantId) {
  return db
    .prepare('SELECT data FROM employee_cache WHERE tenantId = ?')
    .all(String(tenantId))
    .map(row => JSON.parse(row.data));
}

module.exports = {
  queuePunch,
  getPendingPunches,
  deletePunch,
  pendingCount,
  cacheEmployees,
  getCachedEmployees,
};
