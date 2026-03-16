const logger = require('../utils/logger');
const { getPool } = require('../config/postgres');
const { getRuntimeMode } = require('../config/runtime');
const { applySyncEvent } = require('./sync-apply');

let timer = null;
let warnedMissingTarget = false;
const CURSOR_NAME = 'outbox_last_sent_id';
const INBOUND_CURSOR_NAME = 'inbound_last_seq';

function isEnabled() {
  return getRuntimeMode() === 'BRANCH';
}

async function fetchPendingOutbox(limit = 50) {
  const pool = getPool();
  const { rows } = await pool.query(
    `
      SELECT *
      FROM sync_outbox
      WHERE sent_at IS NULL
      ORDER BY created_at ASC
      LIMIT $1
    `,
    [limit],
  );
  return rows;
}

async function getBranchCursor(branchId) {
  const pool = getPool();
  const { rows } = await pool.query(
    `
      SELECT cursor_value
      FROM sync_checkpoints
      WHERE branch_id = $1
        AND cursor_name = $2
      LIMIT 1
    `,
    [branchId, CURSOR_NAME],
  );

  return rows[0] ? rows[0].cursor_value : null;
}

async function setBranchCursor(branchId, cursorValue) {
  const pool = getPool();
  await pool.query(
    `
      INSERT INTO sync_checkpoints (branch_id, cursor_name, cursor_value)
      VALUES ($1, $2, $3)
      ON CONFLICT (branch_id, cursor_name)
      DO UPDATE SET cursor_value = EXCLUDED.cursor_value,
                    updated_at = NOW()
    `,
    [branchId, CURSOR_NAME, cursorValue],
  );
}

async function getBranchInboundCursor(branchId) {
  const pool = getPool();
  const { rows } = await pool.query(
    `
      SELECT cursor_value
      FROM sync_checkpoints
      WHERE branch_id = $1
        AND cursor_name = $2
      LIMIT 1
    `,
    [branchId, INBOUND_CURSOR_NAME],
  );

  return rows[0] ? rows[0].cursor_value : null;
}

async function setBranchInboundCursor(branchId, cursorValue) {
  const pool = getPool();
  await pool.query(
    `
      INSERT INTO sync_checkpoints (branch_id, cursor_name, cursor_value)
      VALUES ($1, $2, $3)
      ON CONFLICT (branch_id, cursor_name)
      DO UPDATE SET cursor_value = EXCLUDED.cursor_value,
                    updated_at = NOW()
    `,
    [branchId, INBOUND_CURSOR_NAME, String(cursorValue)],
  );
}

async function markFailed(id, errorMessage) {
  const pool = getPool();
  await pool.query(
    `
      UPDATE sync_outbox
      SET retry_count = retry_count + 1,
          last_error = $2
      WHERE id = $1
    `,
    [id, errorMessage.slice(0, 500)],
  );
}

async function markSent(id) {
  const pool = getPool();
  await pool.query(
    `
      UPDATE sync_outbox
      SET sent_at = NOW(),
          last_error = NULL
      WHERE id = $1
    `,
    [id],
  );
}

async function dispatchEvent(eventRow) {
  const syncTargetUrl = process.env.CENTRAL_SYNC_URL;
  if (!syncTargetUrl) {
    if (!warnedMissingTarget) {
      warnedMissingTarget = true;
      logger.warn('CENTRAL_SYNC_URL is not set. Sync worker will keep events pending.');
    }
    return false;
  }

  const endpoint = `${syncTargetUrl.replace(/\/$/, '')}/api/sync/events`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-idempotency-key': eventRow.idempotency_key,
      ...(process.env.SYNC_SHARED_SECRET ? { 'x-sync-secret': process.env.SYNC_SHARED_SECRET } : {}),
    },
    body: JSON.stringify({
      id: eventRow.id,
      eventType: eventRow.event_type,
      entityType: eventRow.entity_type,
      entityId: eventRow.entity_id,
      branchId: eventRow.branch_id,
      payload: eventRow.payload,
      createdAt: eventRow.created_at,
    }),
  });

  if (!response.ok) {
    const msg = `Sync target returned ${response.status}`;
    throw new Error(msg);
  }

  return true;
}

