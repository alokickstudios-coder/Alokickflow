-- =====================================================
-- Create Storage Bucket for Deliveries (Simple Version)
-- Run this in Supabase SQL Editor
-- =====================================================

-- Create storage bucket for deliveries if not exists
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'deliveries',
    'deliveries',
    false, -- Private bucket
    5368709120, -- 5GB max file size
    ARRAY[
        'video/*',
        'audio/*',
        'text/*',
        'application/x-subrip', -- SRT files
        'application/octet-stream'
    ]
)
ON CONFLICT (id) DO UPDATE SET
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Verify bucket was created
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id = 'deliveries';

-- =====================================================
-- NEXT STEPS: Create Storage Policies
-- =====================================================
-- After running this script, create policies via Dashboard:
-- 
-- 1. Go to: Supabase Dashboard → Storage → Buckets → deliveries
-- 2. Click "Policies" tab
-- 3. Create the following policies (or use "New Policy" → "For full customization"):
--
-- Policy 1: "Users can upload to their organization folder"
--   - Operation: INSERT
--   - Target roles: authenticated
--   - Policy definition:
--     bucket_id = 'deliveries' AND
--     (storage.foldername(name))[1] IN (
--       SELECT organization_id::text FROM profiles WHERE id = auth.uid()
--     )
--
-- Policy 2: "Users can view files in their organization"
--   - Operation: SELECT
--   - Target roles: authenticated
--   - Policy definition:
--     bucket_id = 'deliveries' AND
--     (storage.foldername(name))[1] IN (
--       SELECT organization_id::text FROM profiles WHERE id = auth.uid()
--     )
--
-- Policy 3: "Users can update files in their organization"
--   - Operation: UPDATE
--   - Target roles: authenticated
--   - Policy definition:
--     bucket_id = 'deliveries' AND
--     (storage.foldername(name))[1] IN (
--       SELECT organization_id::text FROM profiles WHERE id = auth.uid()
--     )
--
-- Policy 4: "Admins can delete files in their organization"
--   - Operation: DELETE
--   - Target roles: authenticated
--   - Policy definition:
--     bucket_id = 'deliveries' AND
--     (storage.foldername(name))[1] IN (
--       SELECT organization_id::text FROM profiles 
--       WHERE id = auth.uid() AND role IN ('admin', 'super_admin', 'owner')
--     )



