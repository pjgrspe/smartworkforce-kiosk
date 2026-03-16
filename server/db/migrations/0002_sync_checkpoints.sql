-- Add sync checkpoints to support resumable branch sync cycles.
-- Date: 2026-03-15

CREATE TABLE IF NOT EXISTS sync_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  cursor_name TEXT NOT NULL,
  cursor_value TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (branch_id, cursor_name)
);

CREATE INDEX IF NOT EXISTS idx_sync_checkpoints_branch_cursor
  ON sync_checkpoints(branch_id, cursor_name);
