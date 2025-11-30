-- ============================================
-- Storage Bucket RLS Policies
-- Run this in Supabase SQL Editor after creating buckets
-- ============================================

-- Create the 'deliveries' storage bucket first via Supabase Dashboard
-- Then apply these RLS policies:

-- Policy: Users can upload to their organization folder
CREATE POLICY "Users can upload to their organization folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'deliveries' AND
  (storage.foldername(name))[1] IN (
    SELECT organization_id::text FROM profiles WHERE id = auth.uid()
  )
);

-- Policy: Users can view their organization files
CREATE POLICY "Users can view their organization files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'deliveries' AND
  (storage.foldername(name))[1] IN (
    SELECT organization_id::text FROM profiles WHERE id = auth.uid()
  )
);

-- Policy: Users can update their organization files
CREATE POLICY "Users can update their organization files"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'deliveries' AND
  (storage.foldername(name))[1] IN (
    SELECT organization_id::text FROM profiles WHERE id = auth.uid()
  )
);

-- Policy: Admins can delete their organization files
CREATE POLICY "Admins can delete their organization files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'deliveries' AND
  (storage.foldername(name))[1] IN (
    SELECT organization_id::text 
    FROM profiles 
    WHERE id = auth.uid() AND role IN ('super_admin', 'admin', 'qc')
  )
);

