-- =====================================================
-- Add mime_type column to deliveries table
-- Run this in Supabase SQL Editor
-- =====================================================

-- Add mime_type column if it doesn't exist
ALTER TABLE deliveries 
ADD COLUMN IF NOT EXISTS mime_type VARCHAR(100);

-- Add comment
COMMENT ON COLUMN deliveries.mime_type IS 'MIME type of the uploaded file (e.g., video/mp4, audio/wav, text/plain)';

-- Verify column was added
SELECT column_name, data_type, character_maximum_length
FROM information_schema.columns
WHERE table_name = 'deliveries' AND column_name = 'mime_type';

