-- ============================================
-- COMPLETE FIX FOR REGISTRATION
-- Run this in Supabase SQL Editor
-- ============================================

-- Step 1: Temporarily disable RLS on organizations and profiles for setup
ALTER TABLE organizations DISABLE ROW LEVEL SECURITY;
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;

-- Step 2: Drop ALL existing policies to start fresh
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN 
        SELECT policyname, tablename 
        FROM pg_policies 
        WHERE schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, pol.tablename);
    END LOOP;
END $$;

-- Step 3: Create the helper function
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

-- Step 4: Re-enable RLS
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;

-- ============================================
-- ORGANIZATIONS POLICIES
-- ============================================
-- Allow ANY authenticated user to INSERT (for registration)
CREATE POLICY "org_insert" ON organizations
    FOR INSERT TO authenticated
    WITH CHECK (true);

-- Allow users to SELECT their own org
CREATE POLICY "org_select" ON organizations
    FOR SELECT TO authenticated
    USING (id = get_user_organization_id());

-- Allow users to UPDATE their own org
CREATE POLICY "org_update" ON organizations
    FOR UPDATE TO authenticated
    USING (id = get_user_organization_id());

-- ============================================
-- PROFILES POLICIES
-- ============================================
-- Allow users to INSERT their own profile (registration)
CREATE POLICY "profile_insert" ON profiles
    FOR INSERT TO authenticated
    WITH CHECK (id = auth.uid());

-- Allow users to SELECT their own profile
CREATE POLICY "profile_select_own" ON profiles
    FOR SELECT TO authenticated
    USING (id = auth.uid());

-- Allow users to SELECT profiles in their org
CREATE POLICY "profile_select_org" ON profiles
    FOR SELECT TO authenticated
    USING (organization_id = get_user_organization_id());

-- Allow users to UPDATE their own profile
CREATE POLICY "profile_update" ON profiles
    FOR UPDATE TO authenticated
    USING (id = auth.uid());

-- ============================================
-- PROJECTS POLICIES
-- ============================================
CREATE POLICY "project_select" ON projects
    FOR SELECT TO authenticated
    USING (organization_id = get_user_organization_id());

CREATE POLICY "project_insert" ON projects
    FOR INSERT TO authenticated
    WITH CHECK (organization_id = get_user_organization_id());

CREATE POLICY "project_update" ON projects
    FOR UPDATE TO authenticated
    USING (organization_id = get_user_organization_id());

CREATE POLICY "project_delete" ON projects
    FOR DELETE TO authenticated
    USING (organization_id = get_user_organization_id());

-- ============================================
-- DELIVERIES POLICIES
-- ============================================
CREATE POLICY "delivery_select" ON deliveries
    FOR SELECT TO authenticated
    USING (organization_id = get_user_organization_id());

CREATE POLICY "delivery_insert" ON deliveries
    FOR INSERT TO authenticated
    WITH CHECK (organization_id = get_user_organization_id());

CREATE POLICY "delivery_update" ON deliveries
    FOR UPDATE TO authenticated
    USING (organization_id = get_user_organization_id());

CREATE POLICY "delivery_delete" ON deliveries
    FOR DELETE TO authenticated
    USING (organization_id = get_user_organization_id());

-- ============================================
-- Add status column to projects if missing
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'projects' AND column_name = 'status'
    ) THEN
        ALTER TABLE projects ADD COLUMN status TEXT DEFAULT 'active';
    END IF;
END $$;

-- ============================================
-- DONE! Now registration should work.
-- ============================================

