-- Migration 0013: Migrate legacy 'regular' employment type
-- Maps old 'regular' to 'regular_without_leaves' if leave_config marks no leave access,
-- otherwise maps to 'regular_with_leaves'.

UPDATE employees
SET employment = jsonb_set(
  employment,
  '{type}',
  CASE
    WHEN leave_config->>'leaveType' = 'without_leaves' THEN '"regular_without_leaves"'
    ELSE '"regular_with_leaves"'
  END::jsonb
)
WHERE employment->>'type' = 'regular';
