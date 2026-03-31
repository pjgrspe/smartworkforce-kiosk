-- Per-holiday configurable pay multiplier.
-- NULL = use the tenant's default rate from overtime_multipliers config.
-- e.g. 1.30 means 130% pay (30% extra) for working on that day.
ALTER TABLE holidays
  ADD COLUMN IF NOT EXISTS pay_multiplier NUMERIC(5,4);
