-- Sync event feed for central-to-branch distribution.
-- Date: 2026-03-15

CREATE TABLE IF NOT EXISTS sync_events (
  seq BIGSERIAL PRIMARY KEY,
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  source_branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  target_branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_events_pull
  ON sync_events(seq, target_branch_id, source_branch_id);
