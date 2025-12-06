-- Add qc_sheet_id column to projects table
-- This stores the Google Sheet ID for each project's QC results

ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS qc_sheet_id TEXT;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_projects_qc_sheet_id ON projects(qc_sheet_id) WHERE qc_sheet_id IS NOT NULL;

-- Add comment
COMMENT ON COLUMN projects.qc_sheet_id IS 'Google Drive Sheet ID for this project''s QC results sheet (copied from template)';

