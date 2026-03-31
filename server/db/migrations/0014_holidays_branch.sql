-- Make holidays branch-specific (nullable branch_id)
-- NULL branch_id = company-wide (applies to all branches)
-- Non-null = specific to that branch only

ALTER TABLE holidays
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE CASCADE;

-- Drop the old tenant+date unique constraint
ALTER TABLE holidays
  DROP CONSTRAINT IF EXISTS uq_holidays_tenant_date;

-- New unique constraint: same date can exist per branch (or one company-wide per date)
-- Uses COALESCE so NULL branch_id is treated as a sentinel UUID for uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS uq_holidays_tenant_branch_date
  ON holidays (tenant_id, COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), date);

-- Update index to include branch_id
DROP INDEX IF EXISTS idx_holidays_tenant_date;
CREATE INDEX IF NOT EXISTS idx_holidays_tenant_branch_date
  ON holidays (tenant_id, branch_id, date);
