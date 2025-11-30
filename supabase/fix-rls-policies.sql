-- ============================================
-- QUICK FIX: RLS Infinite Recursion Issue
-- Run this in Supabase SQL Editor
-- ============================================

-- Step 1: Create helper function that bypasses RLS
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

-- Step 2: Drop problematic policies
DROP POLICY IF EXISTS "Users can view profiles in their organization" ON profiles;
DROP POLICY IF EXISTS "Admins can insert profiles" ON profiles;
DROP POLICY IF EXISTS "Users can view their own organization" ON organizations;
DROP POLICY IF EXISTS "Admins can update their organization" ON organizations;

-- Step 3: Create fixed policies for PROFILES
-- Users can always view their own profile (direct check, no recursion)
CREATE POLICY "Users can view own profile"
    ON profiles FOR SELECT
    TO authenticated
    USING (id = auth.uid());

-- Users can view other profiles using the helper function
CREATE POLICY "Users can view org profiles"
    ON profiles FOR SELECT
    TO authenticated
    USING (organization_id = get_user_organization_id());

-- Users can create their own profile during registration
CREATE POLICY "Users can create own profile"
    ON profiles FOR INSERT
    TO authenticated
    WITH CHECK (id = auth.uid());

-- Step 4: Create fixed policies for ORGANIZATIONS
-- Anyone authenticated can create organization (for registration)
CREATE POLICY "Anyone can create organization"
    ON organizations FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Users can view their own organization
CREATE POLICY "Users can view own organization"
    ON organizations FOR SELECT
    TO authenticated
    USING (id = get_user_organization_id());

-- Users can update their own organization  
CREATE POLICY "Users can update own organization"
    ON organizations FOR UPDATE
    TO authenticated
    USING (id = get_user_organization_id());

-- Step 5: Add status column to projects if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'projects' AND column_name = 'status'
    ) THEN
        ALTER TABLE projects ADD COLUMN status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived', 'completed'));
    END IF;
END $$;

-- Step 6: Fix projects policies
DROP POLICY IF EXISTS "Users can view projects in their organization" ON projects;
DROP POLICY IF EXISTS "Admins can manage projects" ON projects;

CREATE POLICY "Users can view projects"
    ON projects FOR SELECT
    TO authenticated
    USING (organization_id = get_user_organization_id());

CREATE POLICY "Users can create projects"
    ON projects FOR INSERT
    TO authenticated
    WITH CHECK (organization_id = get_user_organization_id());

CREATE POLICY "Users can update projects"
    ON projects FOR UPDATE
    TO authenticated
    USING (organization_id = get_user_organization_id());

-- Step 7: Fix deliveries policies
DROP POLICY IF EXISTS "Users can view deliveries in their organization" ON deliveries;
DROP POLICY IF EXISTS "Vendors can create deliveries" ON deliveries;
DROP POLICY IF EXISTS "Vendors can update their deliveries" ON deliveries;
DROP POLICY IF EXISTS "Admins and QC can update deliveries" ON deliveries;

CREATE POLICY "Users can view deliveries"
    ON deliveries FOR SELECT
    TO authenticated
    USING (organization_id = get_user_organization_id());

CREATE POLICY "Users can create deliveries"
    ON deliveries FOR INSERT
    TO authenticated
    WITH CHECK (organization_id = get_user_organization_id());

CREATE POLICY "Users can update deliveries"
    ON deliveries FOR UPDATE
    TO authenticated
    USING (organization_id = get_user_organization_id());

-- Done! Registration should now work.

