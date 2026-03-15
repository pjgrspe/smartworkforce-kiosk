-- ============================================
-- DE WEBNET FACIAL RECOGNITION ATTENDANCE SYSTEM
-- Database Schema with Row Level Security
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- EMPLOYEES TABLE
-- Stores employee information and face encodings
-- ============================================
CREATE TABLE employees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    employee_code VARCHAR(50) UNIQUE,
    department VARCHAR(100),
    position VARCHAR(100),

    -- Face recognition data
    -- JSONB format: { "encodings": [[128 floats], [128 floats], ...] }
    face_encodings JSONB NOT NULL,

    -- Array of photo URLs in Supabase Storage
    photo_paths TEXT[],

    -- Metadata
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),

    -- Constraints
    CONSTRAINT valid_email CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT min_encodings CHECK (jsonb_array_length(face_encodings->'encodings') >= 3),
    CONSTRAINT max_encodings CHECK (jsonb_array_length(face_encodings->'encodings') <= 5)
);

-- Indexes for performance
CREATE INDEX idx_employees_email ON employees(email);
CREATE INDEX idx_employees_code ON employees(employee_code);
CREATE INDEX idx_employees_active ON employees(is_active) WHERE is_active = true;
CREATE INDEX idx_employees_created_at ON employees(created_at DESC);

-- Add comment for documentation
COMMENT ON TABLE employees IS 'Stores employee information with face encodings for recognition';
COMMENT ON COLUMN employees.face_encodings IS 'JSONB array of 3-5 face encodings (128-dimensional vectors)';

-- ============================================
-- ATTENDANCE LOGS TABLE
-- Stores all attendance check-in events
-- ============================================
CREATE TABLE attendance_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,

    -- Attendance data
    timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    confidence_score NUMERIC(5, 4) NOT NULL,  -- 0.0000 to 1.0000

    -- Sync tracking for offline-first functionality
    synced BOOLEAN DEFAULT false,
    synced_at TIMESTAMPTZ,
    local_id VARCHAR(100),  -- NeDB _id for conflict resolution

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT valid_confidence CHECK (confidence_score >= 0.0 AND confidence_score <= 1.0),
    CONSTRAINT valid_sync_timestamp CHECK (synced = false OR synced_at IS NOT NULL)
);

-- Indexes for performance
CREATE INDEX idx_attendance_employee ON attendance_logs(employee_id);
CREATE INDEX idx_attendance_timestamp ON attendance_logs(timestamp DESC);
CREATE INDEX idx_attendance_synced ON attendance_logs(synced) WHERE synced = false;
CREATE INDEX idx_attendance_local_id ON attendance_logs(local_id) WHERE local_id IS NOT NULL;
CREATE INDEX idx_attendance_employee_timestamp ON attendance_logs(employee_id, timestamp DESC);

-- Add comments
COMMENT ON TABLE attendance_logs IS 'Records all attendance check-in events with confidence scores';
COMMENT ON COLUMN attendance_logs.local_id IS 'NeDB local ID for duplicate detection during sync';

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS on all tables
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_logs ENABLE ROW LEVEL SECURITY;

-- ============================================
-- EMPLOYEES TABLE POLICIES
-- ============================================

-- Admin users can view all employees
CREATE POLICY "admins_select_employees" ON employees
    FOR SELECT
    TO authenticated
    USING (
        (auth.jwt() ->> 'role') = 'admin'
    );

-- Kiosk users can view active employees (for face matching)
CREATE POLICY "kiosk_select_active_employees" ON employees
    FOR SELECT
    TO authenticated
    USING (
        is_active = true AND
        ((auth.jwt() ->> 'role') IS NULL OR (auth.jwt() ->> 'role') != 'admin')
    );

-- Admin users can insert employees
CREATE POLICY "admins_insert_employees" ON employees
    FOR INSERT
    TO authenticated
    WITH CHECK ((auth.jwt() ->> 'role') = 'admin');

-- Admin users can update employees
CREATE POLICY "admins_update_employees" ON employees
    FOR UPDATE
    TO authenticated
    USING ((auth.jwt() ->> 'role') = 'admin')
    WITH CHECK ((auth.jwt() ->> 'role') = 'admin');

-- Admin users can delete employees
CREATE POLICY "admins_delete_employees" ON employees
    FOR DELETE
    TO authenticated
    USING ((auth.jwt() ->> 'role') = 'admin');

-- ============================================
-- ATTENDANCE LOGS TABLE POLICIES
-- ============================================

-- Admins can view all attendance logs
CREATE POLICY "admins_select_attendance" ON attendance_logs
    FOR SELECT
    TO authenticated
    USING ((auth.jwt() ->> 'role') = 'admin');

-- Kiosk users can view attendance logs (for display purposes)
CREATE POLICY "kiosk_select_recent_attendance" ON attendance_logs
    FOR SELECT
    TO authenticated
    USING (
        timestamp > NOW() - INTERVAL '24 hours' AND
        ((auth.jwt() ->> 'role') IS NULL OR (auth.jwt() ->> 'role') != 'admin')
    );

