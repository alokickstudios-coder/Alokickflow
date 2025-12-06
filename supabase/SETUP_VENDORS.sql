-- =====================================================
-- RUN THIS IN SUPABASE SQL EDITOR
-- https://supabase.com/dashboard/project/gllswthsxocdrbrvppep/sql/new
-- =====================================================

-- Drop and recreate vendors table with all columns
DROP TABLE IF EXISTS vendor_team_members CASCADE;
DROP TABLE IF EXISTS vendors CASCADE;

-- Create vendors table
CREATE TABLE vendors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    company_name TEXT,
    specialty TEXT,
    notes TEXT,
    status TEXT DEFAULT 'active',
    trust_score INTEGER DEFAULT 85,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create vendor team members table
CREATE TABLE vendor_team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    role TEXT DEFAULT 'member',
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_vendors_org ON vendors(organization_id);
CREATE INDEX idx_vendors_status ON vendors(status);
CREATE INDEX idx_vendor_team_vendor ON vendor_team_members(vendor_id);

-- Enable RLS
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_team_members ENABLE ROW LEVEL SECURITY;

-- RLS Policies for vendors (allow all for service role, restrict for users)
CREATE POLICY "Service role full access to vendors" ON vendors
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Users view vendors in org" ON vendors
    FOR SELECT TO authenticated USING (
        organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
    );

CREATE POLICY "Admins manage vendors" ON vendors
    FOR ALL TO authenticated USING (
        organization_id IN (
            SELECT organization_id FROM profiles 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- RLS Policies for vendor_team_members
CREATE POLICY "Service role full access to team" ON vendor_team_members
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Users view vendor team in org" ON vendor_team_members
    FOR SELECT TO authenticated USING (
        vendor_id IN (
            SELECT v.id FROM vendors v
            JOIN profiles p ON p.organization_id = v.organization_id
            WHERE p.id = auth.uid()
        )
    );

CREATE POLICY "Admins manage vendor team" ON vendor_team_members
    FOR ALL TO authenticated USING (
        vendor_id IN (
            SELECT v.id FROM vendors v
            JOIN profiles p ON p.organization_id = v.organization_id
            WHERE p.id = auth.uid() AND p.role = 'admin'
        )
    );

-- Grant permissions
GRANT ALL ON vendors TO authenticated;
GRANT ALL ON vendors TO service_role;
GRANT ALL ON vendor_team_members TO authenticated;
GRANT ALL ON vendor_team_members TO service_role;

-- Verify tables were created
SELECT 'vendors' as table_name, count(*) as count FROM vendors
UNION ALL
SELECT 'vendor_team_members' as table_name, count(*) as count FROM vendor_team_members;




