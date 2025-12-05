# QC Export to Google Sheets - Implementation Summary

## Overview

The QC export functionality now uses a **template-based approach** where each project gets its own Google Sheet copied from a master template. This ensures consistent formatting, formulas, and structure across all project sheets.

## Template Sheet

**Template ID:** `1pEcAHxvbIAndmk5AakCOnTYEmYeHqw95ePwBfEghKx8`

The template contains:
- Pre-formatted header row with column names
- Formulas for COUNTA calculations (columns S and T)
- Formatting (bold headers, frozen first row, dark background)
- Example data showing the expected format

## Database Schema Changes

### Added to `projects` table:
```sql
ALTER TABLE projects ADD COLUMN IF NOT EXISTS qc_sheet_id TEXT;
```

This stores the Google Sheet ID for each project's QC results sheet.

**Migration:** Run `supabase/add-qc-sheet-id.sql` to add this column.

## Implementation Details

### 1. QC Sheet Service (`lib/services/qcSheetService.ts`)

**Function:** `getOrCreateProjectQcSheet(projectId, accessToken)`

- Checks if project already has a `qc_sheet_id`
- If exists: Returns existing sheet ID and URL
- If not: 
  - Copies template sheet using Google Drive API `files.copy`
  - Renames to `${projectCode} - QC Sheet`
  - Saves new sheet ID to `projects.qc_sheet_id`
  - Returns new sheet ID and URL

### 2. Export Route (`app/api/qc/export-to-sheets/route.ts`)

**Flow:**
1. Authenticate user and get organization
2. Get Google access token (from cookies or database)
3. Call `getOrCreateProjectQcSheet()` to get project's sheet
4. Fetch QC results from `deliveries` table:
   - Filter by project_id and organization_id
   - Only include deliveries with `qc_report` (completed QC)
   - Status: `qc_passed`, `qc_failed`, `needs_review`
5. Extract QC data from `qc_report` JSONB field:
   - Basic QC results (audio, loudness, dialogue, subtitles, BGM, visual quality)
   - Video glitch results
   - Lip-sync results (if available)
   - Premium report (if available)
6. Map data to template columns:
   - **A:** Concat (e.g., VTV0001-1)
   - **B:** Number (project code)
   - **C:** English Titles (project name)
   - **D:** Language (from project settings or default "Chinese")
   - **E:** Studio (from project settings or default "AKS Dubbing")
   - **F:** Episode# (extracted from filename)
   - **G:** Old Video (original filename)
   - **H:** Comment-1 (primary QC issues)
   - **I:** Comment-2 (secondary QC issues)
   - **J:** Rectified Video (storage URL or rectified link)
   - **K:** QC-2 Comments (post-rectification comments)
   - **L:** Rectified SRT file link
   - **M:** Rectified Burned Video link
   - **N:** Agency Comments
   - **O:** Map (project code)
   - **P:** Column 1 (empty)
   - **Q:** Number (project code duplicate)
   - **R:** English Titles (project name duplicate)
   - **S:** COUNTA formula (handled by template)
   - **T:** COUNTA formula (handled by template)
7. Write rows starting at row 2 (preserving header row)
8. Return sheet URL to frontend

### 3. Data Extraction

The export route extracts QC data from multiple sources:

**From `deliveries.qc_errors` (JSONB array):**
- Direct error objects with type, message, timestamp, severity

**From `deliveries.qc_report` (JSONB object):**
- `basicQC.audioMissing` - Audio missing detection
- `basicQC.loudness` - Loudness compliance (EBU R128)
- `basicQC.missingDialogue` - Missing dialogue segments
- `basicQC.subtitleTiming` - Subtitle timing errors
- `basicQC.visualQuality` - Visual quality issues
- `videoGlitch.glitches` - Video glitch detections
- `bgm.issues` - BGM detection issues
- `premiumReport` - AI-generated insights

All errors are combined and split into Comment-1 and Comment-2 columns.

### 4. Episode Number Extraction

The system tries multiple patterns to extract episode numbers:
- `_001_` or `-001-` patterns
- `EP001` or `EP-001` patterns
- `episode_1` patterns
- Falls back to index + 1 if no pattern matches

### 5. Frontend Integration

**Bulk QC Page** (`app/dashboard/qc/bulk/page.tsx`):
- "Export to Sheets" button calls `/api/qc/export-to-sheets`
- Shows loading state during export
- Opens sheet in new tab on success
- Shows success message with row count

**QC Results Page** (`app/dashboard/qc/page.tsx`):
- Same export functionality
- Button disabled if no project selected or no results

## Logging

Comprehensive logging added:
- Sheet creation/copying
- Row count and data preparation
- Write operations
- Verification reads
- Error details with stack traces

All logs use the centralized `qcLogger` utility.

## Error Handling

- **No Google auth:** Clear error message directing user to Settings
- **No QC results:** Returns 404 with helpful message
- **Sheet creation fails:** Detailed error with Google API response
- **Write fails:** Logs error and returns 500 with details

## Testing Checklist

- [ ] Run migration to add `qc_sheet_id` column
- [ ] Upload a video file and run QC
- [ ] Verify QC results are saved in `deliveries.qc_report`
- [ ] Click "Export to Sheets" button
- [ ] Verify new sheet is created (first time) or existing sheet is updated
- [ ] Check that sheet has correct header row from template
- [ ] Verify data rows are populated with QC results
- [ ] Check that formulas in columns S and T work correctly
- [ ] Test with multiple projects (each should get its own sheet)
- [ ] Test with projects that already have sheets (should update, not create new)

## Future Enhancements

1. **Incremental Updates:** Only append new rows instead of rewriting all
2. **Sheet Tabs:** Create separate tabs for different QC passes
3. **Date Filtering:** Allow exporting only results from a date range
4. **Batch Export:** Export multiple projects at once
5. **Sheet Permissions:** Allow configuring who can view/edit sheets
6. **Webhook Updates:** Automatically update sheets when QC completes



