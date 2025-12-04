-- Create invitations table
CREATE TABLE invitations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('super_admin', 'admin', 'manager', 'operator', 'vendor', 'translation', 'dubbing', 'mixing', 'subtitling')),
    token TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days')
);

-- Create index for faster lookups
CREATE INDEX idx_invitations_organization_id ON invitations(organization_id);
CREATE INDEX idx_invitations_token ON invitations(token);
CREATE INDEX idx_invitations_email ON invitations(email);

-- RLS Policies for invitations

-- Enable RLS
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- Admins can view invitations for their organization
CREATE POLICY "Admins can view invitations"
    ON invitations FOR SELECT
    USING (
        organization_id IN (
            SELECT organization_id FROM profiles 
            WHERE id = auth.uid() AND role IN ('super_admin', 'admin', 'manager')
        )
    );

-- Admins can insert invitations
CREATE POLICY "Admins can create invitations"
    ON invitations FOR INSERT
    WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM profiles 
            WHERE id = auth.uid() AND role IN ('super_admin', 'admin', 'manager')
        )
    );

-- Admins can delete invitations (revoke)
CREATE POLICY "Admins can revoke invitations"
    ON invitations FOR DELETE
    USING (
        organization_id IN (
            SELECT organization_id FROM profiles 
            WHERE id = auth.uid() AND role IN ('super_admin', 'admin', 'manager')
        )
    );


