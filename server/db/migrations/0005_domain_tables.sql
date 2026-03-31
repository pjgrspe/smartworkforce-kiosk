-- Remaining PostgreSQL domain tables for tenant config, holidays, salary, corrections, and payroll.
-- Date: 2026-03-16

CREATE TABLE IF NOT EXISTS holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  date DATE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('regular', 'special_non_working')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS salary_structures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  salary_type TEXT NOT NULL DEFAULT 'monthly' CHECK (salary_type IN ('monthly', 'daily', 'hourly')),
  basic_rate NUMERIC(12, 2) NOT NULL,
  payment_frequency TEXT NOT NULL DEFAULT 'semi_monthly' CHECK (payment_frequency IN ('weekly', 'semi_monthly', 'monthly')),
  allowances JSONB NOT NULL DEFAULT '[]'::jsonb,
  additional_deductions JSONB NOT NULL DEFAULT '[]'::jsonb,
  leave_credits JSONB NOT NULL DEFAULT '{"vacationLeave":15,"sickLeave":15}'::jsonb,
  overtime_eligible BOOLEAN NOT NULL DEFAULT TRUE,
  night_diff_eligible BOOLEAN NOT NULL DEFAULT TRUE,
  effective_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS attendance_correction_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  target_date DATE NOT NULL,
  reason_code TEXT NOT NULL CHECK (reason_code IN ('forgot_to_log', 'device_down', 'field_work', 'system_error', 'other')),
  notes TEXT,
  before_state JSONB,
  after_state JSONB,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payroll_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  cutoff_start TIMESTAMPTZ NOT NULL,
  cutoff_end TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'approved', 'finalized')),
  payslip_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_gross NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_deductions NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_net NUMERIC(14, 2) NOT NULL DEFAULT 0,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  finalized_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_holidays_tenant_date ON holidays(tenant_id, date);
CREATE INDEX IF NOT EXISTS idx_salary_structures_employee_active ON salary_structures(employee_id, is_active);
CREATE INDEX IF NOT EXISTS idx_salary_structures_tenant_employee ON salary_structures(tenant_id, employee_id, effective_date DESC);
CREATE INDEX IF NOT EXISTS idx_correction_requests_tenant_employee_status ON attendance_correction_requests(tenant_id, employee_id, status);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_tenant_cutoff ON payroll_runs(tenant_id, cutoff_start DESC, cutoff_end DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_runs_cutoff
  ON payroll_runs(tenant_id, COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), cutoff_start, cutoff_end);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_holidays_updated_at') THEN
    CREATE TRIGGER trg_holidays_updated_at BEFORE UPDATE ON holidays
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_salary_structures_updated_at') THEN
    CREATE TRIGGER trg_salary_structures_updated_at BEFORE UPDATE ON salary_structures
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_attendance_correction_requests_updated_at') THEN
    CREATE TRIGGER trg_attendance_correction_requests_updated_at BEFORE UPDATE ON attendance_correction_requests
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_payroll_runs_updated_at') THEN
    CREATE TRIGGER trg_payroll_runs_updated_at BEFORE UPDATE ON payroll_runs
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;