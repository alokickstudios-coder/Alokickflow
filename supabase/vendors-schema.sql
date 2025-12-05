-- =====================================================
-- VENDORS TABLE - Independent of auth.users
-- Run this in Supabase SQL Editor
-- =====================================================

-- Create vendors table (no FK to auth.users)
CREATE TABLE IF NOT EXISTS vendors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    company_name TEXT,
    specialty TEXT,
    notes TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    trust_score INTEGER DEFAULT 85 CHECK (trust_score >= 0 AND trust_score <= 100),
    -- If vendor has a user account (optional)
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- Create vendor_team_members table for vendor's team
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

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_vendors_organization ON vendors(organization_id);
CREATE INDEX IF NOT EXISTS idx_vendors_status ON vendors(status);
CREATE INDEX IF NOT EXISTS idx_vendors_email ON vendors(email);
CREATE INDEX IF NOT EXISTS idx_vendor_team_vendor ON vendor_team_members(vendor_id);

-- Enable RLS
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_team_members ENABLE ROW LEVEL SECURITY;

-- RLS Policies for vendors
DROP POLICY IF EXISTS "Users can view vendors in their org" ON vendors;
CREATE POLICY "Users can view vendors in their org" ON vendors
    FOR SELECT USING (
        organization_id IN (
            SELECT organization_id FROM profiles WHERE id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Admins can manage vendors" ON vendors;
CREATE POLICY "Admins can manage vendors" ON vendors
    FOR ALL USING (
        organization_id IN (
            SELECT organization_id FROM profiles 
            WHERE id = auth.uid() AND role IN ('admin', 'owner')
        )
    );

-- RLS Policies for vendor_team_members
DROP POLICY IF EXISTS "Users can view vendor team in their org" ON vendor_team_members;
CREATE POLICY "Users can view vendor team in their org" ON vendor_team_members
    FOR SELECT USING (
        vendor_id IN (
            SELECT v.id FROM vendors v
            JOIN profiles p ON p.organization_id = v.organization_id
            WHERE p.id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Admins and vendor owners can manage team" ON vendor_team_members;
CREATE POLICY "Admins and vendor owners can manage team" ON vendor_team_members
    FOR ALL USING (
        vendor_id IN (
            SELECT v.id FROM vendors v
            JOIN profiles p ON p.organization_id = v.organization_id
            WHERE p.id = auth.uid() AND p.role IN ('admin', 'owner', 'vendor')
        )
    );

-- Update drive_assignments to reference vendors table
-- First check if the column exists and is using profiles
DO $$
BEGIN
    -- Add vendor_id column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'drive_assignments' AND column_name = 'new_vendor_id'
    ) THEN
        ALTER TABLE drive_assignments ADD COLUMN new_vendor_id UUID REFERENCES vendors(id);
    END IF;
END $$;

-- Function to update timestamps
CREATE OR REPLACE FUNCTION update_vendor_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS vendor_updated_at ON vendors;
CREATE TRIGGER vendor_updated_at
    BEFORE UPDATE ON vendors
    FOR EACH ROW
    EXECUTE FUNCTION update_vendor_timestamp();

-- Grant service role full access (bypasses RLS)
GRANT ALL ON vendors TO service_role;
GRANT ALL ON vendor_team_members TO service_role;

-- =====================================================
-- UPGRADE USER TO ENTERPRISE
-- =====================================================

-- Update organization to enterprise tier
UPDATE organizations 
SET subscription_tier = 'enterprise'
WHERE id = (
    SELECT organization_id FROM profiles 
    WHERE id = (SELECT id FROM auth.users WHERE email = 'alokickstudios@gmail.com')
);

-- Update user profile to owner role
UPDATE profiles 
SET role = 'owner', full_name = COALESCE(full_name, 'Alok')
WHERE id = (SELECT id FROM auth.users WHERE email = 'alokickstudios@gmail.com');

-- Verify the updates
SELECT 
    p.id,
    p.role,
    p.full_name,
    o.name as org_name,
    o.subscription_tier
FROM profiles p
JOIN organizations o ON p.organization_id = o.id
WHERE p.id = (SELECT id FROM auth.users WHERE email = 'alokickstudios@gmail.com');






