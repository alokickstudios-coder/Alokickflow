-- ============================================
-- AlokickFlow Database Schema (FIXED)
-- Multi-Tenant SaaS for Media Supply Chain
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. ORGANIZATIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    subscription_tier TEXT NOT NULL DEFAULT 'free' CHECK (subscription_tier IN ('free', 'pro', 'enterprise')),
    stripe_customer_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- 2. PROFILES TABLE (extends auth.users)
-- ============================================
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('super_admin', 'admin', 'manager', 'operator', 'qc', 'vendor')),
    full_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- 3. PROJECTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'completed')),
    naming_convention_regex TEXT DEFAULT '^([A-Z0-9_]+)[-_]?EP[_-]?(\d{1,4})[_-]?([A-Za-z]+)[-_]?(.+)$',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, code)
);

-- ============================================
-- 4. DELIVERIES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS deliveries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    vendor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    file_name TEXT NOT NULL,
    original_file_name TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading', 'processing', 'qc_passed', 'qc_failed', 'rejected')),
    storage_path TEXT NOT NULL DEFAULT '',
    file_size BIGINT,
    file_type TEXT,
    duration_seconds NUMERIC,
    qc_report JSONB DEFAULT '{}'::jsonb,
    qc_errors JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- 5. AUDIT LOGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- INDEXES for Performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_profiles_organization_id ON profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_projects_organization_id ON projects(organization_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_deliveries_organization_id ON deliveries(organization_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_project_id ON deliveries(project_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_vendor_id ON deliveries(vendor_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(status);
CREATE INDEX IF NOT EXISTS idx_deliveries_created_at ON deliveries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_organization_id ON audit_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);

-- ============================================
-- HELPER FUNCTION: Get user's organization_id
-- This uses SECURITY DEFINER to bypass RLS
-- ============================================
CREATE OR REPLACE FUNCTION get_user_organization_id()
RETURNS UUID AS $$
DECLARE
    org_id UUID;
BEGIN
    SELECT organization_id INTO org_id
    FROM profiles 
    WHERE id = auth.uid()
    LIMIT 1;
    RETURN org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for clean setup)
DROP POLICY IF EXISTS "Users can view their own organization" ON organizations;
DROP POLICY IF EXISTS "Admins can update their organization" ON organizations;
DROP POLICY IF EXISTS "Anyone can create organization" ON organizations;
DROP POLICY IF EXISTS "Users can view profiles in their organization" ON profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can insert profiles" ON profiles;
DROP POLICY IF EXISTS "Anyone can create their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can view projects in their organization" ON projects;
DROP POLICY IF EXISTS "Admins can manage projects" ON projects;
DROP POLICY IF EXISTS "Users can insert projects" ON projects;
DROP POLICY IF EXISTS "Users can view deliveries in their organization" ON deliveries;
DROP POLICY IF EXISTS "Vendors can create deliveries" ON deliveries;
DROP POLICY IF EXISTS "Users can create deliveries" ON deliveries;
DROP POLICY IF EXISTS "Vendors can update their deliveries" ON deliveries;
DROP POLICY IF EXISTS "Admins and QC can update deliveries" ON deliveries;
DROP POLICY IF EXISTS "Users can update deliveries" ON deliveries;
DROP POLICY IF EXISTS "Users can view audit logs in their organization" ON audit_logs;
DROP POLICY IF EXISTS "Admins can insert audit logs" ON audit_logs;
DROP POLICY IF EXISTS "Users can insert audit logs" ON audit_logs;

-- ============================================
-- ORGANIZATIONS POLICIES
-- ============================================
-- Anyone authenticated can create an organization (for registration)
CREATE POLICY "Anyone can create organization"
    ON organizations FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Users can only see their own organization
CREATE POLICY "Users can view their own organization"
    ON organizations FOR SELECT
    TO authenticated
    USING (id = get_user_organization_id());

-- Admins can update their organization
CREATE POLICY "Admins can update their organization"
    ON organizations FOR UPDATE
    TO authenticated
    USING (id = get_user_organization_id());

-- ============================================
-- PROFILES POLICIES (FIXED - No recursion)
-- ============================================
-- Users can always view their own profile (no recursion)
CREATE POLICY "Users can view own profile"
    ON profiles FOR SELECT
    TO authenticated
    USING (id = auth.uid());

-- Users can view other profiles in their organization
CREATE POLICY "Users can view profiles in their organization"
    ON profiles FOR SELECT
    TO authenticated
    USING (organization_id = get_user_organization_id());

-- Users can create their own profile (for registration)
CREATE POLICY "Anyone can create their own profile"
    ON profiles FOR INSERT
    TO authenticated
    WITH CHECK (id = auth.uid());

-- Users can update their own profile
CREATE POLICY "Users can update their own profile"
    ON profiles FOR UPDATE
    TO authenticated
    USING (id = auth.uid());

-- ============================================
-- PROJECTS POLICIES
-- ============================================
-- Users can view projects in their organization
CREATE POLICY "Users can view projects in their organization"
    ON projects FOR SELECT
    TO authenticated
    USING (organization_id = get_user_organization_id());

-- Users can insert projects in their organization
CREATE POLICY "Users can insert projects"
    ON projects FOR INSERT
    TO authenticated
    WITH CHECK (organization_id = get_user_organization_id());

-- Users can update/delete projects in their organization
CREATE POLICY "Admins can manage projects"
    ON projects FOR UPDATE
    TO authenticated
    USING (organization_id = get_user_organization_id());

-- ============================================
-- DELIVERIES POLICIES
-- ============================================
-- Users can view deliveries in their organization
CREATE POLICY "Users can view deliveries in their organization"
    ON deliveries FOR SELECT
    TO authenticated
    USING (organization_id = get_user_organization_id());

-- Users can create deliveries in their organization
CREATE POLICY "Users can create deliveries"
    ON deliveries FOR INSERT
    TO authenticated
    WITH CHECK (organization_id = get_user_organization_id());

-- Users can update deliveries in their organization
CREATE POLICY "Users can update deliveries"
    ON deliveries FOR UPDATE
    TO authenticated
    USING (organization_id = get_user_organization_id());

-- ============================================
-- AUDIT LOGS POLICIES
-- ============================================
-- Users can view audit logs in their organization
CREATE POLICY "Users can view audit logs in their organization"
    ON audit_logs FOR SELECT
    TO authenticated
    USING (organization_id = get_user_organization_id());

-- Users can insert audit logs
CREATE POLICY "Users can insert audit logs"
    ON audit_logs FOR INSERT
    TO authenticated
    WITH CHECK (organization_id = get_user_organization_id());

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS update_organizations_updated_at ON organizations;
DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;
DROP TRIGGER IF EXISTS update_deliveries_updated_at ON deliveries;

-- Apply updated_at triggers
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_deliveries_updated_at BEFORE UPDATE ON deliveries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- NOTIFICATIONS TABLE (for in-app notifications)
-- ============================================
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'success', 'warning', 'error')),
    read BOOLEAN NOT NULL DEFAULT FALSE,
    link TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- Enable RLS for notifications
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their notifications" ON notifications;
DROP POLICY IF EXISTS "Users can update their notifications" ON notifications;

CREATE POLICY "Users can view their notifications"
    ON notifications FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "Users can update their notifications"
    ON notifications FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid());

