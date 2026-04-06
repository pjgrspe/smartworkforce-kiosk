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
  const pool = getPool();
  const eventKey = idempotencyKey || uuidv4();

  if (isBranchMode()) {
    // Branch: queue in outbox for sync worker to push to HQ
    if (!branchId) return null;
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
  } else {
    // Central: write directly to sync_events so branches can pull it down
    await pool.query(
      `
        INSERT INTO sync_events (
          source_branch_id,
          target_branch_id,
          idempotency_key,
          event_type,
          entity_type,
          entity_id,
          payload
        )
        VALUES (NULL, NULL, $1, $2, $3, $4, $5)
        ON CONFLICT (idempotency_key) DO NOTHING
      `,
      [eventKey, eventType, entityType, entityId || null, payload || {}],
    );
  }

  return eventKey;
}

module.exports = {
  enqueueOutboxEvent,
  isBranchPostgresMode: isBranchMode,
};
