-- Migration: Add Progress Column and Fix Status Constraint
-- Version: 003
-- Date: 2024-12-12
-- Description: 
--   1. Adds progress column for real-time progress tracking (fixes stuck at 5%)
--   2. Updates status constraint to include 'paused' and 'cancelled' (fixes pause/cancel)
-- 
-- CRITICAL FIXES:
--   - "stuck at 5%" issue: worker couldn't update progress (column missing)
--   - "pause not working": 'paused' status not allowed by constraint
--
-- ROLLBACK: Use the DOWN section at the bottom

-- ============================================
-- UP MIGRATION
-- ============================================

-- Step 1: Add progress column to qc_jobs table
ALTER TABLE qc_jobs 
ADD COLUMN IF NOT EXISTS progress INTEGER DEFAULT 0;

-- Step 2: Drop the old status constraint that doesn't include 'paused'
ALTER TABLE qc_jobs 
DROP CONSTRAINT IF EXISTS qc_jobs_status_check;

-- Step 3: Add new status constraint with ALL valid statuses
ALTER TABLE qc_jobs 
ADD CONSTRAINT qc_jobs_status_check 
CHECK (status IN ('queued', 'pending', 'running', 'completed', 'failed', 'paused', 'cancelled'));

-- Step 4: Add constraint for progress range (0-100)
-- First drop if exists to avoid conflict
ALTER TABLE qc_jobs DROP CONSTRAINT IF EXISTS qc_jobs_progress_range;
ALTER TABLE qc_jobs 
ADD CONSTRAINT qc_jobs_progress_range 
CHECK (progress >= 0 AND progress <= 100);

-- Step 5: Add index for filtering by progress (useful for finding stuck jobs)
CREATE INDEX IF NOT EXISTS idx_qc_jobs_progress 
ON qc_jobs(progress) 
WHERE status = 'running';

-- Step 6: Add index for paused jobs (for resume functionality)
CREATE INDEX IF NOT EXISTS idx_qc_jobs_paused 
ON qc_jobs(status) 
WHERE status = 'paused';

-- Step 7: Comments for documentation
COMMENT ON COLUMN qc_jobs.progress IS 
  'Processing progress percentage (0-100). Updated in real-time by worker.';

COMMENT ON CONSTRAINT qc_jobs_status_check ON qc_jobs IS
  'Valid statuses: queued, pending, running, completed, failed, paused, cancelled';

-- ============================================
-- DOWN MIGRATION (Rollback)
-- ============================================
-- Run these statements to rollback:
--
-- DROP INDEX IF EXISTS idx_qc_jobs_paused;
-- DROP INDEX IF EXISTS idx_qc_jobs_progress;
-- ALTER TABLE qc_jobs DROP CONSTRAINT IF EXISTS qc_jobs_progress_range;
-- ALTER TABLE qc_jobs DROP CONSTRAINT IF EXISTS qc_jobs_status_check;
-- ALTER TABLE qc_jobs ADD CONSTRAINT qc_jobs_status_check CHECK (status IN ('queued', 'pending', 'running', 'completed', 'failed'));
-- ALTER TABLE qc_jobs DROP COLUMN IF EXISTS progress;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================
-- After running migration, verify with:
--
-- Check progress column:
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns 
-- WHERE table_name = 'qc_jobs' AND column_name = 'progress';
--
-- Check status constraint:
-- SELECT conname, pg_get_constraintdef(oid) 
-- FROM pg_constraint 
-- WHERE conrelid = 'qc_jobs'::regclass AND conname = 'qc_jobs_status_check';
