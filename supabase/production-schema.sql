-- =====================================================
-- AlokickFlow Production Database Schema
-- Version: 1.0.0
-- Last Updated: 2024
-- =====================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- CORE TABLES
-- =====================================================

-- Organizations (Tenants)
CREATE TABLE IF NOT EXISTS organizations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE,
    settings JSONB DEFAULT '{}',
    subscription_tier VARCHAR(50) DEFAULT 'free',
    subscription_status VARCHAR(50) DEFAULT 'active',
    stripe_customer_id VARCHAR(255),
    stripe_subscription_id VARCHAR(255),
    storage_limit_bytes BIGINT DEFAULT 10737418240, -- 10GB default
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User Profiles
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    role VARCHAR(50) DEFAULT 'member' CHECK (role IN ('admin', 'member', 'vendor', 'viewer')),
    full_name VARCHAR(255),
    email VARCHAR(255),
    avatar_url TEXT,
    settings JSONB DEFAULT '{}',
    google_tokens JSONB, -- Encrypted Google OAuth tokens
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Projects
CREATE TABLE IF NOT EXISTS projects (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
    naming_convention_regex TEXT DEFAULT '^([A-Z0-9_]+)[-_]?EP[_-]?(\d{1,4})[_-]?([A-Za-z]+)[-_]?(.+)$',
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, code)
);

