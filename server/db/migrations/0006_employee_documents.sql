-- Add documents array to employees for storing gov ID and requirement attachments.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS documents JSONB NOT NULL DEFAULT '[]';
