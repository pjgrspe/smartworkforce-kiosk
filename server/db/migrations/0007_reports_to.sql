-- Add reports_to (direct supervisor) to employees.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS reports_to UUID REFERENCES employees(id) ON DELETE SET NULL;
