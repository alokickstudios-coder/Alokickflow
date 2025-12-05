# QC Export to Google Sheets - Complete Fix

## Problem Summary

1. **QC results not being populated** - Sheets were created but rows were empty
2. **No template usage** - Each export created a new blank sheet instead of using the template
3. **Data not extracted properly** - QC data from database wasn't being mapped correctly

## Solution Implemented

### 1. Template-Based Sheet Management

**New Service:** `lib/services/qcSheetService.ts`
- `getOrCreateProjectQcSheet()` - Manages per-project sheets
- Copies template sheet (ID: `1pEcAHxvbIAndmk5AakCOnTYEmYeHqw95ePwBfEghKx8`) for each project
- Stores sheet ID in `projects.qc_sheet_id` column
- Reuses existing sheet if project already has one

**Database Migration:** `supabase/add-qc-sheet-id.sql`
- Adds `qc_sheet_id TEXT` column to `projects` table
- Creates index for faster lookups

### 2. Comprehensive QC Data Extraction

**Updated:** `app/api/qc/export-to-sheets/route.ts`

Now extracts QC data from multiple sources:
- `deliveries.qc_errors` - Direct error array
- `deliveries.qc_report.basicQC` - Audio, loudness, dialogue, subtitles, BGM, visual quality
- `deliveries.qc_report.videoGlitch` - Video glitch detections
- `deliveries.qc_report.bgm` - BGM detection issues
- `deliveries.qc_report.premiumReport` - AI insights

All errors are combined and intelligently split into Comment-1 and Comment-2 columns.

### 3. Template Column Mapping

Data is mapped to match the exact template structure:

| Column | Data Source | Example |
|--------|-------------|---------|
| A: Concat | `{projectCode}-{episodeNumber}` | VTV0001-1 |
| B: Number | Project code | VTV0001 |
| C: English Titles | Project name | Project Name |
| D: Language | Project settings or "Chinese" | Chinese |
| E: Studio | Project settings or "AKS Dubbing" | AKS Dubbing |
| F: Episode# | Extracted from filename | 1 |
| G: Old Video | Original filename | VTV0001_001_final.mp4 |
| H: Comment-1 | Primary QC issues | Audio missing / Loudness failed |
| I: Comment-2 | Secondary QC issues | Missing dialogue at 120s |
| J: Rectified Video | Storage URL or rectified link | https://... |
| K: QC-2 Comments | Post-rectification comments | ... |
| L: Rectified SRT | SRT file link | ... |
| M: Rectified Burned | Final video link | ... |
| N: Agency Comments | Agency feedback | ... |
| O: Map | Project code | VTV0001 |
| P: Column 1 | Empty | |
| Q: Number | Project code (duplicate) | VTV0001 |
| R: English Titles | Project name (duplicate) | Project Name |
| S: COUNTA formula | Handled by template | =COUNTA(K2) |
| T: COUNTA formula | Handled by template | =COUNTA(M2) |

### 4. Data Validation

- Only exports deliveries with `qc_report` or `qc_errors`
- Filters out deliveries still in "processing" status
- Validates that QC data exists before attempting export
- Provides clear error messages if no QC data found

### 5. Logging & Debugging

**New Endpoint:** `GET /api/qc/verify-results?projectId=xxx`
- Shows QC data statistics
- Lists deliveries with/without QC reports
- Displays sample QC reports for debugging

**Enhanced Logging:**
- Logs sheet creation/copying
- Logs row preparation and data extraction
- Logs write operations with cell counts
- Verification reads to confirm data was written

## Files Changed

1. **lib/services/qcSheetService.ts** (NEW)
   - Template-based sheet management
   - Per-project sheet creation/caching

2. **app/api/qc/export-to-sheets/route.ts** (UPDATED)
   - Uses template-based approach
   - Comprehensive QC data extraction
   - Better error handling and validation

