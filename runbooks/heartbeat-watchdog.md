# Runbook: Heartbeat Watchdog Operations

**Service:** AlokickFlow Heartbeat/Watchdog
**Feature Flag:** `JOB_HEARTBEAT`
**Alert:** `heartbeat_missed`

---

## Overview

The Heartbeat system monitors running jobs and detects when they become stuck. Workers send periodic heartbeats, and a watchdog process checks for jobs that haven't sent a heartbeat within the threshold.

---

## Architecture

```
┌─────────────┐      heartbeat       ┌──────────────┐
│   Worker    │ ──────────────────► │   Database   │
│ (qc_jobs)   │   every 30 seconds  │ (qc_jobs.    │
└─────────────┘                      │  last_       │
                                     │  heartbeat_  │
                                     │  at)         │
┌─────────────┐      query stuck    └──────────────┘
│  Watchdog   │ ◄───────────────────       │
│  (cron)     │   every 60 seconds         │
└─────────────┘                             │
      │                                     │
      │ mark failed + move to DLQ           │
      └─────────────────────────────────────┘
```

---

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `HEARTBEAT_INTERVAL_MS` | 30000 | Worker heartbeat interval (30s) |
| `HEARTBEAT_THRESHOLD_MS` | 120000 | Time before job is stuck (2min) |
| `WATCHDOG_CHECK_INTERVAL_MS` | 60000 | Watchdog check interval (1min) |
| `HEARTBEAT_MAX_MISSES` | 2 | Misses before moving to DLQ |

---

## Quick Diagnostics

### Check for Stuck Jobs
```sql
-- Jobs with no heartbeat in last 2 minutes
SELECT id, file_name, progress, 
       last_heartbeat_at,
       NOW() - last_heartbeat_at AS time_since_heartbeat
FROM qc_jobs
WHERE status = 'running'
  AND (last_heartbeat_at IS NULL 
       OR last_heartbeat_at < NOW() - INTERVAL '2 minutes')
ORDER BY last_heartbeat_at ASC;
```

### Check Watchdog Health
```bash
curl -s "https://alokickflow.onrender.com/api/health/full" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  | jq '.services[] | select(.name == "watchdog")'
```

### View Watchdog Metrics
```bash
curl -s "https://alokickflow.onrender.com/api/qc/debug" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  | jq '.watchdogMetrics'
```

---

## Common Scenarios

### Scenario 1: Jobs Stuck Without Heartbeat

**Symptoms:**
- Jobs show "running" but progress doesn't update
- `last_heartbeat_at` is old or NULL

**Diagnosis:**
```bash
# Check for stuck jobs
curl -s ".../api/qc/debug" -H "Authorization: Bearer $TOKEN" \
  | jq '.stuckJobs'
```

**Resolution:**
1. If few jobs: Let watchdog handle it (auto-moves to DLQ)
2. If many jobs: Check worker process health
3. If worker crashed: Restart worker and manually reset jobs

```bash
# Manually trigger watchdog
curl -X POST ".../api/qc/debug" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "trigger_watchdog"}'
```

### Scenario 2: Worker Not Sending Heartbeats

**Symptoms:**
- All running jobs have old `last_heartbeat_at`
- Watchdog keeps moving jobs to DLQ

**Diagnosis:**
```bash
# Check if feature flag is enabled
curl -s ".../api/config" | jq '.featureFlags.JOB_HEARTBEAT'

# Check worker logs for heartbeat messages
grep "Heartbeat" /var/log/worker.log
```

**Resolution:**
1. Verify `JOB_HEARTBEAT` feature flag is enabled
2. Check worker is using updated code
3. Restart worker if needed

### Scenario 3: False Positives (Good Jobs Marked Stuck)

**Symptoms:**
- Jobs being moved to DLQ despite making progress
- Heartbeat threshold too short for workload

**Resolution:**
1. Increase `HEARTBEAT_THRESHOLD_MS`
2. Investigate if specific operations take longer than expected

```bash
# Temporarily increase threshold (requires restart)
HEARTBEAT_THRESHOLD_MS=300000  # 5 minutes

# Or adjust via config
curl -X PATCH ".../api/admin/config" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"heartbeat_threshold_ms": 300000}'
```

---

## Manual Watchdog Operations

### Trigger Watchdog Manually
```bash
curl -X POST ".../api/qc/debug" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "trigger_watchdog"}'
```

### Reset a Stuck Job (Without DLQ)
```bash
# Reset to queued for immediate retry
curl -X POST ".../api/qc/debug" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "retry_specific", "jobId": "JOB_ID_HERE"}'
```

### Force Cancel All Stuck Jobs
```bash
curl -X POST ".../api/qc/debug" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "cancel_stuck"}'
```

---

## Metrics & Alerts

### Key Metrics
| Metric | Description |
|--------|-------------|
| `job_heartbeat_sent` | Heartbeats sent by workers |
| `job_heartbeat_missed` | Jobs detected as stuck |
| `watchdog_run_duration_ms` | Time for watchdog check |
| `watchdog_jobs_moved_to_dlq` | Jobs moved to DLQ by watchdog |

### Alert Thresholds
| Alert | Threshold | Action |
|-------|-----------|--------|
| `heartbeat_missed_high` | > 5 in 5min | Check worker health |
| `watchdog_not_running` | No run in 5min | Check cron job |
| `dlq_from_watchdog_high` | > 10 in 1hr | Investigate root cause |

---

## Feature Flag Toggle

### Enable Heartbeat
```bash
# Via environment
FEATURE_FLAG_JOB_HEARTBEAT=true
```

### Disable Heartbeat (Emergency)
```bash
# Disables both heartbeat sending and watchdog
FEATURE_FLAG_JOB_HEARTBEAT=false
```

**Note:** Disabling heartbeat means:
- Workers won't send heartbeats
- Watchdog won't run
- Stuck jobs will rely on timeout-based recovery only

---

## Troubleshooting Checklist

- [ ] Is `JOB_HEARTBEAT` feature flag enabled?
- [ ] Is the database column `last_heartbeat_at` present?
- [ ] Are workers sending heartbeats? (Check logs)
- [ ] Is watchdog cron running? (Check Render dashboard)
- [ ] Are thresholds appropriate for workload?
- [ ] Is DLQ enabled for stuck job storage?

---

## Escalation

If stuck job rate is high:

1. **Check worker health:** Are workers crashing?
2. **Check external services:** Groq, Google Drive status
3. **Review recent deployments:** Regression?
4. **Page on-call:** #platform-oncall
5. **Consider rollback** if new code is causing issues

---

## Contacts

- **Engineering Lead:** @alok
- **Watchdog Service Owner:** @platform-team
- **On-Call:** #platform-oncall
