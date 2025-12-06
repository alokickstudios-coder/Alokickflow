-- Update qc_jobs table to support environment-agnostic queue model
-- This extends the existing table with source tracking

-- Add new columns if they don't exist
ALTER TABLE qc_jobs 
ADD COLUMN IF NOT EXISTS source_type TEXT CHECK (source_type IN ('upload', 'drive_link')),
ADD COLUMN IF NOT EXISTS source_path TEXT,
ADD COLUMN IF NOT EXISTS file_name TEXT,
ADD COLUMN IF NOT EXISTS result_json JSONB DEFAULT '{}'::jsonb;

-- Update status enum to include 'queued' and 'running'
-- First, drop the constraint if it exists
ALTER TABLE qc_jobs DROP CONSTRAINT IF EXISTS qc_jobs_status_check;

-- Add new constraint with all statuses
ALTER TABLE qc_jobs 
ADD CONSTRAINT qc_jobs_status_check 
CHECK (status IN ('queued', 'pending', 'running', 'processing', 'completed', 'failed'));

-- Update default status to 'queued'
ALTER TABLE qc_jobs ALTER COLUMN status SET DEFAULT 'queued';

-- Rename result to result_json if needed (keep both for backward compatibility)
-- result_json is the new standard field

-- Add indexes for queue processing
CREATE INDEX IF NOT EXISTS idx_qc_jobs_status_created ON qc_jobs(status, created_at) WHERE status IN ('queued', 'pending');
CREATE INDEX IF NOT EXISTS idx_qc_jobs_source_type ON qc_jobs(source_type) WHERE source_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_qc_jobs_source_path ON qc_jobs(source_path) WHERE source_path IS NOT NULL;

-- Add comments
COMMENT ON COLUMN qc_jobs.source_type IS 'Source of the file: upload (Supabase storage) or drive_link (Google Drive file ID)';
COMMENT ON COLUMN qc_jobs.source_path IS 'Canonical path: Supabase storage path or Google Drive file ID';
COMMENT ON COLUMN qc_jobs.result_json IS 'Complete QC result JSON (replaces result field)';
COMMENT ON COLUMN qc_jobs.status IS 'Job status: queued (ready), running (processing), completed (done), failed (error)';