3. **app/dashboard/qc/bulk/page.tsx** (UPDATED)
   - Improved export button feedback
   - Shows if sheet is new or updated

4. **app/dashboard/qc/page.tsx** (UPDATED)
   - Same export improvements

5. **supabase/add-qc-sheet-id.sql** (NEW)
   - Database migration for `qc_sheet_id` column

6. **app/api/qc/verify-results/route.ts** (NEW)
   - Debug endpoint to verify QC data

## How to Use

### 1. Run Database Migration

```sql
-- Run this in your Supabase SQL editor
ALTER TABLE projects ADD COLUMN IF NOT EXISTS qc_sheet_id TEXT;
CREATE INDEX IF NOT EXISTS idx_projects_qc_sheet_id ON projects(qc_sheet_id) WHERE qc_sheet_id IS NOT NULL;
```

Or use the provided file:
```bash
# Apply migration via Supabase dashboard or CLI
```

### 2. Ensure QC Results Exist

Before exporting, make sure:
- Files have been uploaded via Bulk QC
- QC processing has completed (status: `qc_passed`, `qc_failed`, or `needs_review`)
- `deliveries.qc_report` contains QC data

### 3. Export QC Results

1. Navigate to QC Results page or Bulk QC page
2. Ensure you have QC results for a project
3. Click "Export to Sheets" button
4. First time: Creates new sheet from template
5. Subsequent times: Updates existing sheet
6. Sheet opens in new tab automatically

### 4. Verify Data (Debug)

Visit: `GET /api/qc/verify-results?projectId=xxx`

Shows:
- Total deliveries
- How many have QC reports
- Sample QC report structure
- Status breakdown

## Template Sheet Access

**Important:** The template sheet must be:
- Accessible to the Google account used for OAuth
- Either:
  - Publicly viewable, OR
  - Shared with the OAuth account

If you get "Permission denied" errors when copying:
1. Open the template sheet: https://docs.google.com/spreadsheets/d/1pEcAHxvbIAndmk5AakCOnTYEmYeHqw95ePwBfEghKx8/edit
2. Click "Share" → Add the Google account used in your app
3. Grant "Viewer" or "Editor" access

## Troubleshooting

### Issue: "No QC results found"
**Solution:**
- Check that QC has completed for files in the project
- Visit `/api/qc/verify-results?projectId=xxx` to see what data exists
- Ensure `deliveries.qc_report` is not null/empty

### Issue: "Failed to copy template sheet"
**Solution:**
- Verify Google OAuth is connected in Settings
- Check that template sheet is accessible to the OAuth account
- Verify template sheet ID is correct: `1pEcAHxvbIAndmk5AakCOnTYEmYeHqw95ePwBfEghKx8`

### Issue: "Sheet created but rows are empty"
**Solution:**
- Check server logs for write operation errors
- Verify QC data structure matches expected format
- Use `/api/qc/verify-results` to inspect actual QC data

### Issue: "Permission denied"
**Solution:**
- Re-authenticate Google Drive in Settings
- Check token expiration
- Verify OAuth scopes include Sheets API access

## Testing Checklist

- [ ] Run database migration
- [ ] Upload test video file
- [ ] Wait for QC to complete
- [ ] Verify QC data in database (use verify-results endpoint)
- [ ] Click "Export to Sheets"
- [ ] Verify new sheet is created (first time)
- [ ] Check that sheet has template header row
- [ ] Verify data rows are populated
- [ ] Check formulas in columns S and T work
- [ ] Export again (should update existing sheet)
- [ ] Test with multiple projects (each gets own sheet)

## Next Steps

1. **Run Migration:** Apply `supabase/add-qc-sheet-id.sql`
2. **Test Export:** Upload file, run QC, export to sheets
3. **Verify Data:** Check that rows are populated correctly
4. **Monitor Logs:** Watch server logs for any errors

The export should now work correctly with actual QC data being written to Google Sheets using your template format!



