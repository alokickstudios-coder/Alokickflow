# QC Pipeline Fixes - Summary

## Issues Fixed

### 1. Files Disappearing After Upload ✅
**Problem:** Files were cleared from UI after 3 seconds, before QC completed.

**Solution:**
- Files now stay visible with status tracking: `pending` → `queued` → `processing` → `complete`/`error`
- Added polling mechanism that checks delivery status every 2 seconds
- Files are only removed when user explicitly clears them or after successful completion
- Each file tracks its `deliveryId` for status updates

**Files Changed:**
- `components/qc/bulk-upload.tsx` - Added polling and status management

### 2. QC Jobs Not Being Created ✅
**Problem:** QC jobs were running but not being tracked in the database.

**Solution:**
- QC jobs are now created in `qc_jobs` table BEFORE processing starts
- Jobs are linked to deliveries via `delivery_id`
- Job status is updated when QC completes or fails
- Added comprehensive error handling

**Files Changed:**
- `app/api/qc/bulk-process/route.ts` - Added QC job creation and tracking

### 3. QC Results Not Showing ✅
**Problem:** QC Results page didn't show comprehensive metrics in a table format.

**Solution:**
- Created Google Sheets-style table with sortable columns
- Added columns for all QC metrics:
  - File Name, Project, Status
  - Audio Missing, Loudness (LUFS), Lip-Sync, Subtitle Timing
  - BGM Present, Video Glitches, Visual Quality
  - Created At, Actions
- Added filtering by status and search functionality
- Real-time auto-refresh every 10 seconds
- Color-coded values (green=pass, red=fail, yellow=warning)

**Files Changed:**
- `app/dashboard/qc/page.tsx` - Complete rewrite with Google Sheets-style table

### 4. Export to Google Sheets ✅
**Problem:** Export button existed but may have had issues.

**Solution:**
- Export route already exists and is functional
- Added comprehensive logging
- Better error messages
- Handles authentication via cookies or database tokens
- Creates properly formatted spreadsheet matching template format

**Files Changed:**
- `app/api/qc/export-to-sheets/route.ts` - Added logging and error handling

### 5. Logging & Error Surfacing ✅
**Problem:** Silent failures, no visibility into what went wrong.

**Solution:**
- Created centralized QC logger (`lib/utils/qc-logger.ts`)
- Added logging at key points:
  - File upload
  - QC job creation
  - QC start/completion/failure
  - Export start/completion/failure
- Client-side error messages shown in UI
- Server-side errors logged with context

**Files Changed:**
- `lib/utils/qc-logger.ts` - New logging utility
- `app/api/qc/bulk-process/route.ts` - Added logging calls
- `app/api/qc/export-to-sheets/route.ts` - Added logging calls
- `components/qc/bulk-upload.tsx` - Added client-side logging

## Current Flow

### Upload & QC Process:
1. User uploads files in Bulk QC page
2. Files are stored in Supabase Storage
3. Delivery records created with status `processing`
4. QC job records created in `qc_jobs` table
5. QC processing runs asynchronously
6. Client polls for delivery status updates
7. When QC completes, delivery status updated to `qc_passed`/`qc_failed`/`needs_review`
8. QC Results page auto-refreshes to show new results

### Export to Sheets:
1. User clicks "Export to Sheets" button
2. Backend fetches all QC results for the project
3. Creates Google Spreadsheet via Drive API
4. Populates with formatted data matching template
5. Adds formulas for COUNTA calculations
6. Formats header row (bold, dark background, frozen)
7. Makes sheet publicly viewable
8. Returns sheet URL to client
9. Client opens sheet in new tab

## Database Tables Used

- `deliveries` - Stores file uploads and QC results
- `qc_jobs` - Tracks QC processing jobs
- `projects` - Project information
- `profiles` - User/vendor information
- `organizations` - Organization information

## Environment Variables Required

### For Free Features (Required):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

### For Google Drive/Sheets Export (Optional):
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- Or configured via Settings UI (stored in `app_settings` table)

### For Paid QC Features (Optional):
- `GROQ_API_KEY` - For Whisper transcription
- `CF_ACCOUNT_ID` + `CF_API_TOKEN` - For Cloudflare Whisper
- `DEEPSEEK_API_KEY` - For premium AI reports
- `LIPSYNC_SERVICE_URL` + `LIPSYNC_API_KEY` - For lip-sync detection

## Testing Checklist

- [ ] Upload a video file in Bulk QC
- [ ] Verify file stays visible with status updates
- [ ] Check that delivery record is created in database
- [ ] Check that QC job record is created
- [ ] Verify QC processing completes
- [ ] Check that delivery status updates correctly
- [ ] Verify QC Results page shows the file
- [ ] Test sorting by different columns
- [ ] Test filtering by status
- [ ] Test search functionality
- [ ] Click "Export to Sheets" button
- [ ] Verify Google Sheet is created
- [ ] Verify data is correctly formatted
- [ ] Check server logs for any errors

## Known Limitations

1. **Google Drive Upload**: Currently files are uploaded to Supabase Storage. Google Drive upload integration exists but is not automatically triggered in Bulk QC flow. Files can be manually uploaded to Drive via the Drive Uploader component.

2. **Polling**: Client polls every 2 seconds for up to 5 minutes. For very long QC jobs, consider implementing WebSocket updates or server-sent events.

3. **Batch Processing**: QC jobs are processed sequentially. For large batches, consider implementing a proper queue system (BullMQ, etc.).

## Next Steps (Optional Enhancements)

1. **Google Drive Auto-Upload**: Automatically upload files to Google Drive when uploaded in Bulk QC
2. **WebSocket Updates**: Replace polling with real-time WebSocket updates
3. **Queue System**: Implement proper job queue for better scalability
4. **Email Notifications**: Send email when QC completes
5. **QC Templates**: Allow organizations to customize QC checks
6. **Bulk Actions**: Select multiple results and export/delete in bulk



