-- Create project_vendor_assignments table
-- This table stores the vendor assigned to each project
-- Run this in your Supabase SQL editor

CREATE TABLE IF NOT EXISTS project_vendor_assignments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    vendor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    vendor_name TEXT,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id)
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_pva_project_id ON project_vendor_assignments(project_id);
CREATE INDEX IF NOT EXISTS idx_pva_vendor_id ON project_vendor_assignments(vendor_id);
CREATE INDEX IF NOT EXISTS idx_pva_organization_id ON project_vendor_assignments(organization_id);

-- Enable RLS
ALTER TABLE project_vendor_assignments ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can read/write assignments for their organization
CREATE POLICY "Users can manage project vendor assignments in their organization"
ON project_vendor_assignments
FOR ALL
USING (organization_id IN (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
))
WITH CHECK (organization_id IN (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
));

-- Allow service role full access
CREATE POLICY "Service role has full access to project vendor assignments"
ON project_vendor_assignments
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Verify the table was created
SELECT 'project_vendor_assignments table created successfully' as status;

