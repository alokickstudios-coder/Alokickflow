# QC Upload Error Fixes

## Problem Identified

Files were showing "error" status immediately after upload, and QC was not completing. The issues were:

1. **Silent failures in upload**: When files failed to upload to Supabase Storage or create delivery records, the API would just `continue` to the next file without reporting the error to the frontend.

2. **No error messages**: The frontend couldn't tell which files failed or why, so all files without delivery IDs were marked as "error" with no explanation.

3. **Response structure mismatch**: The API response format didn't match what the frontend expected, causing files to not be matched correctly.

## Fixes Applied

### 1. Enhanced Error Tracking in API (`app/api/qc/bulk-process/route.ts`)

**Before:**
```typescript
if (uploadError) {
  console.error("Upload error:", uploadError);
  continue; // Silent failure
}
```

**After:**
```typescript
const errors: Array<{ fileName: string; error: string }> = [];

// Track errors for each file
if (uploadError) {
  errorMessage = `Storage upload failed: ${uploadError.message}`;
  errors.push({ fileName, error: errorMessage });
  continue;
}
```

**Changes:**
- Collect all errors in an `errors` array
- Return errors in API response
- Return 400 error if ALL files fail
- Include `mime_type` in delivery record

### 2. Improved Frontend Error Handling (`components/qc/bulk-upload.tsx`)

**Before:**
```typescript
// Files matched by index - unreliable
const job = jobs[index];
const deliveryId = job?.fileId || result?.deliveryId;
status: deliveryId ? "queued" : "error" // No error message
```

**After:**
```typescript
// Files matched by filename - reliable
const jobMap = new Map<string, any>();
jobs.forEach((job: any) => {
  jobMap.set(job.fileName, job);
});

const errorMap = new Map<string, string>();
errors.forEach((err: any) => {
  errorMap.set(err.fileName, err.error);
});

// Match by filename and show specific errors
if (error) {
  return {
    ...f,
    status: "error",
    error: error, // Specific error message
  };
}
```

**Changes:**
- Match files by filename instead of index (more reliable)
- Store error messages per file
- Display error messages in UI
- Show appropriate toasts for partial/full failures

### 3. Error Display in UI

Added error message display below file status:
```typescript
{file.error && file.status === "error" && (
  <p className="text-xs text-red-400 mt-1 truncate" title={file.error}>
    {file.error}
  </p>
)}
```

### 4. Better Toast Messages

- **All files failed**: Shows error message
- **Partial success**: Shows count of successful vs failed
- **All success**: Shows success message

## Common Error Scenarios

### 1. Storage Upload Failure
**Error**: `Storage upload failed: [message]`
**Causes**:
- Supabase Storage bucket not configured
- Storage quota exceeded
- Network issues
- Invalid file type

**Fix**: Check Supabase Storage configuration and bucket permissions

### 2. Delivery Creation Failure
**Error**: `Delivery creation failed: [message]`
**Causes**:
- Database constraint violations
- Missing required fields
- RLS policy blocking insert

**Fix**: Check database schema and RLS policies

### 3. No Project Found
**Error**: `No project found. Please create a project first.`
**Causes**:
- Organization has no projects
- Project was deleted

**Fix**: Create a project before uploading files

### 4. Subscription/Feature Gating
**Error**: `QC feature not available - Upgrade to enable automated QC`
**Causes**:
- Organization subscription tier doesn't include QC
- QC feature disabled

**Fix**: Upgrade subscription or enable QC feature

## Testing Checklist

- [ ] Upload single file - should show success
- [ ] Upload multiple files - should show progress for each
- [ ] Upload invalid file type - should show specific error
- [ ] Upload when storage full - should show storage error
- [ ] Upload without project - should show project error
- [ ] Upload with subscription issue - should show upgrade message
- [ ] Check error messages are displayed in UI
- [ ] Verify polling starts for successful uploads
- [ ] Check QC results appear after processing

## Debugging

### Check Server Logs
Look for:
- `[BulkQC] Upload error for [filename]:` - Storage issues
- `[BulkQC] Delivery creation error for [filename]:` - Database issues
- `[BulkQC] Successfully created delivery [id] for [filename]` - Success

### Check Frontend Console
Look for:
- `[BulkQCUpload] Upload response:` - API response structure
- `[BulkQCUpload] Starting polling for [N] deliveries:` - Polling started
- `[BulkQCUpload] File [name] status changed:` - Status updates

### Use Verify Endpoint
Visit `/api/qc/verify-results?projectId=xxx` to see:
- Total deliveries
- Deliveries with QC reports
- Sample QC data structure

## Next Steps

1. **Monitor Error Rates**: Track which errors occur most frequently
2. **Improve Error Messages**: Make them more user-friendly
3. **Add Retry Logic**: Allow users to retry failed uploads
4. **Batch Error Handling**: Show all errors at once instead of one-by-one
5. **Storage Quota Warnings**: Warn users before quota is exceeded



