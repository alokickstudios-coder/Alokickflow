# QC Pipeline Implementation - Environment-Agnostic Architecture

## Overview

The QC pipeline has been completely refactored to be **environment-agnostic** and work seamlessly across:
- **Local Dev** - Manual triggers or dev tools
- **Vercel** - Serverless functions with cron
- **Dedicated Server** - Long-running worker process

## Architecture Components

### 1. Database Schema

**File**: `supabase/qc-jobs-schema-update.sql`

Updates `qc_jobs` table with:
- `source_type` ('upload' | 'drive_link')
- `source_path` (storage path or Drive file ID)
- `file_name` (original filename)
- `result_json` (complete QC results)
- Status enum: 'queued', 'running', 'completed', 'failed'

**Run this migration** in your Supabase dashboard.

### 2. Entry Point: `/api/qc/start`

**Purpose**: Enqueue jobs, return immediately

**Flow**:
1. Validates user & subscription
2. Handles file uploads OR Google Drive links
3. Uploads files to Supabase Storage (if needed)
4. Creates `qc_jobs` records with status 'queued'
5. Returns job IDs immediately (< 1 second)

**No heavy processing** - just enqueues jobs.

### 3. Worker Core: `lib/services/qc/worker.ts`

**Functions**:
- `processNextQcJob()` - Process one job from queue
- `processBatch(limit)` - Process multiple jobs

**Logic** (environment-agnostic):
1. Select oldest 'queued' job
2. Mark as 'running'
3. Resolve file (Drive API or Storage download)
4. Run QC engine
5. Save results to `result_json`
6. Update delivery (if linked)
7. Mark as 'completed' or 'failed'

### 4. Worker Invocation: `/api/qc/process-queue`

**Modes**:

**A. Local Dev**:
```bash
# Manual trigger
GET /api/qc/process-queue?limit=5

# Or via browser console
fetch('/api/qc/process-queue?limit=5')
```

**B. Vercel**:
- Vercel Cron (configured in `vercel.json`)
- Runs every 2 minutes
- Processes 5 jobs per invocation

**C. Dedicated Server**:
```bash
npm run qc:worker
# Runs infinite loop, processing 10 jobs per batch
```

### 5. Status Polling: `/api/qc/job-status`

**Endpoint**: `GET /api/qc/job-status?jobIds=xxx,yyy,zzz`

**Returns**:
- Job status (queued, running, completed, failed)
- Summary (passed, score, error count)
- Error message if failed

**Frontend**: Polls every 2 seconds until complete.

### 6. QC Engine: `lib/services/qc/engine.ts`

**Function**: `runQcForJob(job, context, features)`

**Modules** (all environment-agnostic):
- `basicQc.ts` - FREE checks (ffmpeg-based, no API keys)
- `lipSyncQc.ts` - Paid (external service, env vars)
- `videoGlitchQc.ts` - FREE (ffmpeg)
- `bgmQc.ts` - FREE (ffmpeg)
- `premiumReport.ts` - Paid (DeepSeek LLM, env vars)

**Provider Detection**: `config/qcProviders.ts`
- Checks env vars for API keys
- Returns "skipped" if not configured
- Never fails entire QC if premium module unavailable

### 7. QC Results Display

**Source**: `qc_jobs` table (not deliveries)

**Page**: `app/dashboard/qc/page.tsx`

**Query**:
```sql
SELECT * FROM qc_jobs 
WHERE organisation_id = ? 
  AND status = 'completed'
ORDER BY created_at DESC
```

**Display**:
- File name, Project, Status, Score
- QC metrics (audio, loudness, lip-sync, etc.)
- Expandable detailed report

### 8. Google Sheets Export

**Function**: `getOrCreateProjectQcSheet(projectId)`

**Flow**:
1. Check `projects.qc_sheet_id`
2. If exists, use it
3. If not, copy template sheet (ID: `1pEcAHxvbIAndmk5AakCOnTYEmYeHqw95ePwBfEghKx8`)
4. Save sheet ID to project

