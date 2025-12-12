-- Migration: Create Job Dead Letter Queue (DLQ)
-- Version: 001
-- Date: 2024-12-12
-- Description: Creates table for failed jobs that need human review or retry
-- 
-- IMPORTANT: Run with --dry-run first to validate schema
-- ROLLBACK: Use the DOWN section at the bottom

-- ============================================
-- UP MIGRATION
-- ============================================

-- Create the DLQ table
CREATE TABLE IF NOT EXISTS job_dlq (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Reference to original job
    job_id UUID NOT NULL,
    job_type VARCHAR(50) NOT NULL DEFAULT 'qc_job',  -- 'qc_job', 'delivery', etc.
    
    -- Job payload snapshot (full state at time of failure)
    payload JSONB NOT NULL,
    
    -- Failure information
    failure_reason TEXT NOT NULL,
    failure_code VARCHAR(100),  -- e.g., 'TIMEOUT', 'AUTH_ERROR', 'PARSE_ERROR'
    failure_stack TEXT,  -- Stack trace if available
    
    -- Retry tracking
    attempt_count INT NOT NULL DEFAULT 1,
    max_retries INT NOT NULL DEFAULT 3,
    last_attempt_at TIMESTAMP WITH TIME ZONE,
    next_retry_at TIMESTAMP WITH TIME ZONE,
    
    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'pending',  -- 'pending', 'retrying', 'resolved', 'abandoned'
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    -- Audit
    organisation_id UUID,
    created_by UUID,
    resolved_by UUID,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolution_notes TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_job_dlq_job_id ON job_dlq(job_id);
CREATE INDEX IF NOT EXISTS idx_job_dlq_status ON job_dlq(status);
CREATE INDEX IF NOT EXISTS idx_job_dlq_org_id ON job_dlq(organisation_id);
CREATE INDEX IF NOT EXISTS idx_job_dlq_created_at ON job_dlq(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_dlq_next_retry ON job_dlq(next_retry_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_job_dlq_failure_code ON job_dlq(failure_code);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_job_dlq_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS job_dlq_updated_at ON job_dlq;
CREATE TRIGGER job_dlq_updated_at
    BEFORE UPDATE ON job_dlq
    FOR EACH ROW
    EXECUTE FUNCTION update_job_dlq_updated_at();

-- RLS Policies (if using Row Level Security)
ALTER TABLE job_dlq ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see DLQ entries for their organization
CREATE POLICY "Users can view own org DLQ entries"
    ON job_dlq FOR SELECT
    USING (organisation_id IN (
        SELECT organization_id FROM profiles WHERE id = auth.uid()
    ));

-- Policy: Admins can manage DLQ entries
CREATE POLICY "Admins can manage DLQ entries"
    ON job_dlq FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() 
            AND role IN ('admin', 'super_admin')
            AND organization_id = job_dlq.organisation_id
        )
    );

-- Grant access to service role (for worker)
-- Note: This requires SUPABASE_SERVICE_ROLE_KEY
GRANT ALL ON job_dlq TO service_role;

-- ============================================
-- DOWN MIGRATION (Rollback)
-- ============================================
-- Run these statements to rollback:
--
-- DROP TRIGGER IF EXISTS job_dlq_updated_at ON job_dlq;
-- DROP FUNCTION IF EXISTS update_job_dlq_updated_at();
-- DROP TABLE IF EXISTS job_dlq;

-- ============================================
-- VERIFICATION QUERY
-- ============================================
-- After running migration, verify with:
--
-- SELECT table_name, column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_name = 'job_dlq';
