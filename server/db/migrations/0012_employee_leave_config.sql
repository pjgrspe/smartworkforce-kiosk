-- Migration 0012: Per-employee leave configuration
-- Stores whether the employee has leave access, which types are enabled,
-- and optional per-employee quota overrides (null = use tenant default).
-- Structure: { leaveType, hasSl, hasVl, slQuota, vlQuota }

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS leave_config JSONB NOT NULL DEFAULT '{}';
