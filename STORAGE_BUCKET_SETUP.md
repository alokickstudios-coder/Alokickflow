# Storage Bucket Setup Guide

## Quick Fix: Create the "deliveries" Bucket

The error "Bucket not found" means the Supabase Storage bucket doesn't exist. Here's how to fix it:

## Option 1: Via Supabase Dashboard (Easiest)

1. **Go to Supabase Dashboard** → Your Project → **Storage** → **Buckets**
2. Click **"New bucket"**
3. Fill in:
   - **Name**: `deliveries`
   - **Public**: ❌ No (keep it private)
   - **File size limit**: `5368709120` (5GB)
   - **Allowed MIME types**: 
     - `video/*`
     - `audio/*`
     - `text/*`
     - `application/x-subrip`
     - `application/octet-stream`
4. Click **"Create bucket"**

## Option 2: Via SQL (Simple Version)

1. **Go to Supabase Dashboard** → **SQL Editor**
2. **Copy and paste** the contents of `supabase/create-storage-bucket-simple.sql`
3. **Run the query**
4. You should see the bucket in the results

## Option 3: Via SQL (Full Version - May Require Permissions)

If you have owner permissions, you can use `supabase/create-storage-bucket.sql` which includes policy creation.

**Note**: If you get "must be owner of table objects" error, use Option 1 or 2 instead.

## After Creating the Bucket

### Set Up Storage Policies (Required for Security)

Storage policies control who can upload/download files. You need to create them via the Dashboard:

1. **Go to**: Storage → Buckets → `deliveries` → **Policies** tab
2. **Click "New Policy"** → **"For full customization"**

Create these 4 policies:

#### Policy 1: Upload (INSERT)
- **Name**: `Users can upload to their organization folder`
- **Operation**: `INSERT`
- **Target roles**: `authenticated`
- **Policy definition**:
```sql
bucket_id = 'deliveries' AND
(storage.foldername(name))[1] IN (
  SELECT organization_id::text FROM profiles WHERE id = auth.uid()
)
```

#### Policy 2: View (SELECT)
- **Name**: `Users can view files in their organization`
- **Operation**: `SELECT`
- **Target roles**: `authenticated`
- **Policy definition**:
```sql
bucket_id = 'deliveries' AND
(storage.foldername(name))[1] IN (
  SELECT organization_id::text FROM profiles WHERE id = auth.uid()
)
```

#### Policy 3: Update (UPDATE)
- **Name**: `Users can update files in their organization`
- **Operation**: `UPDATE`
- **Target roles**: `authenticated`
- **Policy definition**:
```sql
bucket_id = 'deliveries' AND
(storage.foldername(name))[1] IN (
  SELECT organization_id::text FROM profiles WHERE id = auth.uid()
)
```

#### Policy 4: Delete (DELETE)
- **Name**: `Admins can delete files in their organization`
- **Operation**: `DELETE`
- **Target roles**: `authenticated`
- **Policy definition**:
```sql
bucket_id = 'deliveries' AND
(storage.foldername(name))[1] IN (
  SELECT organization_id::text FROM profiles 
  WHERE id = auth.uid() AND role IN ('admin', 'super_admin', 'owner')
)
```

## Verify Setup

1. **Check bucket exists**: Storage → Buckets → Should see "deliveries"
2. **Check policies**: Storage → Buckets → deliveries → Policies → Should see 4 policies
3. **Test upload**: Try uploading a file again in your app

## Troubleshooting

### "Bucket not found" error persists
- Verify bucket name is exactly `deliveries` (case-sensitive)
- Check you're using the correct Supabase project
- Refresh the page and try again

### "Permission denied" when uploading
- Check that storage policies are created correctly
- Verify your user has an `organization_id` in the `profiles` table
- Check that the file path starts with your `organization_id`

### "File size limit exceeded"
- Default limit is 5GB (5368709120 bytes)
- Increase in bucket settings if needed

## Quick Test

After setup, test the upload again. The error should be resolved!



