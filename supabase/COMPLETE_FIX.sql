-- =====================================================
-- COMPLETE ALOKICKFLOW DATABASE FIX
-- Run this ENTIRE script in Supabase SQL Editor
-- https://supabase.com/dashboard/project/gllswthsxocdrbrvppep/sql/new
-- =====================================================

-- =====================================================
-- PART 1: FIX VENDORS TABLE
-- =====================================================

-- Ensure vendors table has all columns
DO $$
BEGIN
    -- Add columns if they don't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vendors' AND column_name = 'full_name') THEN
        ALTER TABLE vendors ADD COLUMN full_name TEXT NOT NULL DEFAULT 'Unknown';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vendors' AND column_name = 'email') THEN
        ALTER TABLE vendors ADD COLUMN email TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vendors' AND column_name = 'phone') THEN
        ALTER TABLE vendors ADD COLUMN phone TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vendors' AND column_name = 'company_name') THEN
        ALTER TABLE vendors ADD COLUMN company_name TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vendors' AND column_name = 'specialty') THEN
        ALTER TABLE vendors ADD COLUMN specialty TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vendors' AND column_name = 'notes') THEN
        ALTER TABLE vendors ADD COLUMN notes TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vendors' AND column_name = 'status') THEN
        ALTER TABLE vendors ADD COLUMN status TEXT DEFAULT 'active';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vendors' AND column_name = 'trust_score') THEN
        ALTER TABLE vendors ADD COLUMN trust_score INTEGER DEFAULT 85;
    END IF;
END $$;

-- =====================================================
-- PART 2: CREATE VENDOR_TEAM_MEMBERS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS vendor_team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    role TEXT DEFAULT 'member',
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- PART 3: FIX DRIVE_ASSIGNMENTS FOREIGN KEY
-- =====================================================

-- Drop the old foreign key constraint that references profiles
ALTER TABLE drive_assignments 
DROP CONSTRAINT IF EXISTS drive_assignments_vendor_id_fkey;

-- Allow NULL temporarily for migration
ALTER TABLE drive_assignments
ALTER COLUMN vendor_id DROP NOT NULL;

-- Add new foreign key to vendors table
ALTER TABLE drive_assignments
ADD CONSTRAINT drive_assignments_vendor_id_fkey 
FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL;

-- =====================================================
-- PART 4: ENABLE RLS AND CREATE POLICIES
-- =====================================================

ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_team_members ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Service role full access vendors" ON vendors;
DROP POLICY IF EXISTS "Users view vendors in org" ON vendors;
DROP POLICY IF EXISTS "Service role full access team" ON vendor_team_members;

-- Create new policies
CREATE POLICY "Service role full access vendors" ON vendors
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Users view vendors in org" ON vendors
    FOR SELECT TO authenticated USING (
        organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
    );

CREATE POLICY "Service role full access team" ON vendor_team_members
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =====================================================
-- PART 5: GRANT PERMISSIONS
-- =====================================================

GRANT ALL ON vendors TO authenticated;
GRANT ALL ON vendors TO service_role;
GRANT ALL ON vendor_team_members TO authenticated;
GRANT ALL ON vendor_team_members TO service_role;

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Check vendors table structure
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'vendors'
ORDER BY ordinal_position;

-- Check drive_assignments foreign keys
SELECT 
    tc.constraint_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
WHERE tc.table_name = 'drive_assignments' 
    AND tc.constraint_type = 'FOREIGN KEY';

-- Count records
SELECT 'vendors' as table_name, count(*) as count FROM vendors
UNION ALL
SELECT 'vendor_team_members', count(*) FROM vendor_team_members
UNION ALL  
SELECT 'drive_assignments', count(*) FROM drive_assignments;


