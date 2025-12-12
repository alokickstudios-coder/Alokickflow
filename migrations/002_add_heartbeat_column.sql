-- Migration: Add Heartbeat Column to QC Jobs
-- Version: 002
-- Date: 2024-12-12
-- Description: Adds last_heartbeat_at column for watchdog monitoring
-- 
-- IMPORTANT: Run with --dry-run first to validate schema
-- ROLLBACK: Use the DOWN section at the bottom

-- ============================================
-- UP MIGRATION
-- ============================================

-- Add heartbeat column to qc_jobs table
ALTER TABLE qc_jobs 
ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMP WITH TIME ZONE;

-- Add index for watchdog queries
CREATE INDEX IF NOT EXISTS idx_qc_jobs_heartbeat 
ON qc_jobs(last_heartbeat_at) 
WHERE status = 'running';

-- Add composite index for stuck job detection
CREATE INDEX IF NOT EXISTS idx_qc_jobs_running_heartbeat 
ON qc_jobs(status, last_heartbeat_at) 
WHERE status = 'running';

-- Comment for documentation
COMMENT ON COLUMN qc_jobs.last_heartbeat_at IS 
  'Last heartbeat timestamp from worker. Used by watchdog to detect stuck jobs.';

-- ============================================
-- DOWN MIGRATION (Rollback)
-- ============================================
-- Run these statements to rollback:
--
-- DROP INDEX IF EXISTS idx_qc_jobs_running_heartbeat;
-- DROP INDEX IF EXISTS idx_qc_jobs_heartbeat;
-- ALTER TABLE qc_jobs DROP COLUMN IF EXISTS last_heartbeat_at;

-- ============================================
-- VERIFICATION QUERY
-- ============================================
-- After running migration, verify with:
--
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns 
-- WHERE table_name = 'qc_jobs' AND column_name = 'last_heartbeat_at';
