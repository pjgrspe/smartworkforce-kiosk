-- Migration 0010: Per-employee day-off overrides
-- Allows HR to assign specific dated day-offs per employee,
-- independent of their assigned schedule's rest days.
-- Types:
--   full_day      → treated as a rest day for that date
--   half_day_am   → morning off; late measured from shift midpoint
--   half_day_pm   → afternoon off; undertime measured to shift midpoint
--   custom        → off during [start_time, end_time]; adjusts late/undertime accordingly

CREATE TABLE IF NOT EXISTS employee_day_offs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id)   ON DELETE CASCADE,
  employee_id UUID        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date        DATE        NOT NULL,
  type        TEXT        NOT NULL DEFAULT 'full_day'
                          CHECK (type IN ('full_day', 'half_day_am', 'half_day_pm', 'custom')),
  start_time  TEXT,       -- HH:MM — off-period start (used by 'custom')
  end_time    TEXT,       -- HH:MM — off-period end   (used by 'custom')
  reason      TEXT,
  created_by  UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, date)
);

CREATE INDEX IF NOT EXISTS idx_employee_day_offs_emp_date
  ON employee_day_offs (employee_id, date);

CREATE INDEX IF NOT EXISTS idx_employee_day_offs_tenant_date
  ON employee_day_offs (tenant_id, date);
