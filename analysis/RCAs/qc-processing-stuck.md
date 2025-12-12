# RCA: QC Processing Stuck at 5%

**Incident ID:** QC-STUCK-001
**Date:** 2024-12-12
**Severity:** P0 - Critical
**Status:** Root Cause Identified

---

## Summary

QC jobs consistently get stuck at 5% progress and never complete. Users see processing indicators that never advance, and jobs remain in "running" state indefinitely until auto-recovery marks them as failed.

---

## Reproduction Steps

1. Navigate to QC page
2. Upload or link a video file from Google Drive
3. Click "Run QC"
4. Observe progress stays at 5%
5. After 2 minutes, auto-recovery marks job as "failed"

### Reproduction Script

```bash
# analysis/repro/stuck-at-5-percent.sh
#!/bin/bash
set -e

# 1. Create a test job via API
JOB_ID=$(curl -s -X POST "https://alokickflow.onrender.com/api/qc/jobs" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{"fileName":"test.mp4","sourceType":"upload","sourcePath":"test/path"}' \
  | jq -r '.id')

echo "Created job: $JOB_ID"

# 2. Trigger processing
curl -s -X POST "https://alokickflow.onrender.com/api/qc/process-queue" \
  -H "Content-Type: application/json" \
  -H "x-internal-trigger: true" \
  -d '{"limit":1}'

# 3. Poll for progress
for i in {1..30}; do
  PROGRESS=$(curl -s "https://alokickflow.onrender.com/api/qc/progress?jobId=$JOB_ID" \
    | jq -r '.progress')
  echo "Poll $i: Progress = $PROGRESS%"
  
  if [ "$PROGRESS" == "100" ]; then
    echo "SUCCESS: Job completed"
    exit 0
  fi
  
  sleep 5
done

echo "FAILURE: Job stuck at $PROGRESS%"
exit 1
```

---

## Logs & Evidence

### Server Logs (from /api/health/full)

```json
{
  "qc_worker": {
    "status": "error",
    "message": "2 stuck job(s)",
    "details": {
      "queued": 0,
      "running": 2,
      "completed": 1,
      "failed": 0,
      "stuck": 2
    }
  }
}
```

### Worker Logs (from Render)

```
[QCWorker] ========== START JOB abc123 ==========
[QCWorker] File: test.mp4, Source: drive_link
[QCWorker] Job abc123: 5% (initializing)
[QCWorker] Loading features for org xyz789
[QCWorker] Features: lipSync=false, bgm=true
[QCWorker] Job abc123: 10% (features_loaded)
[QCWorker] Job abc123: 15% (downloading)
[QCWorker] Resolving Drive file 1ABC... for job abc123
-- NO FURTHER LOGS --
```

---

## Root Causes Identified

### Primary Cause: Silent Exception in Google Drive Token Retrieval

**Location:** `lib/services/qc/worker.ts:400-408`

```typescript
async function isJobCancelled(jobId, adminClient): Promise<boolean> {
  try {
    const { data } = await adminClient!
      .from("qc_jobs")
      .select("status")
      .eq("id", jobId)
      .single();
    
    return data?.status === "cancelled" || data?.status === "paused";
  } catch {
    return false;  // ← SILENT FAILURE - masks DB errors
  }
}
```

When database connection fails or times out, this returns `false` (job not cancelled), causing the worker to proceed with invalid state.

### Secondary Cause: Token Expired Without Refresh

**Location:** `lib/services/qc/worker.ts:680-700`

The Google Drive access token stored at job creation can expire before processing begins. The token refresh logic in lines 1040-1070 has multiple empty catch blocks that swallow OAuth errors.

### Contributing Cause: No Heartbeat Mechanism

There's no watchdog that monitors if a job is making progress. The 2-minute timeout in `processBatch` only kicks in after the fact, not during stuck downloads.

---

## Timeline of Failure

