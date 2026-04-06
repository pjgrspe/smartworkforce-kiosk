-- Apollo core PostgreSQL schema for central + branch runtime.
-- Date: 2026-03-15

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  domain TEXT,
  logo_url TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  address TEXT,
  subscription JSONB NOT NULL DEFAULT '{}'::jsonb,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  timezone TEXT NOT NULL DEFAULT 'Asia/Manila',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  code TEXT,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'fixed' CHECK (type IN ('fixed', 'shifting', 'flexible')),
  shift_start TEXT,
  shift_end TEXT,
  break_start TEXT,
  break_end TEXT,
  break_duration_minutes INTEGER NOT NULL DEFAULT 60,
  is_paid_break BOOLEAN NOT NULL DEFAULT FALSE,
  grace_period_minutes INTEGER NOT NULL DEFAULT 5,
  undertime_policy_minutes INTEGER NOT NULL DEFAULT 0,
  rounding_rule_minutes INTEGER NOT NULL DEFAULT 0,
  allow_multiple_punches BOOLEAN NOT NULL DEFAULT FALSE,
  rest_days JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  employee_code TEXT NOT NULL,
  first_name TEXT NOT NULL,
  middle_name TEXT,
  last_name TEXT NOT NULL,
  photo_url TEXT,
  date_of_birth DATE,
  gender TEXT,
  contact_number TEXT,
  email TEXT,
  address TEXT,
  employment JSONB NOT NULL DEFAULT '{}'::jsonb,
  gov_ids JSONB NOT NULL DEFAULT '{}'::jsonb,
  bank JSONB NOT NULL DEFAULT '{}'::jsonb,
  tax_status TEXT,
  dependents INTEGER NOT NULL DEFAULT 0,
  face_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  schedule_id UUID REFERENCES schedules(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, employee_code)
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  profile_picture_url TEXT,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'client_admin', 'hr_payroll', 'branch_manager', 'employee', 'auditor')),
  employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  password_changed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS attendance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  type TEXT NOT NULL DEFAULT 'IN' CHECK (type IN ('IN', 'OUT', 'BREAK_IN', 'BREAK_OUT')),
  source TEXT NOT NULL DEFAULT 'face_kiosk' CHECK (source IN ('face_kiosk', 'web', 'admin_correction')),
  device_id TEXT,
  confidence_score NUMERIC(5, 4),
  exceptions JSONB NOT NULL DEFAULT '{}'::jsonb,
  synced BOOLEAN NOT NULL DEFAULT TRUE,
  synced_at TIMESTAMPTZ,
  local_id TEXT,
  correction_ref UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sync_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  idempotency_key TEXT NOT NULL UNIQUE,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);

CREATE TABLE IF NOT EXISTS sync_inbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  source_branch_id UUID,
  payload JSONB NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (branch_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_users_tenant_role ON users(tenant_id, role);
CREATE INDEX IF NOT EXISTS idx_employees_branch ON employees(branch_id);
CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_attendance_tenant_employee_ts ON attendance_logs(tenant_id, employee_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_branch_ts ON attendance_logs(branch_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_local_id ON attendance_logs(local_id);
CREATE INDEX IF NOT EXISTS idx_outbox_unsent ON sync_outbox(branch_id, created_at) WHERE sent_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_tenants_updated_at'
  ) THEN
    CREATE TRIGGER trg_tenants_updated_at BEFORE UPDATE ON tenants
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_branches_updated_at'
  ) THEN
    CREATE TRIGGER trg_branches_updated_at BEFORE UPDATE ON branches
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_departments_updated_at'
  ) THEN
    CREATE TRIGGER trg_departments_updated_at BEFORE UPDATE ON departments
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_schedules_updated_at'
  ) THEN
    CREATE TRIGGER trg_schedules_updated_at BEFORE UPDATE ON schedules
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_employees_updated_at'
  ) THEN
    CREATE TRIGGER trg_employees_updated_at BEFORE UPDATE ON employees
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_users_updated_at'
  ) THEN
    CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_attendance_logs_updated_at'
  ) THEN
    CREATE TRIGGER trg_attendance_logs_updated_at BEFORE UPDATE ON attendance_logs
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;
