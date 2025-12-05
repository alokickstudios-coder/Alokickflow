# QC Pipeline Architecture - Environment-Agnostic

## Overview

The QC pipeline is designed to work in three environments:
1. **Local Dev** - Manual triggers or dev tools
2. **Vercel** - Serverless functions with cron
3. **Dedicated Server** - Long-running worker process

All environments use the same core logic - only orchestration differs.

## Architecture

### 1. Job Queue Model

**Table: `qc_jobs`**
- `id` (uuid) - Job identifier
- `organisation_id` (uuid) - Organization
- `project_id` (uuid) - Project/Series
- `episode_id` (uuid) - Episode/Delivery
- `delivery_id` (uuid) - Optional delivery link
- `source_type` ('upload' | 'drive_link') - File source
- `source_path` (text) - Storage path or Drive file ID
- `file_name` (text) - Original filename
- `status` ('queued' | 'running' | 'completed' | 'failed')
- `qc_type` (text) - QC type (basic, full, etc.)
- `result_json` (jsonb) - Complete QC results
- `error_message` (text) - Error if failed
- `created_at`, `updated_at`, `started_at`, `completed_at`

### 2. Entry Point: `/api/qc/start`

**Purpose**: Enqueue jobs, don't process

**Flow**:
1. Validate user & subscription
2. Handle uploads OR drive links
3. Upload files to storage (if needed)
4. Create `qc_jobs` records with status 'queued'
5. Return job IDs immediately

**No heavy processing** - returns in < 1 second

### 3. Worker: `services/qc/worker.ts`

**Core Functions**:
- `processNextQcJob()` - Process one job
- `processBatch(limit)` - Process multiple jobs

**Logic**:
1. Select oldest 'queued' job
2. Mark as 'running'
3. Resolve file (Drive or Storage)
4. Run QC engine
5. Save results to `result_json`
6. Update delivery (if linked)
7. Mark as 'completed' or 'failed'

**Environment-agnostic** - pure business logic

### 4. Worker Invocation: `/api/qc/process-queue`

**Modes**:

**A. Local Dev**:
- Manual trigger: `GET /api/qc/process-queue?limit=5`
- Dev button in UI
- Browser interval (temporary)

**B. Vercel**:
- Vercel Cron: `POST /api/qc/process-queue` every 1-5 minutes
- Or on-demand API calls

**C. Dedicated Server**:
- Standalone script: `scripts/qcWorker.ts`
- Infinite loop calling `processBatch(10)`

### 5. Status Polling: `/api/qc/job-status`

**Endpoint**: `GET /api/qc/job-status?jobId=xxx` or `?jobIds=xxx,yyy`

**Returns**:
- Job status (queued, running, completed, failed)
- Summary (passed, score, error count)
- Error message if failed

**Frontend**: Polls every 2-5 seconds until complete

### 6. QC Engine: `services/qc/engine.ts`

**Function**: `runQcForJob(job, context, features)`

**Modules**:
- `basicQc.ts` - FREE checks (ffmpeg-based)
- `lipSyncQc.ts` - Paid (external service)
- `videoGlitchQc.ts` - FREE (ffmpeg)
- `bgmQc.ts` - FREE (ffmpeg)
- `premiumReport.ts` - Paid (DeepSeek LLM)

**Environment checks**: Via `config/qcProviders.ts`
- Checks env vars for API keys
- Returns "skipped" if not configured
- Never fails entire QC if premium module unavailable

### 7. QC Results Display

**Source**: `qc_jobs` table (not deliveries)

**Query**:
```sql
SELECT * FROM qc_jobs 
WHERE organisation_id = ? 
  AND status = 'completed'
ORDER BY created_at DESC
```

**Display**:
- File name
- Project
- Status (passed/failed/needs_review)
- Score
- QC metrics (audio, loudness, lip-sync, etc.)
- Error details

### 8. Google Sheets Export

**Function**: `getOrCreateProjectQcSheet(projectId)`

**Flow**:
1. Check `projects.qc_sheet_id`
2. If exists, use it
3. If not, copy template sheet
4. Save sheet ID to project

**Export**:
1. Query `qc_jobs` for project
2. Map to template columns
3. Write rows starting at row 2
4. Preserve header + formulas

## Environment Configuration

### Local Dev
- Manual worker trigger
- Dev UI button
- Browser polling (temporary)

### Vercel
- Cron job: `vercel.json` or dashboard
- Process 3-5 jobs per invocation
- Max duration: 300s

### Dedicated Server
- Standalone Node script
- Infinite loop
- Process 10 jobs per batch
- Sleep 2s between batches

## File Resolution

### Uploads (`source_type = 'upload'`)
- `source_path` = Supabase Storage path
- Download from `deliveries` bucket
- Save to temp location
- Process
- Cleanup temp file

### Drive Links (`source_type = 'drive_link'`)
- `source_path` = Google Drive file ID
- Get access token (from DB or env)
- Download via Drive API
- Save to temp location
- Process
- Cleanup temp file

## Error Handling

- Job failures: Mark as 'failed', store error_message
- Module failures: Log, continue with other modules
- File resolution failures: Mark job as failed
- Worker crashes: Job stays 'running', manual cleanup needed

## Logging

- Server: Console logs with `[QCWorker]`, `[QCEngine]` prefixes
- Client: Polling status updates
- Errors: Stored in `qc_jobs.error_message`

## Testing

1. **Local**: Upload file → Check job queued → Trigger worker → Verify results
2. **Vercel**: Deploy → Upload → Wait for cron → Verify results
3. **Server**: Run worker script → Upload → Verify processing