-- Any authenticated user can insert attendance logs (kiosk mode)
CREATE POLICY "authenticated_insert_attendance" ON attendance_logs
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Only admins can update attendance logs (for sync operations)
CREATE POLICY "admins_update_attendance" ON attendance_logs
    FOR UPDATE
    TO authenticated
    USING ((auth.jwt() ->> 'role') = 'admin')
    WITH CHECK ((auth.jwt() ->> 'role') = 'admin');

-- Only admins can delete attendance logs
CREATE POLICY "admins_delete_attendance" ON attendance_logs
    FOR DELETE
    TO authenticated
    USING ((auth.jwt() ->> 'role') = 'admin');

-- ============================================
-- FUNCTIONS AND TRIGGERS
-- ============================================

-- Function to update updated_at timestamp automatically
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for employees table
CREATE TRIGGER update_employees_updated_at
    BEFORE UPDATE ON employees
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to prevent duplicate attendance within cooldown period (5 minutes)
CREATE OR REPLACE FUNCTION prevent_duplicate_attendance()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM attendance_logs
        WHERE employee_id = NEW.employee_id
        AND timestamp > NOW() - INTERVAL '5 minutes'
        AND id != COALESCE(NEW.id, uuid_generate_v4())
    ) THEN
        RAISE EXCEPTION 'Duplicate attendance log within 5 minutes for employee %', NEW.employee_id
            USING HINT = 'Please wait before checking in again',
                  ERRCODE = 'unique_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for attendance_logs table
CREATE TRIGGER check_duplicate_attendance
    BEFORE INSERT ON attendance_logs
    FOR EACH ROW
    EXECUTE FUNCTION prevent_duplicate_attendance();

-- ============================================
-- STORAGE BUCKET FOR EMPLOYEE PHOTOS
-- ============================================

-- Create storage bucket for employee photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('employee-photos', 'employee-photos', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for employee photos

-- Admins can upload photos
CREATE POLICY "admins_upload_photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'employee-photos' AND
    (auth.jwt() ->> 'role') = 'admin'
);

-- Authenticated users can view photos
CREATE POLICY "authenticated_view_photos"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'employee-photos');

-- Admins can update photos
CREATE POLICY "admins_update_photos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'employee-photos' AND
    (auth.jwt() ->> 'role') = 'admin'
);

-- Admins can delete photos
CREATE POLICY "admins_delete_photos"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'employee-photos' AND
    (auth.jwt() ->> 'role') = 'admin'
);

-- ============================================
-- HELPFUL VIEWS FOR REPORTING
-- ============================================

-- View for today's attendance summary
CREATE OR REPLACE VIEW today_attendance_summary AS
SELECT
    e.id,
    e.name,
    e.email,
    e.department,
    al.timestamp as check_in_time,
    al.confidence_score,
    DATE(al.timestamp) as date
FROM attendance_logs al
JOIN employees e ON al.employee_id = e.id
WHERE DATE(al.timestamp) = CURRENT_DATE
ORDER BY al.timestamp DESC;

-- View for attendance statistics
CREATE OR REPLACE VIEW attendance_statistics AS
SELECT
    e.id as employee_id,
    e.name,
    e.department,
    COUNT(al.id) as total_check_ins,
    MAX(al.timestamp) as last_check_in,
    AVG(al.confidence_score) as avg_confidence
FROM employees e
LEFT JOIN attendance_logs al ON e.id = al.employee_id
WHERE e.is_active = true
GROUP BY e.id, e.name, e.department;

-- ============================================
-- INITIAL SETUP NOTES
-- ============================================

-- After running this migration, you need to:
--
-- 1. Create your first admin user via Supabase Auth UI:
--    - Go to Authentication → Users → Add User
--    - Enter email and password
--
-- 2. Promote the user to admin role:
--    UPDATE auth.users
--    SET raw_app_meta_data = jsonb_set(
--        COALESCE(raw_app_meta_data, '{}'::jsonb),
--        '{role}',
--        '"admin"'
--    )
--    WHERE email = 'your-admin@example.com';
--
-- 3. Create a kiosk user (optional, for testing):
--    - Go to Authentication → Users → Add User
--    - This user will have no role, allowing kiosk-only access
--
-- 4. Grant RLS bypass for service role (already enabled by default)

-- ============================================
-- SUCCESS MESSAGE
-- ============================================

DO $$
BEGIN
    RAISE NOTICE '✅ DE WEBNET Facial Recognition System - Database schema created successfully!';
    RAISE NOTICE '📋 Next steps:';
    RAISE NOTICE '   1. Create your first admin user via Supabase Auth UI';
    RAISE NOTICE '   2. Run the UPDATE query above to promote them to admin';
    RAISE NOTICE '   3. Test RLS policies in the Table Editor';
    RAISE NOTICE '   4. Configure your application .env file with Supabase credentials';
END $$;
