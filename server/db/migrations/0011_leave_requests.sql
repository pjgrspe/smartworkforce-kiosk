-- Migration 0011: Leave requests + paid day-off tracking
-- Adds source/is_paid to employee_day_offs (tracks whether a day-off is a manual override
-- or an approved leave, and whether basic pay should be retained).
-- Creates leave_requests table for SL/VL request-and-approval workflow.

ALTER TABLE employee_day_offs
  ADD COLUMN IF NOT EXISTS source  TEXT    NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS is_paid BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS leave_requests (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID        NOT NULL REFERENCES tenants(id)   ON DELETE CASCADE,
  employee_id  UUID        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  requested_by UUID        REFERENCES users(id)              ON DELETE SET NULL,
  leave_type   TEXT        NOT NULL
                           CHECK (leave_type IN ('sick_leave', 'vacation_leave')),
  start_date   DATE        NOT NULL,
  end_date     DATE        NOT NULL,
  notes        TEXT,
  status       TEXT        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by  UUID        REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at  TIMESTAMPTZ,
  review_notes TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leave_requests_tenant_status
  ON leave_requests (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_leave_requests_employee
  ON leave_requests (employee_id);
