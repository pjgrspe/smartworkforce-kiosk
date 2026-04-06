const { getPool } = require('../../config/postgres');
const { enqueueOutboxEvent } = require('../../services/sync-outbox');

function mapRow(row) {
  return {
    _id: row.id,
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    code: row.code,
    type: row.type,
    shiftStart: row.shift_start,
    shiftEnd: row.shift_end,
    breakStart: row.break_start,
    breakEnd: row.break_end,
    breakDurationMinutes: row.break_duration_minutes,
    isPaidBreak: row.is_paid_break,
    gracePeriodMinutes: row.grace_period_minutes,
    undertimePolicyMinutes: row.undertime_policy_minutes,
    roundingRuleMinutes: row.rounding_rule_minutes,
    allowMultiplePunches: row.allow_multiple_punches,
    restDays: row.rest_days || [],
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listSchedules({ user }) {
  const pool = getPool();
  const { rows } = await pool.query(
    `
      SELECT *
      FROM schedules
      WHERE tenant_id = $1
        AND is_active = TRUE
      ORDER BY name ASC
    `,
    [user.tenantId]
  );
  return rows.map(mapRow);
}

async function createSchedule({ user, payload }) {
  const pool = getPool();
  const { rows } = await pool.query(
    `
      INSERT INTO schedules (
        tenant_id, name, code, type, shift_start, shift_end,
        break_start, break_end, break_duration_minutes, is_paid_break,
        grace_period_minutes, undertime_policy_minutes, rounding_rule_minutes,
        allow_multiple_punches, rest_days, is_active
      )
      VALUES (
        $1, $2, $3, COALESCE($4, 'fixed'), $5, $6,
        $7, $8, COALESCE($9, 60), COALESCE($10, FALSE),
        COALESCE($11, 5), COALESCE($12, 0), COALESCE($13, 0),
        COALESCE($14, FALSE), COALESCE($15, '[]'::jsonb), TRUE
      )
      RETURNING *
    `,
    [
      user.tenantId,
      payload.name,
      payload.code,
      payload.type || null,
      payload.shiftStart || null,
      payload.shiftEnd || null,
      payload.breakStart || null,
      payload.breakEnd || null,
      payload.breakDurationMinutes,
      payload.isPaidBreak,
      payload.gracePeriodMinutes,
      payload.undertimePolicyMinutes,
      payload.roundingRuleMinutes,
      payload.allowMultiplePunches,
      JSON.stringify(payload.restDays || []),
    ]
  );

  const created = mapRow(rows[0]);
  await enqueueOutboxEvent({
    branchId: user.branchId || null,
    eventType: 'schedule.created',
    entityType: 'schedule',
    entityId: created.id,
    payload: created,
  });
  return created;
}

async function updateSchedule({ user, id, patch }) {
  const pool = getPool();
  const existing = await pool.query(
    'SELECT * FROM schedules WHERE id = $1 AND tenant_id = $2 LIMIT 1',
    [id, user.tenantId]
  );
  if (!existing.rowCount) return null;

  const current = existing.rows[0];
  const next = {
    name: patch.name ?? current.name,
    code: patch.code ?? current.code,
    type: patch.type ?? current.type,
    shiftStart: Object.prototype.hasOwnProperty.call(patch, 'shiftStart') ? patch.shiftStart : current.shift_start,
    shiftEnd: Object.prototype.hasOwnProperty.call(patch, 'shiftEnd') ? patch.shiftEnd : current.shift_end,
    breakStart: Object.prototype.hasOwnProperty.call(patch, 'breakStart') ? patch.breakStart : current.break_start,
    breakEnd: Object.prototype.hasOwnProperty.call(patch, 'breakEnd') ? patch.breakEnd : current.break_end,
    breakDurationMinutes: Object.prototype.hasOwnProperty.call(patch, 'breakDurationMinutes') ? patch.breakDurationMinutes : current.break_duration_minutes,
    isPaidBreak: Object.prototype.hasOwnProperty.call(patch, 'isPaidBreak') ? Boolean(patch.isPaidBreak) : current.is_paid_break,
    gracePeriodMinutes: Object.prototype.hasOwnProperty.call(patch, 'gracePeriodMinutes') ? patch.gracePeriodMinutes : current.grace_period_minutes,
    undertimePolicyMinutes: Object.prototype.hasOwnProperty.call(patch, 'undertimePolicyMinutes') ? patch.undertimePolicyMinutes : current.undertime_policy_minutes,
    roundingRuleMinutes: Object.prototype.hasOwnProperty.call(patch, 'roundingRuleMinutes') ? patch.roundingRuleMinutes : current.rounding_rule_minutes,
    allowMultiplePunches: Object.prototype.hasOwnProperty.call(patch, 'allowMultiplePunches') ? Boolean(patch.allowMultiplePunches) : current.allow_multiple_punches,
    restDays: Object.prototype.hasOwnProperty.call(patch, 'restDays') ? patch.restDays : current.rest_days,
    isActive: Object.prototype.hasOwnProperty.call(patch, 'isActive') ? Boolean(patch.isActive) : current.is_active,
  };

  const { rows } = await pool.query(
    `
      UPDATE schedules
      SET name = $2,
          code = $3,
          type = $4,
          shift_start = $5,
          shift_end = $6,
          break_start = $7,
          break_end = $8,
          break_duration_minutes = $9,
          is_paid_break = $10,
          grace_period_minutes = $11,
          undertime_policy_minutes = $12,
          rounding_rule_minutes = $13,
          allow_multiple_punches = $14,
          rest_days = $15,
          is_active = $16,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [
      id,
      next.name,
      next.code,
      next.type,
      next.shiftStart,
      next.shiftEnd,
      next.breakStart,
      next.breakEnd,
      next.breakDurationMinutes,
      next.isPaidBreak,
      next.gracePeriodMinutes,
      next.undertimePolicyMinutes,
      next.roundingRuleMinutes,
      next.allowMultiplePunches,
      JSON.stringify(next.restDays || []),
      next.isActive,
    ]
  );

  const updated = mapRow(rows[0]);
  await enqueueOutboxEvent({
    branchId: user.branchId || null,
    eventType: 'schedule.updated',
    entityType: 'schedule',
    entityId: updated.id,
    payload: updated,
  });
  return updated;
}

async function softDeleteSchedule({ user, id }) {
  const pool = getPool();
  const { rows } = await pool.query(
    `
      UPDATE schedules
      SET is_active = FALSE,
          updated_at = NOW()
      WHERE id = $1
        AND tenant_id = $2
      RETURNING *
    `,
    [id, user.tenantId]
  );

  if (!rows.length) return false;
  const deleted = mapRow(rows[0]);
  await enqueueOutboxEvent({
    branchId: user.branchId || null,
    eventType: 'schedule.deactivated',
    entityType: 'schedule',
    entityId: deleted.id,
    payload: { id: deleted.id, deactivatedAt: new Date().toISOString() },
  });
  return true;
}

module.exports = {
  listSchedules,
  createSchedule,
  updateSchedule,
  softDeleteSchedule,
};
