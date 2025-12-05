-- ============================================
-- 6. PROJECT STAGES TABLE
-- ============================================
CREATE TABLE project_stages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
    stage_order INT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- 7. PROJECT STAGE ASSIGNMENTS TABLE
-- ============================================
CREATE TABLE project_stage_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    stage_id UUID NOT NULL REFERENCES project_stages(id) ON DELETE CASCADE,
    assignee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- INDEXES for Performance
-- ============================================
CREATE INDEX idx_project_stages_project_id ON project_stages(project_id);
CREATE INDEX idx_project_stage_assignments_stage_id ON project_stage_assignments(stage_id);
CREATE INDEX idx_project_stage_assignments_assignee_id ON project_stage_assignments(assignee_id);


-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================
ALTER TABLE project_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_stage_assignments ENABLE ROW LEVEL SECURITY;

-- ============================================
-- PROJECT STAGES POLICIES
-- ============================================
-- Users can view stages of projects in their organization
CREATE POLICY "Users can view project stages in their organization"
    ON project_stages FOR SELECT
    USING (
        project_id IN (
            SELECT id FROM projects WHERE organization_id = get_user_organization_id()
        )
    );

-- Admins can manage project stages
CREATE POLICY "Admins can manage project stages"
    ON project_stages FOR ALL
    USING (
        project_id IN (
            SELECT id FROM projects WHERE organization_id = get_user_organization_id()
        ) AND (
            (SELECT role FROM profiles WHERE id = auth.uid()) IN ('super_admin', 'admin')
        )
    );


-- ============================================
-- PROJECT STAGE ASSIGNMENTS POLICIES
-- ============================================
-- Users can view assignments of stages in their organization
CREATE POLICY "Users can view project stage assignments in their organization"
    ON project_stage_assignments FOR SELECT
    USING (
        stage_id IN (
            SELECT id FROM project_stages WHERE project_id IN (
                SELECT id FROM projects WHERE organization_id = get_user_organization_id()
            )
        )
    );

-- Admins can manage project stage assignments
CREATE POLICY "Admins can manage project stage assignments"
    ON project_stage_assignments FOR ALL
    USING (
        stage_id IN (
            SELECT id FROM project_stages WHERE project_id IN (
                SELECT id FROM projects WHERE organization_id = get_user_organization_id()
            )
        ) AND (
            (SELECT role FROM profiles WHERE id = auth.uid()) IN ('super_admin', 'admin')
        )
    );

-- Assignees can see their own assignments
CREATE POLICY "Assignees can see their own assignments"
    ON project_stage_assignments FOR SELECT
    USING (
        assignee_id = auth.uid()
    );


-- ============================================
-- TRIGGERS
-- ============================================
CREATE TRIGGER update_project_stages_updated_at BEFORE UPDATE ON project_stages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();