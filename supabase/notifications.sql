-- Notifications Table for Real-time Updates
-- Run this in Supabase SQL Editor

-- Create notifications table if it doesn't exist
CREATE TABLE IF NOT EXISTS notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    data JSONB DEFAULT '{}',
    read BOOLEAN DEFAULT FALSE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_organization_id ON notifications(organization_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- Enable RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users can view their own notifications" ON notifications;
CREATE POLICY "Users can view their own notifications" ON notifications
    FOR SELECT USING (
        user_id = auth.uid() OR 
        organization_id = (
            SELECT organization_id FROM profiles WHERE id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "System can insert notifications" ON notifications;
CREATE POLICY "System can insert notifications" ON notifications
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update their own notifications" ON notifications;
CREATE POLICY "Users can update their own notifications" ON notifications
    FOR UPDATE USING (user_id = auth.uid());

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- Function to clean old notifications (run periodically)
CREATE OR REPLACE FUNCTION clean_old_notifications()
RETURNS void AS $$
BEGIN
    DELETE FROM notifications
    WHERE created_at < NOW() - INTERVAL '30 days'
    AND read = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add notification trigger for QC completion
CREATE OR REPLACE FUNCTION notify_qc_completion()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status IN ('qc_passed', 'qc_failed') AND 
       (OLD.status IS NULL OR OLD.status NOT IN ('qc_passed', 'qc_failed')) THEN
        INSERT INTO notifications (type, title, message, data, user_id, organization_id)
        VALUES (
            CASE WHEN NEW.status = 'qc_passed' THEN 'qc_complete' ELSE 'qc_failed' END,
            CASE WHEN NEW.status = 'qc_passed' THEN 'QC Passed' ELSE 'QC Failed' END,
            NEW.file_name || ' has ' || CASE WHEN NEW.status = 'qc_passed' THEN 'passed' ELSE 'failed' END || ' QC',
            jsonb_build_object('deliveryId', NEW.id),
            NEW.vendor_id,
            NEW.organization_id
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_qc_notification ON deliveries;
CREATE TRIGGER trigger_qc_notification
    AFTER UPDATE OF status ON deliveries
    FOR EACH ROW
    EXECUTE FUNCTION notify_qc_completion();

-- Add notification trigger for new assignments
CREATE OR REPLACE FUNCTION notify_new_assignment()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO notifications (type, title, message, data, user_id, organization_id)
    VALUES (
        'assignment_new',
        'New Work Assignment',
        'You have been assigned: ' || NEW.display_name,
        jsonb_build_object('assignmentId', NEW.id),
        NEW.vendor_id,
        NEW.organization_id
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_assignment_notification ON drive_assignments;
CREATE TRIGGER trigger_assignment_notification
    AFTER INSERT ON drive_assignments
    FOR EACH ROW
    EXECUTE FUNCTION notify_new_assignment();

