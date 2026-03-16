-- Persistent inbound sync failure tracking and dead-letter storage.
-- Date: 2026-03-15

CREATE TABLE IF NOT EXISTS sync_inbound_failures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  event_seq BIGINT NOT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (branch_id, event_seq)
);

CREATE TABLE IF NOT EXISTS sync_dead_letter (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  event_seq BIGINT NOT NULL,
  idempotency_key TEXT,
  event_type TEXT,
  entity_type TEXT,
  payload JSONB NOT NULL,
  error_message TEXT,
  moved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (branch_id, event_seq)
);

CREATE INDEX IF NOT EXISTS idx_sync_inbound_failures_branch
  ON sync_inbound_failures(branch_id, event_seq);

CREATE INDEX IF NOT EXISTS idx_sync_dead_letter_branch
  ON sync_dead_letter(branch_id, event_seq);
