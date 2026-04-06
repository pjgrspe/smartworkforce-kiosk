-- Prevent duplicate holidays on the same date for the same tenant.
ALTER TABLE holidays
  DROP CONSTRAINT IF EXISTS uq_holidays_tenant_date;

ALTER TABLE holidays
  ADD CONSTRAINT uq_holidays_tenant_date UNIQUE (tenant_id, date);
