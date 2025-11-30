-- ============================================
-- GOOGLE DRIVE LINKS / PROJECT ASSIGNMENTS
-- ============================================

CREATE TABLE IF NOT EXISTS drive_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    vendor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    
    -- Original link info (hidden from vendor)
    original_drive_link TEXT NOT NULL,
    client_name TEXT,  -- Hidden from vendor
    client_email TEXT, -- Hidden from vendor
    
    -- Sanitized info (visible to vendor)
    display_name TEXT NOT NULL,  -- What vendor sees as folder name
    description TEXT,
    
    -- Status tracking
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
    due_date TIMESTAMPTZ,
    
    -- Metadata
    assigned_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_drive_assignments_org ON drive_assignments(organization_id);
CREATE INDEX IF NOT EXISTS idx_drive_assignments_vendor ON drive_assignments(vendor_id);
CREATE INDEX IF NOT EXISTS idx_drive_assignments_project ON drive_assignments(project_id);
CREATE INDEX IF NOT EXISTS idx_drive_assignments_status ON drive_assignments(status);

-- Enable RLS
ALTER TABLE drive_assignments ENABLE ROW LEVEL SECURITY;

-- Policies
-- Admins can see all assignments in their org
CREATE POLICY "admin_view_assignments" ON drive_assignments
    FOR SELECT TO authenticated
    USING (organization_id = get_user_organization_id());

-- Vendors can only see their own assignments (with sanitized data)
CREATE POLICY "vendor_view_own_assignments" ON drive_assignments
    FOR SELECT TO authenticated
    USING (vendor_id = auth.uid());

-- Admins can create assignments
CREATE POLICY "admin_create_assignments" ON drive_assignments
    FOR INSERT TO authenticated
    WITH CHECK (organization_id = get_user_organization_id());

-- Admins can update assignments
CREATE POLICY "admin_update_assignments" ON drive_assignments
    FOR UPDATE TO authenticated
    USING (organization_id = get_user_organization_id());

-- Admins can delete assignments
CREATE POLICY "admin_delete_assignments" ON drive_assignments
    FOR DELETE TO authenticated
    USING (organization_id = get_user_organization_id());

-- Trigger for updated_at
CREATE TRIGGER update_drive_assignments_updated_at 
    BEFORE UPDATE ON drive_assignments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

