-- ============================================
-- STORAGE BUCKET POLICIES FOR DELIVERIES
-- ============================================

-- Enable RLS on storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Policy: Users can upload files to their organization's folder
CREATE POLICY "Users can upload to their organization folder"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'deliveries' AND
  (storage.foldername(name))[1] IN (
    SELECT organization_id::text 
    FROM profiles 
    WHERE id = auth.uid()
  )
);

-- Policy: Users can read files from their organization
CREATE POLICY "Users can read their organization files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'deliveries' AND
  (storage.foldername(name))[1] IN (
    SELECT organization_id::text 
    FROM profiles 
    WHERE id = auth.uid()
  )
);

-- Policy: Users can update files in their organization (for versioning)
CREATE POLICY "Users can update their organization files"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'deliveries' AND
  (storage.foldername(name))[1] IN (
    SELECT organization_id::text 
    FROM profiles 
    WHERE id = auth.uid()
  )
);

-- Policy: Admins can delete files in their organization
CREATE POLICY "Admins can delete their organization files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'deliveries' AND
  (storage.foldername(name))[1] IN (
    SELECT organization_id::text 
    FROM profiles 
    WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
  )
);

-- ============================================
-- USAGE TRACKING TABLE
-- ============================================
CREATE TABLE usage_tracking (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    metric_type TEXT NOT NULL, -- 'storage', 'deliveries', 'qc_checks'
    metric_value BIGINT NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_usage_tracking_org_id ON usage_tracking(organization_id);
CREATE INDEX idx_usage_tracking_metric ON usage_tracking(metric_type);
CREATE INDEX idx_usage_tracking_date ON usage_tracking(recorded_at DESC);

-- Enable RLS
ALTER TABLE usage_tracking ENABLE ROW LEVEL SECURITY;

-- Policy: Admins can view their org usage
CREATE POLICY "Admins can view org usage"
ON usage_tracking FOR SELECT
USING (
    organization_id IN (
        SELECT organization_id FROM profiles 
        WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    )
);

-- ============================================
-- FUNCTION: Check subscription limits
-- ============================================
CREATE OR REPLACE FUNCTION check_subscription_limit(
    org_id UUID,
    limit_type TEXT,
    current_count INT
) RETURNS BOOLEAN AS $$
DECLARE
    org_tier TEXT;
    limit_value INT;
BEGIN
    -- Get organization tier
    SELECT subscription_tier INTO org_tier
    FROM organizations
    WHERE id = org_id;

    -- Define limits based on tier and type
    IF limit_type = 'projects' THEN
        CASE org_tier
            WHEN 'free' THEN limit_value := 1;
            WHEN 'pro' THEN limit_value := 999999; -- unlimited
            WHEN 'enterprise' THEN limit_value := 999999;
        END CASE;
    ELSIF limit_type = 'vendors' THEN
        CASE org_tier
            WHEN 'free' THEN limit_value := 3;
            WHEN 'pro' THEN limit_value := 999999;
            WHEN 'enterprise' THEN limit_value := 999999;
        END CASE;
    ELSIF limit_type = 'storage_gb' THEN
        CASE org_tier
            WHEN 'free' THEN limit_value := 10;
            WHEN 'pro' THEN limit_value := 100;
            WHEN 'enterprise' THEN limit_value := 999999;
        END CASE;
    ELSIF limit_type = 'deliveries_per_month' THEN
        CASE org_tier
            WHEN 'free' THEN limit_value := 100;
            WHEN 'pro' THEN limit_value := 1000;
            WHEN 'enterprise' THEN limit_value := 999999;
        END CASE;
    END IF;

    RETURN current_count < limit_value;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- NOTIFICATIONS TABLE
-- ============================================
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('info', 'success', 'warning', 'error')),
    read BOOLEAN NOT NULL DEFAULT FALSE,
    link TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(read);
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);

-- Enable RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own notifications
CREATE POLICY "Users can view their notifications"
ON notifications FOR SELECT
USING (user_id = auth.uid());

-- Policy: Users can update their own notifications (mark as read)
CREATE POLICY "Users can update their notifications"
ON notifications FOR UPDATE
USING (user_id = auth.uid());

-- ============================================
-- FUNCTION: Create notification
-- ============================================
CREATE OR REPLACE FUNCTION create_notification(
    target_user_id UUID,
    target_org_id UUID,
    notif_title TEXT,
    notif_message TEXT,
    notif_type TEXT,
    notif_link TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    new_notif_id UUID;
BEGIN
    INSERT INTO notifications (user_id, organization_id, title, message, type, link)
    VALUES (target_user_id, target_org_id, notif_title, notif_message, notif_type, notif_link)
    RETURNING id INTO new_notif_id;
    
    RETURN new_notif_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

