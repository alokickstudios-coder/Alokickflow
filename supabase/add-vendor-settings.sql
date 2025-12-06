-- Add settings column to projects table for vendor assignment
-- Run this in your Supabase SQL editor

-- Add settings column if it doesn't exist
ALTER TABLE projects ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb;

-- Create an index for faster vendor lookups
CREATE INDEX IF NOT EXISTS idx_projects_settings_vendor 
ON projects USING gin ((settings -> 'vendor_id'));

-- Update any NULL settings to empty object
UPDATE projects SET settings = '{}'::jsonb WHERE settings IS NULL;

-- Verify the column was added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'projects' AND column_name = 'settings';