async function fetchInboundEvents({ branchId, after, limit }) {
  const syncTargetUrl = process.env.CENTRAL_SYNC_URL;
  if (!syncTargetUrl) return [];

  const endpoint = `${syncTargetUrl.replace(/\/$/, '')}/api/sync/events/pull?branchId=${encodeURIComponent(branchId)}&after=${encodeURIComponent(after)}&limit=${encodeURIComponent(limit)}`;
  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      ...(process.env.SYNC_SHARED_SECRET ? { 'x-sync-secret': process.env.SYNC_SHARED_SECRET } : {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Inbound pull returned ${response.status}`);
  }

  const body = await response.json();
  return Array.isArray(body.data) ? body.data : [];
}

async function applyInboundEvent(branchId, eventRow) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const dedupe = await client.query(
      `
        INSERT INTO sync_inbox (branch_id, idempotency_key, source_branch_id, payload)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (branch_id, idempotency_key)
        DO NOTHING
        RETURNING id
      `,
      [branchId, eventRow.idempotencyKey, eventRow.sourceBranchId || null, eventRow.payload || {}],
    );

    if (dedupe.rowCount > 0) {
      await applySyncEvent(client, {
        eventType: eventRow.eventType,
        entityType: eventRow.entityType,
        entityId: eventRow.entityId || null,
        payload: eventRow.payload || {},
      });
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function registerInboundFailure(branchId, eventRow, errorMessage) {
  const pool = getPool();
  const { rows } = await pool.query(
    `
      INSERT INTO sync_inbound_failures (branch_id, event_seq, retry_count, last_error, payload)
      VALUES ($1, $2, 1, $3, $4)
      ON CONFLICT (branch_id, event_seq)
      DO UPDATE SET retry_count = sync_inbound_failures.retry_count + 1,
                    last_error = EXCLUDED.last_error,
                    payload = EXCLUDED.payload,
                    updated_at = NOW()
      RETURNING retry_count
    `,
    [
      branchId,
      eventRow.seq,
      (errorMessage || 'Inbound apply failed').slice(0, 500),
      eventRow,
    ],
  );

  return rows[0] ? rows[0].retry_count : 1;
}

async function clearInboundFailure(branchId, eventSeq) {
  const pool = getPool();
  await pool.query(
    'DELETE FROM sync_inbound_failures WHERE branch_id = $1 AND event_seq = $2',
    [branchId, eventSeq],
  );
}

async function moveInboundToDeadLetter(branchId, eventRow, errorMessage) {
  const pool = getPool();
  await pool.query(
    `
      INSERT INTO sync_dead_letter (
        branch_id,
        event_seq,
        idempotency_key,
        event_type,
        entity_type,
        payload,
        error_message
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (branch_id, event_seq)
      DO UPDATE SET
        error_message = EXCLUDED.error_message,
        payload = EXCLUDED.payload,
        moved_at = NOW()
    `,
    [
      branchId,
      eventRow.seq,
      eventRow.idempotencyKey || null,
      eventRow.eventType || null,
      eventRow.entityType || null,
      eventRow,
      (errorMessage || 'Inbound apply failed').slice(0, 500),
    ],
  );
}

async function runInboundCycle() {
  const branchId = process.env.BRANCH_ID;
  const syncTargetUrl = process.env.CENTRAL_SYNC_URL;
  if (!branchId || !syncTargetUrl) return;

  const cursorRaw = await getBranchInboundCursor(branchId);
  const after = parseInt(String(cursorRaw || '0'), 10) || 0;
  const limit = parseInt(process.env.SYNC_OUTBOX_BATCH_SIZE || '50', 10);

  const events = await fetchInboundEvents({ branchId, after, limit });
  if (!events.length) return;

  let lastSeq = after;
  let appliedCount = 0;
  const maxRetries = parseInt(process.env.SYNC_MAX_RETRIES || '5', 10);

  for (const eventRow of events) {
    try {
      await applyInboundEvent(branchId, eventRow);
      await clearInboundFailure(branchId, eventRow.seq);

      if (eventRow.seq != null) {
        lastSeq = eventRow.seq;
      }
      appliedCount += 1;
    } catch (err) {
      const retryCount = await registerInboundFailure(branchId, eventRow, err.message || 'Inbound apply failed');
      if (retryCount >= maxRetries) {
        await moveInboundToDeadLetter(branchId, eventRow, err.message || 'Inbound apply failed');
        await clearInboundFailure(branchId, eventRow.seq);
        if (eventRow.seq != null) {
          lastSeq = eventRow.seq;
        }
        logger.error(`Inbound event moved to dead letter (seq=${eventRow.seq}, retries=${retryCount})`);
        continue;
      }

      logger.warn(`Inbound event apply failed (seq=${eventRow.seq}, retry=${retryCount}/${maxRetries})`);
      break;
    }
  }

  if (lastSeq > after) {
    await setBranchInboundCursor(branchId, lastSeq);
  }

  if (appliedCount > 0) {
    logger.info(`Sync worker applied ${appliedCount} inbound event(s)`);
  }
}

async function runOutboundCycle() {
  const pending = await fetchPendingOutbox(parseInt(process.env.SYNC_OUTBOX_BATCH_SIZE || '50', 10));
  if (!pending.length) return;

  const branchCursorCache = new Map();
  let sentCount = 0;
  for (const eventRow of pending) {
    try {
      if (!branchCursorCache.has(eventRow.branch_id)) {
        const cursor = await getBranchCursor(eventRow.branch_id).catch(() => null);
        branchCursorCache.set(eventRow.branch_id, cursor);
      }

      const lastCursor = branchCursorCache.get(eventRow.branch_id);
      if (lastCursor && String(lastCursor) === String(eventRow.id)) {
        continue;
      }

      const sent = await dispatchEvent(eventRow);
      if (sent) {
        await markSent(eventRow.id);
        await setBranchCursor(eventRow.branch_id, eventRow.id).catch(() => null);
        branchCursorCache.set(eventRow.branch_id, eventRow.id);
        sentCount += 1;
      }
    } catch (err) {
      await markFailed(eventRow.id, err.message || 'Dispatch failed');
    }
  }

  if (sentCount > 0) {
    logger.info(`Sync worker dispatched ${sentCount} event(s)`);
  }
}

async function runSyncCycle() {
  if (!isEnabled()) return;

  await runOutboundCycle();
  await runInboundCycle();
}

function startSyncWorker() {
  if (!isEnabled()) {
    logger.info('Sync worker disabled for current runtime/provider mode.');
    return;
  }

  if (timer) return;

  const intervalMs = parseInt(process.env.SYNC_WORKER_INTERVAL_MS || '10000', 10);
  timer = setInterval(() => {
    runSyncCycle().catch((err) => {
      logger.error('Sync worker cycle failed:', err.message);
    });
  }, intervalMs);

  logger.info(`Sync worker started (interval=${intervalMs}ms)`);
}

function stopSyncWorker() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

module.exports = {
  startSyncWorker,
  stopSyncWorker,
  runSyncCycle,
};
