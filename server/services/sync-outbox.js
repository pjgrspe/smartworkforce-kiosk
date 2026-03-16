const { v4: uuidv4 } = require('uuid');
const { getRuntimeMode } = require('../config/runtime');
const { getPool } = require('../config/postgres');

function isBranchMode() {
  return getRuntimeMode() === 'BRANCH';
}

async function enqueueOutboxEvent({
  branchId,
  eventType,
  entityType,
  entityId,
  payload,
  idempotencyKey,
}) {
  if (!isBranchMode()) return null;
  if (!branchId) return null;

  const pool = getPool();
  const eventKey = idempotencyKey || uuidv4();

  await pool.query(
    `
      INSERT INTO sync_outbox (
        branch_id,
        event_type,
        entity_type,
        entity_id,
        idempotency_key,
        payload
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (idempotency_key) DO NOTHING
    `,
    [branchId, eventType, entityType, entityId || null, eventKey, payload || {}],
  );

  return eventKey;
}

module.exports = {
  enqueueOutboxEvent,
  isBranchPostgresMode: isBranchMode,
};
