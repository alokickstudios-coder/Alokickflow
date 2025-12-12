# Runbook: QC Jobs Stuck in Running State

**Alert:** `qc_job_stuck`
**Severity:** Critical
**On-Call Response Time:** 15 minutes

---

## Overview

QC jobs are stuck in "running" state for more than 2 minutes without progress updates. This typically indicates a processing failure that wasn't properly handled.

---

## Quick Diagnosis

### Step 1: Check System Health

```bash
curl -s https://alokickflow.onrender.com/api/health/full | jq
```

Look for:
- `qc_worker.status`: Should be "ok"
- `qc_worker.details.stuck`: Number of stuck jobs
- `groq_api.status`: Should be "ok"
- `google_oauth.status`: Should be "ok" if processing Drive files

### Step 2: Check Debug Endpoint

```bash
curl -s https://alokickflow.onrender.com/api/qc/debug \
  -H "Authorization: Bearer $AUTH_TOKEN" | jq
```

This shows:
- Jobs by status
- Stuck job details (ID, file name, progress %)
- Last error messages

### Step 3: Check Render Logs

1. Go to https://dashboard.render.com
2. Select "alokickflow" service
3. Check logs for:
   - `[QCWorker]` entries
   - Error stack traces
   - Memory warnings

---

## Common Causes & Fixes

### Cause 1: Google Drive Token Expired

**Symptoms:**
- Jobs stuck at 15-20% (downloading phase)
- Error: "Google Drive access denied"

**Fix:**
1. User needs to reconnect Google Drive in Settings
2. Retry the stuck job:

```bash
curl -X POST https://alokickflow.onrender.com/api/qc/debug \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "retry_specific", "jobId": "JOB_ID_HERE"}'
```

### Cause 2: Memory Exhaustion (OOM)

**Symptoms:**
- Multiple jobs stuck at same progress %
- Render logs show "memory limit exceeded"

**Fix:**
1. Cancel stuck jobs:

```bash
curl -X POST https://alokickflow.onrender.com/api/qc/debug \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "cancel_stuck"}'
```

2. If recurring, upgrade Render instance or reduce concurrent jobs

### Cause 3: FFmpeg Process Hung

**Symptoms:**
- Jobs stuck at 50-70% (analysis phase)
- No new logs for extended period

**Fix:**
1. Trigger worker restart:

```bash
curl -X POST https://alokickflow.onrender.com/api/qc/debug \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "trigger_worker"}'
```

2. If persists, redeploy service from Render dashboard

### Cause 4: Database Connection Issues

**Symptoms:**
- Jobs stuck at 5% (initializing)
- Error logs show Supabase connection errors

**Fix:**
1. Check Supabase status: https://status.supabase.com
2. If Supabase is down, wait for resolution
3. If connection pool exhausted, restart service

---

## Resolution Steps

### Manual Resolution

1. **Identify stuck jobs:**
```bash
curl -s https://alokickflow.onrender.com/api/qc/debug \
  -H "Authorization: Bearer $AUTH_TOKEN" | jq '.stuckJobs'
```

2. **Cancel all stuck jobs:**
```bash
curl -X POST https://alokickflow.onrender.com/api/qc/debug \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "cancel_stuck"}'
```

3. **Retry specific job** (if user needs it):
```bash
curl -X POST https://alokickflow.onrender.com/api/qc/reprocess \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jobId": "JOB_ID_HERE"}'
```

### Automated Recovery

The system has auto-recovery that runs every 2 minutes:
- Jobs stuck in "running" for >2 minutes are automatically marked as "failed"
- Jobs can then be retried by users

If auto-recovery isn't working:
1. Check that `processBatch` is being triggered
2. Check logs for "[QCWorker] Stuck job check failed"

---

## Escalation

If issue persists after 30 minutes:

1. **Page on-call engineer** via PagerDuty
2. **Check for platform-wide issues:**
   - Render status: https://render-status.com
   - Supabase status: https://status.supabase.com
   - Groq status: https://status.groq.com

3. **Consider rollback** if recent deployment:
```bash
# From Render dashboard, select previous deployment
# Or use Git revert
git revert HEAD
git push origin main
```

---

## Post-Incident

1. Update this runbook with new learnings
2. Create ticket for permanent fix if needed
3. Review error logging for gaps
4. Update alerts if thresholds need adjustment

---

## Contacts

- **Engineering Lead:** @alok
- **Platform Team:** #platform-oncall
- **External Support:**
  - Render: support@render.com
  - Supabase: support@supabase.io