```
T+0s:    Job created, status="queued"
T+0s:    Worker picks up job, status="running", progress=5%
T+2s:    Feature check complete, progress=10%
T+3s:    Download starts, progress=15%
T+3s:    Google Drive token validation fails (silently)
T+3s:    Download fetch returns 401 (unauthenticated)
T+3s:    Error thrown but not caught at correct level
T+120s:  Auto-recovery detects stuck job, marks as "failed"
```

---

## Fix Strategy

### Fix 1: Replace Silent Catches with Structured Error Handling

```typescript
// BEFORE
} catch {
  return false;
}

// AFTER
} catch (error) {
  console.error(`[QCWorker] isJobCancelled check failed for ${jobId}:`, error);
  // Treat DB errors as "job state unknown" - safer to check again
  throw new Error(`Failed to check job status: ${error.message}`);
}
```

### Fix 2: Add Token Validation Before Download

```typescript
async function validateGoogleToken(accessToken: string): Promise<boolean> {
  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v1/tokeninfo', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    return response.ok;
  } catch (error) {
    console.error('[QCWorker] Token validation failed:', error);
    return false;
  }
}
```

### Fix 3: Add Job Heartbeat

```typescript
// Update job with heartbeat every 30 seconds during processing
const heartbeatInterval = setInterval(async () => {
  await adminClient.from('qc_jobs')
    .update({ heartbeat_at: new Date().toISOString() })
    .eq('id', jobId);
}, 30000);

// Clear on completion
clearInterval(heartbeatInterval);
```

### Fix 4: Add DLQ for Failed Jobs

```sql
-- Create DLQ table
CREATE TABLE qc_jobs_dlq (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_job_id UUID NOT NULL,
  failure_reason TEXT NOT NULL,
  job_snapshot JSONB NOT NULL,
  retry_count INT DEFAULT 0,
  max_retries INT DEFAULT 3,
  created_at TIMESTAMP DEFAULT NOW(),
  next_retry_at TIMESTAMP,
  processed_at TIMESTAMP
);
```

---

## Testing Strategy

### Unit Test: Error Propagation

```typescript
// tests/worker.test.ts
describe('isJobCancelled', () => {
  it('should throw on database error instead of returning false', async () => {
    const mockClient = {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: () => Promise.reject(new Error('DB connection failed'))
          })
        })
      })
    };
    
    await expect(isJobCancelled('job-123', mockClient))
      .rejects.toThrow('Failed to check job status');
  });
});
```

### Integration Test: Token Expiry

```typescript
// tests/integration/google-drive.test.ts
describe('Google Drive Download', () => {
  it('should fail fast with clear error when token is expired', async () => {
    const expiredToken = 'expired-token-123';
    
    await expect(resolveDriveFile('file-id', client, { 
      result_json: { google_access_token: expiredToken } 
    }))
      .rejects.toThrow('Google Drive access denied');
  });
});
```

### E2E Test: Job Completion

```typescript
// tests/e2e/qc-processing.spec.ts
test('QC job should complete within 2 minutes', async ({ page }) => {
  // Upload test file
  await page.goto('/dashboard/qc');
  await page.setInputFiles('input[type="file"]', 'fixtures/test-video.mp4');
  
  // Start QC
  await page.click('button:has-text("Run QC")');
  
  // Wait for completion (2 min max)
  await expect(page.locator('[data-testid="job-status"]'))
    .toHaveText(/completed|failed/, { timeout: 120000 });
  
  // Verify progress reached 100%
  const progress = await page.locator('[data-testid="job-progress"]').textContent();
  expect(parseInt(progress)).toBe(100);
});
```

---

## Rollout Plan

1. **Phase 1 (Canary 1%):** Deploy error logging fixes only
2. **Phase 2 (Canary 5%):** Add token validation
3. **Phase 3 (Canary 25%):** Add heartbeat mechanism
4. **Phase 4 (100%):** Enable DLQ

---

## Monitoring After Fix

- Alert: `qc_job_stuck_count > 0` for 5 minutes
- Alert: `qc_job_failure_rate > 5%` for 10 minutes
- Dashboard: Job duration histogram
- Dashboard: Token refresh success rate