**Export**:
1. Query `qc_jobs` for project
2. Map to template columns
3. Write rows starting at row 2
4. Preserve header + formulas

## File Input Handling

### Uploads
1. File uploaded via FormData
2. Stored to Supabase Storage
3. `source_type = 'upload'`
4. `source_path = storage bucket path`

### Google Drive Links
1. Link parsed, Drive file ID extracted
2. `source_type = 'drive_link'`
3. `source_path = Drive file ID`
4. File downloaded during worker processing

## Environment Setup

### Local Dev

1. **Start dev server**:
   ```bash
   npm run dev
   ```

2. **Trigger worker manually**:
   - Visit: `http://localhost:3000/api/qc/process-queue?limit=5`
   - Or add dev button in UI

3. **Or run standalone worker**:
   ```bash
   npm run qc:worker
   ```

### Vercel

1. **Deploy to Vercel**
2. **Configure cron** (already in `vercel.json`):
   - Runs every 2 minutes
   - Calls `/api/qc/process-queue`
3. **Set environment variables**:
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `GROQ_API_KEY` (optional)
   - `DEEPSEEK_API_KEY` (optional)
   - `LIPSYNC_SERVICE_URL` (optional)
   - `LIPSYNC_API_KEY` (optional)

### Dedicated Server

1. **Deploy worker script**:
   ```bash
   npm run qc:worker
   ```

2. **Or use PM2**:
   ```bash
   pm2 start scripts/qcWorker.ts --name qc-worker
   ```

3. **Same environment variables** as Vercel

## Testing Flow

1. **Upload file** or **add Drive link** on Bulk QC page
2. **Click "Start Bulk QC Analysis"**
3. **Jobs queued** - API returns immediately with job IDs
4. **Worker processes** - Either:
   - Manual trigger (dev)
   - Cron job (Vercel)
   - Standalone worker (server)
5. **Frontend polls** - Status updates every 2 seconds
6. **Results appear** - In QC Results table
7. **Export to Sheets** - Creates/updates per-project sheet

## Key Files

- `app/api/qc/start/route.ts` - Enqueue jobs
- `app/api/qc/process-queue/route.ts` - Worker invocation
- `app/api/qc/job-status/route.ts` - Status polling
- `lib/services/qc/worker.ts` - Core worker logic
- `lib/services/qc/engine.ts` - QC engine
- `components/qc/bulk-upload.tsx` - Frontend upload
- `app/dashboard/qc/page.tsx` - Results display
- `scripts/qcWorker.ts` - Standalone worker script
- `vercel.json` - Cron configuration

## Migration Steps

1. **Run database migration**:
   ```sql
   -- Run supabase/qc-jobs-schema-update.sql in Supabase dashboard
   ```

2. **Update environment variables** (if needed):
   - Add `WORKER_AUTH_TOKEN` (optional, for manual triggers)
   - Add `CRON_SECRET` (optional, for cron auth)

3. **Deploy to Vercel**:
   - Cron will auto-configure from `vercel.json`

4. **Test locally**:
   - Upload file
   - Trigger worker: `GET /api/qc/process-queue?limit=5`
   - Verify results appear

## Troubleshooting

### Jobs stuck in "queued"
- Check worker is running (cron or manual trigger)
- Check server logs for errors
- Verify `SUPABASE_SERVICE_ROLE_KEY` is set

### Jobs failing
- Check `qc_jobs.error_message` field
- Verify file can be downloaded (Storage or Drive)
- Check QC engine logs

### No results in table
- Ensure jobs have `status = 'completed'`
- Check `result_json` is populated
- Verify organization_id matches

### Export empty
- Check `qc_jobs` has completed jobs for project
- Verify Google OAuth is connected
- Check template sheet is accessible

## Next Steps

1. Run database migration
2. Test locally with manual worker trigger
3. Deploy to Vercel
4. Verify cron is running
5. Test end-to-end flow

The system is now fully environment-agnostic and ready for production!



