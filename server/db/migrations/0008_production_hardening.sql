-- Production hardening migration.
-- Fixes dangerous CASCADE rules, adds missing indexes, check constraints,
-- unique constraints, and the audit_log table.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. FIX DANGEROUS CASCADE RULES
-- salary_structures and attendance_correction_requests used ON DELETE CASCADE,
-- meaning deleting an employee would silently erase payroll and correction
-- history — an audit/compliance disaster.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE salary_structures
  DROP CONSTRAINT IF EXISTS salary_structures_employee_id_fkey,
  ADD CONSTRAINT salary_structures_employee_id_fkey
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT;

ALTER TABLE attendance_correction_requests
  DROP CONSTRAINT IF EXISTS attendance_correction_requests_employee_id_fkey,
  ADD CONSTRAINT attendance_correction_requests_employee_id_fkey
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT;

-- payroll_runs: losing branch_id silently is risky; restrict deletion instead
ALTER TABLE payroll_runs
  DROP CONSTRAINT IF EXISTS payroll_runs_branch_id_fkey,
  ADD CONSTRAINT payroll_runs_branch_id_fkey
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. MISSING INDEXES ON FOREIGN KEY COLUMNS
-- PostgreSQL does not auto-create indexes on FK columns.  Missing indexes on
-- FK columns cause sequential scans on every join / cascade check.
-- ─────────────────────────────────────────────────────────────────────────────

-- employees
CREATE INDEX IF NOT EXISTS idx_employees_reports_to
  ON employees(reports_to) WHERE reports_to IS NOT NULL;

-- users
CREATE INDEX IF NOT EXISTS idx_users_employee_id
  ON users(employee_id) WHERE employee_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_branch_id
  ON users(branch_id) WHERE branch_id IS NOT NULL;

-- departments
CREATE INDEX IF NOT EXISTS idx_departments_branch_id
  ON departments(branch_id) WHERE branch_id IS NOT NULL;

-- attendance_logs
CREATE INDEX IF NOT EXISTS idx_attendance_employee_ts
  ON attendance_logs(employee_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_attendance_correction_ref
  ON attendance_logs(correction_ref) WHERE correction_ref IS NOT NULL;

-- salary_structures
CREATE INDEX IF NOT EXISTS idx_salary_structures_tenant_effective
  ON salary_structures(tenant_id, effective_date DESC);

-- payroll_runs
CREATE INDEX IF NOT EXISTS idx_payroll_runs_tenant_status
  ON payroll_runs(tenant_id, status);

-- sync tables
CREATE INDEX IF NOT EXISTS idx_sync_events_seq
  ON sync_events(seq DESC);

CREATE INDEX IF NOT EXISTS idx_sync_checkpoints_branch
  ON sync_checkpoints(branch_id);

CREATE INDEX IF NOT EXISTS idx_sync_dead_letter_branch_seq
  ON sync_dead_letter(branch_id, event_seq DESC);

CREATE INDEX IF NOT EXISTS idx_sync_inbound_failures_branch_seq
  ON sync_inbound_failures(branch_id, event_seq);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. CHECK CONSTRAINTS
-- ─────────────────────────────────────────────────────────────────────────────

-- Confidence score must be in [0, 1]
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_confidence_score_range'
  ) THEN
    ALTER TABLE attendance_logs
      ADD CONSTRAINT chk_confidence_score_range
      CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1));
  END IF;
END $$;

-- Payroll totals must be non-negative
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_payroll_totals_non_negative'
  ) THEN
    ALTER TABLE payroll_runs
      ADD CONSTRAINT chk_payroll_totals_non_negative
      CHECK (total_gross >= 0 AND total_deductions >= 0 AND total_net >= 0);
  END IF;
END $$;

-- Salary basic_rate must be non-negative
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_basic_rate_non_negative'
  ) THEN
    ALTER TABLE salary_structures
      ADD CONSTRAINT chk_basic_rate_non_negative
      CHECK (basic_rate >= 0);
  END IF;
END $$;

-- Schedule durations must be non-negative
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_schedule_durations_non_negative'
  ) THEN
    ALTER TABLE schedules
      ADD CONSTRAINT chk_schedule_durations_non_negative
      CHECK (
        break_duration_minutes  >= 0 AND
        grace_period_minutes    >= 0 AND
        undertime_policy_minutes >= 0 AND
        rounding_rule_minutes   >= 0
      );
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. UNIQUE CONSTRAINTS
-- ─────────────────────────────────────────────────────────────────────────────

-- Only one active salary record per employee per effective_date
CREATE UNIQUE INDEX IF NOT EXISTS uq_salary_structures_employee_effective_active
  ON salary_structures(employee_id, effective_date)
  WHERE is_active = TRUE;

-- Only one pending correction per employee per target_date
CREATE UNIQUE INDEX IF NOT EXISTS uq_correction_requests_employee_date_pending
  ON attendance_correction_requests(employee_id, target_date)
  WHERE status = 'pending';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. FULL-TEXT SEARCH INDEX ON EMPLOYEES
-- Enables fast ILIKE / text search on name and code without full-table scan.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_employees_fulltext
  ON employees USING GIN (
    to_tsvector('simple',
      COALESCE(first_name, '') || ' ' ||
      COALESCE(last_name,  '') || ' ' ||
      COALESCE(employee_code, '')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. AUDIT LOG TABLE
-- Tracks who changed what and when for sensitive tables.
-- The application layer writes rows here on INSERT/UPDATE/DELETE of key tables.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_log (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name   TEXT        NOT NULL,
  record_id    TEXT        NOT NULL,
  operation    TEXT        NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  changed_by   UUID        REFERENCES users(id) ON DELETE SET NULL,
  changed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  before_data  JSONB,
  after_data   JSONB,
  ip_address   TEXT,
  notes        TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_log_table_record
  ON audit_log(table_name, record_id);

CREATE INDEX IF NOT EXISTS idx_audit_log_changed_by
  ON audit_log(changed_by) WHERE changed_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_log_changed_at
  ON audit_log(changed_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. SCHEMA VERSION TRACKING
-- Simple table so we know which migrations have run.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS schema_versions (
  version     INTEGER     PRIMARY KEY,
  name        TEXT        NOT NULL,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO schema_versions (version, name) VALUES
  (1, '0001_core_postgres'),
  (2, '0002_sync_checkpoints'),
  (3, '0003_sync_events'),
  (4, '0004_sync_failure_handling'),
  (5, '0005_domain_tables'),
  (6, '0006_employee_documents'),
  (7, '0007_reports_to'),
  (8, '0008_production_hardening')
ON CONFLICT (version) DO NOTHING;