-- Deliveries (File Uploads)
CREATE TABLE IF NOT EXISTS deliveries (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    vendor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    file_name VARCHAR(500) NOT NULL,
    original_file_name VARCHAR(500),
    storage_path TEXT NOT NULL,
    file_size BIGINT DEFAULT 0,
    file_type VARCHAR(50), -- 'video', 'audio', 'subtitle', 'other'
    mime_type VARCHAR(100),
    status VARCHAR(50) DEFAULT 'uploading' CHECK (status IN (
        'uploading', 'processing', 'qc_passed', 'qc_failed', 'needs_review', 'rejected', 'approved'
    )),
    qc_report JSONB DEFAULT '{}',
    qc_errors JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Drive Assignments (Google Drive Links to Vendors)
CREATE TABLE IF NOT EXISTS drive_assignments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    vendor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    assigned_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    
    -- Drive link info
    original_drive_link TEXT NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Client info (hidden from vendor)
    client_name VARCHAR(255),
    client_email VARCHAR(255),
    
    -- Status tracking
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN (
        'pending', 'in_progress', 'completed', 'cancelled', 'on_hold'
    )),
    due_date DATE,
    completed_at TIMESTAMPTZ,
    
    -- Metadata
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    data JSONB DEFAULT '{}',
    read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id UUID,
    details JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_profiles_organization_id ON profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_projects_organization_id ON projects(organization_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_deliveries_organization_id ON deliveries(organization_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_project_id ON deliveries(project_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_vendor_id ON deliveries(vendor_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(status);
CREATE INDEX IF NOT EXISTS idx_deliveries_created_at ON deliveries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_drive_assignments_organization_id ON drive_assignments(organization_id);
CREATE INDEX IF NOT EXISTS idx_drive_assignments_vendor_id ON drive_assignments(vendor_id);
CREATE INDEX IF NOT EXISTS idx_drive_assignments_status ON drive_assignments(status);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_organization_id ON audit_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Get user's organization ID (for RLS)
CREATE OR REPLACE FUNCTION get_user_organization_id()
RETURNS UUID AS $$
DECLARE
    org_id UUID;
BEGIN
    SELECT organization_id INTO org_id
    FROM profiles
    WHERE id = auth.uid();
    RETURN org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Updated_at triggers
DROP TRIGGER IF EXISTS trigger_organizations_updated_at ON organizations;
CREATE TRIGGER trigger_organizations_updated_at
    BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_profiles_updated_at ON profiles;
CREATE TRIGGER trigger_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_projects_updated_at ON projects;
CREATE TRIGGER trigger_projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_deliveries_updated_at ON deliveries;
CREATE TRIGGER trigger_deliveries_updated_at
    BEFORE UPDATE ON deliveries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_drive_assignments_updated_at ON drive_assignments;
CREATE TRIGGER trigger_drive_assignments_updated_at
    BEFORE UPDATE ON drive_assignments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE drive_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Organizations policies
DROP POLICY IF EXISTS "Users can view their organization" ON organizations;
CREATE POLICY "Users can view their organization" ON organizations
    FOR SELECT USING (id = get_user_organization_id());

DROP POLICY IF EXISTS "Admins can update their organization" ON organizations;
CREATE POLICY "Admins can update their organization" ON organizations
    FOR UPDATE USING (
        id = get_user_organization_id() AND
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- Profiles policies
DROP POLICY IF EXISTS "Users can view profiles in their organization" ON profiles;
CREATE POLICY "Users can view profiles in their organization" ON profiles
    FOR SELECT USING (
        organization_id = get_user_organization_id() OR
        id = auth.uid()
    );

DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
CREATE POLICY "Users can update their own profile" ON profiles
    FOR UPDATE USING (id = auth.uid());

DROP POLICY IF EXISTS "Service role can insert profiles" ON profiles;
CREATE POLICY "Service role can insert profiles" ON profiles
    FOR INSERT WITH CHECK (true);

-- Projects policies
DROP POLICY IF EXISTS "Users can view projects in their organization" ON projects;
CREATE POLICY "Users can view projects in their organization" ON projects
    FOR SELECT USING (organization_id = get_user_organization_id());

DROP POLICY IF EXISTS "Users can insert projects in their organization" ON projects;
CREATE POLICY "Users can insert projects in their organization" ON projects
    FOR INSERT WITH CHECK (organization_id = get_user_organization_id());

DROP POLICY IF EXISTS "Admins can update projects" ON projects;
CREATE POLICY "Admins can update projects" ON projects
    FOR UPDATE USING (organization_id = get_user_organization_id());

DROP POLICY IF EXISTS "Admins can delete projects" ON projects;
CREATE POLICY "Admins can delete projects" ON projects
    FOR DELETE USING (
        organization_id = get_user_organization_id() AND
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- Deliveries policies
DROP POLICY IF EXISTS "Users can view deliveries in their organization" ON deliveries;
CREATE POLICY "Users can view deliveries in their organization" ON deliveries
    FOR SELECT USING (organization_id = get_user_organization_id());

DROP POLICY IF EXISTS "Users can insert deliveries" ON deliveries;
CREATE POLICY "Users can insert deliveries" ON deliveries
    FOR INSERT WITH CHECK (organization_id = get_user_organization_id());

DROP POLICY IF EXISTS "Users can update deliveries in their organization" ON deliveries;
CREATE POLICY "Users can update deliveries in their organization" ON deliveries
    FOR UPDATE USING (organization_id = get_user_organization_id());

-- Drive assignments policies
DROP POLICY IF EXISTS "Users can view assignments in their organization" ON drive_assignments;
CREATE POLICY "Users can view assignments in their organization" ON drive_assignments
    FOR SELECT USING (
        organization_id = get_user_organization_id() OR
        vendor_id = auth.uid()
    );

DROP POLICY IF EXISTS "Admins can manage assignments" ON drive_assignments;
CREATE POLICY "Admins can manage assignments" ON drive_assignments
    FOR ALL USING (organization_id = get_user_organization_id());

-- Notifications policies
DROP POLICY IF EXISTS "Users can view their notifications" ON notifications;
CREATE POLICY "Users can view their notifications" ON notifications
    FOR SELECT USING (user_id = auth.uid() OR organization_id = get_user_organization_id());

DROP POLICY IF EXISTS "System can insert notifications" ON notifications;
CREATE POLICY "System can insert notifications" ON notifications
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update their notifications" ON notifications;
CREATE POLICY "Users can update their notifications" ON notifications
    FOR UPDATE USING (user_id = auth.uid());

-- Audit logs policies
DROP POLICY IF EXISTS "Admins can view audit logs" ON audit_logs;
CREATE POLICY "Admins can view audit logs" ON audit_logs
    FOR SELECT USING (
        organization_id = get_user_organization_id() AND
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

DROP POLICY IF EXISTS "System can insert audit logs" ON audit_logs;
CREATE POLICY "System can insert audit logs" ON audit_logs
    FOR INSERT WITH CHECK (true);

-- =====================================================
-- REALTIME SUBSCRIPTIONS
-- =====================================================

-- Enable realtime for key tables
BEGIN;
  DROP PUBLICATION IF EXISTS supabase_realtime;
  CREATE PUBLICATION supabase_realtime;
COMMIT;

ALTER PUBLICATION supabase_realtime ADD TABLE deliveries;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE drive_assignments;

-- =====================================================
-- STORAGE BUCKETS
-- =====================================================

-- Create storage bucket for deliveries if not exists
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'deliveries',
    'deliveries',
    false,
    5368709120, -- 5GB max file size
    ARRAY['video/*', 'audio/*', 'text/*', 'application/x-subrip', 'application/octet-stream']
)
ON CONFLICT (id) DO UPDATE SET
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage policies
DROP POLICY IF EXISTS "Users can upload to their organization folder" ON storage.objects;
CREATE POLICY "Users can upload to their organization folder" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'deliveries' AND
        (storage.foldername(name))[1] = get_user_organization_id()::text
    );

DROP POLICY IF EXISTS "Users can view files in their organization" ON storage.objects;
CREATE POLICY "Users can view files in their organization" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'deliveries' AND
        (storage.foldername(name))[1] = get_user_organization_id()::text
    );

DROP POLICY IF EXISTS "Users can delete files in their organization" ON storage.objects;
CREATE POLICY "Users can delete files in their organization" ON storage.objects
    FOR DELETE USING (
        bucket_id = 'deliveries' AND
        (storage.foldername(name))[1] = get_user_organization_id()::text
    );

-- =====================================================
-- NOTIFICATION TRIGGERS
-- =====================================================

-- Notify on QC completion
CREATE OR REPLACE FUNCTION notify_qc_completion()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status IN ('qc_passed', 'qc_failed') AND 
       (OLD.status IS NULL OR OLD.status NOT IN ('qc_passed', 'qc_failed')) THEN
        INSERT INTO notifications (type, title, message, data, user_id, organization_id)
        VALUES (
            CASE WHEN NEW.status = 'qc_passed' THEN 'qc_complete' ELSE 'qc_failed' END,
            CASE WHEN NEW.status = 'qc_passed' THEN 'QC Passed' ELSE 'QC Failed' END,
            NEW.file_name || ' has ' || CASE WHEN NEW.status = 'qc_passed' THEN 'passed' ELSE 'failed' END || ' QC',
            jsonb_build_object('deliveryId', NEW.id),
            NEW.vendor_id,
            NEW.organization_id
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_qc_notification ON deliveries;
CREATE TRIGGER trigger_qc_notification
    AFTER UPDATE OF status ON deliveries
    FOR EACH ROW
    EXECUTE FUNCTION notify_qc_completion();

-- Notify on new assignment
CREATE OR REPLACE FUNCTION notify_new_assignment()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO notifications (type, title, message, data, user_id, organization_id)
    VALUES (
        'assignment_new',
        'New Work Assignment',
        'You have been assigned: ' || NEW.display_name,
        jsonb_build_object('assignmentId', NEW.id),
        NEW.vendor_id,
        NEW.organization_id
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_assignment_notification ON drive_assignments;
CREATE TRIGGER trigger_assignment_notification
    AFTER INSERT ON drive_assignments
    FOR EACH ROW
    EXECUTE FUNCTION notify_new_assignment();

-- =====================================================
-- MAINTENANCE FUNCTIONS
-- =====================================================

-- Clean old notifications
CREATE OR REPLACE FUNCTION clean_old_notifications()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM notifications
    WHERE created_at < NOW() - INTERVAL '30 days'
    AND read = true;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Clean old audit logs
CREATE OR REPLACE FUNCTION clean_old_audit_logs()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM audit_logs
    WHERE created_at < NOW() - INTERVAL '90 days';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get organization storage usage
CREATE OR REPLACE FUNCTION get_organization_storage_usage(org_id UUID)
RETURNS BIGINT AS $$
BEGIN
    RETURN COALESCE(
        (SELECT SUM(file_size) FROM deliveries WHERE organization_id = org_id),
        0
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- =====================================================
-- INITIAL DATA (Optional)
-- =====================================================

-- You can add initial seed data here if needed
-- Example: default subscription tiers, etc.

