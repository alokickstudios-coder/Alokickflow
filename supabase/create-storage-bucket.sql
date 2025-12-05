-- =====================================================
-- Create Storage Bucket for Deliveries
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

-- =====================================================
-- NOTE: Storage Bucket Policies
-- =====================================================
-- Storage policies cannot be created via SQL in Supabase
-- You need to create them via the Dashboard or Management API
-- 
-- After creating the bucket, go to:
-- Supabase Dashboard → Storage → Buckets → deliveries → Policies
-- 
-- Or use the Management API with service role key
-- See: supabase/create-storage-policies-via-api.md

-- Verify bucket was created
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id = 'deliveries';

