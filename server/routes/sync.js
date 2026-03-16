const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getRuntimeMode } = require('../config/runtime');
const { getPool } = require('../config/postgres');
const { applySyncEvent } = require('../services/sync-apply');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

function requireSyncSecret(req, res, next) {
  const expected = process.env.SYNC_SHARED_SECRET;
  if (!expected) return next();

  const provided = req.headers['x-sync-secret'];
  if (!provided || String(provided) !== String(expected)) {
    return res.status(401).json({ error: 'Invalid sync secret' });
  }

  return next();
}

// /sync/status is called from the admin dashboard via JWT — no sync secret needed.
// The sync event endpoints are called by branch sync daemons that send the shared secret.
const syncEventMiddleware = [requireSyncSecret];

router.post('/events', syncEventMiddleware, async (req, res) => {
  try {
    const idempotencyKey = String(req.headers['x-idempotency-key'] || req.body.idempotencyKey || uuidv4());
    const sourceBranchId = req.body.branchId || null;
    const targetBranchId = req.body.targetBranchId || null;

    const event = {
      eventType: req.body.eventType,
      entityType: req.body.entityType,
      entityId: req.body.entityId || null,
      payload: req.body.payload || {},
    };

    if (!event.eventType || !event.entityType) {
      return res.status(400).json({ error: 'eventType and entityType are required' });
    }

    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const insertResult = await client.query(
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
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (idempotency_key)
          DO NOTHING
          RETURNING seq
        `,
        [
          sourceBranchId,
          targetBranchId,
          idempotencyKey,
          event.eventType,
          event.entityType,
          event.entityId,
          event.payload,
        ],
      );

      if (insertResult.rowCount > 0 && getRuntimeMode() === 'CENTRAL') {
        await applySyncEvent(client, event);
      }

      await client.query('COMMIT');
      return res.status(201).json({ success: true, accepted: true });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/events/pull', syncEventMiddleware, async (req, res) => {
  try {
    const branchId = req.query.branchId ? String(req.query.branchId) : null;
    if (!branchId) return res.status(400).json({ error: 'branchId is required' });

    const after = parseInt(String(req.query.after || '0'), 10);
    const limit = Math.min(parseInt(String(req.query.limit || '100'), 10), 200);

    const pool = getPool();
    const { rows } = await pool.query(
      `
        SELECT seq, idempotency_key, source_branch_id, target_branch_id,
               event_type, entity_type, entity_id, payload, created_at
        FROM sync_events
        WHERE seq > $1
          AND (target_branch_id IS NULL OR target_branch_id = $2)
          AND (source_branch_id IS NULL OR source_branch_id <> $2)
        ORDER BY seq ASC
        LIMIT $3
      `,
      [after, branchId, limit],
    );

    return res.json({
      data: rows.map((row) => ({
        seq: row.seq,
        idempotencyKey: row.idempotency_key,
        sourceBranchId: row.source_branch_id,
        targetBranchId: row.target_branch_id,
        eventType: row.event_type,
        entityType: row.entity_type,
        entityId: row.entity_id,
        payload: row.payload,
        createdAt: row.created_at,
      })),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/status', authenticate, async (req, res) => {
  try {
    const branchId = req.query.branchId ? String(req.query.branchId) : null;
    const pool = getPool();

    const baseMetrics = await pool.query(
      `
        SELECT
          (SELECT COUNT(*) FROM sync_outbox WHERE sent_at IS NULL) AS outbox_pending,
          (SELECT COUNT(*) FROM sync_inbox) AS inbox_applied,
          (SELECT COUNT(*) FROM sync_inbound_failures) AS inbound_failures,
          (SELECT COUNT(*) FROM sync_dead_letter) AS dead_letter,
          (SELECT COALESCE(MAX(seq), 0) FROM sync_events) AS max_event_seq
      `,
    );

    let checkpoints = [];
    if (branchId) {
      const cp = await pool.query(
        `
          SELECT cursor_name, cursor_value, updated_at
          FROM sync_checkpoints
          WHERE branch_id = $1
          ORDER BY cursor_name ASC
        `,
        [branchId],
      );
      checkpoints = cp.rows;
    }

    return res.json({
      mode: getRuntimeMode(),
      provider: 'postgres',
      metrics: baseMetrics.rows[0],
      checkpoints,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
