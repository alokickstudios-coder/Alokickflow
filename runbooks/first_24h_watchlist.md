# First 24 Hours Watchlist

**Service:** AlokickFlow Hardening Features  
**Feature Flags:** `DLQ_ENABLED`, `JOB_HEARTBEAT`  
**On-Call Contact:** #platform-oncall

---

## 🔴 Critical Metrics to Watch

### Immediately After Enablement (0-1 hour)

| Metric | Alert Threshold | Dashboard |
|--------|-----------------|-----------|
| Error rate | > 5% increase | `/api/health/full` |
| P99 latency | > 500ms | Render Metrics |
| Health status | != "healthy" | `/api/health` |
| DLQ length | > 0 (unexpected) | `/api/admin/dlq?stats=true` |

### First Hour (1-2 hours)

| Metric | Alert Threshold | Action |
|--------|-----------------|--------|
| DLQ entries created | Any (monitor) | Verify expected vs unexpected |
| Heartbeat misses | > 5 | Check worker health |
| Job completion rate | < 90% | Investigate failures |
| Memory usage | > 80% | Check for leaks |

### First Day (2-24 hours)

| Metric | Alert Threshold | Action |
|--------|-----------------|--------|
| DLQ growth rate | > 10/hour | Page on-call |
| Heartbeat false positives | > 1% | Adjust threshold |
| Job SLO | < 99.9% | Investigate |
| Retry success rate | < 70% | Review retry logic |

---

## 🟡 Commands to Run Periodically

### Every 15 Minutes (First 2 Hours)
```bash
# Health check
curl -s "https://alokickflow.onrender.com/api/health/full" | jq '.status'

# DLQ stats
curl -s "https://alokickflow.onrender.com/api/admin/dlq?stats=true" \
  -H "Authorization: Bearer $TOKEN" | jq

# Active jobs count
curl -s "https://alokickflow.onrender.com/api/qc/debug" \
  -H "Authorization: Bearer $TOKEN" | jq '.activeJobs'
```

### Every Hour (First 24 Hours)
```bash
# Full diagnostic
./verification/health_check_script.sh --verbose

# Check for stuck jobs
curl -s "https://alokickflow.onrender.com/api/qc/debug" \
  -H "Authorization: Bearer $TOKEN" | jq '.stuckJobs'

# Check heartbeat metrics
curl -s "https://alokickflow.onrender.com/api/qc/debug" \
  -H "Authorization: Bearer $TOKEN" | jq '.watchdogMetrics'
```

---

## 🟢 Expected Behavior

### DLQ Feature
- DLQ should be empty initially
- Entries appear only when jobs fail after max retries
- Each entry should have clear `failure_reason` and `failure_code`
- Retry button should work (test with dry-run first)

### Heartbeat Feature
- Workers should send heartbeat every 30 seconds
- Jobs with no heartbeat for 2+ minutes marked as stuck
- Stuck jobs should be moved to DLQ automatically
- Watchdog should run every 60 seconds

---

## 🚨 Escalation Triggers

### Immediate Escalation (Page On-Call)
- [ ] Health check returns "unhealthy"
- [ ] DLQ length > 10 within first hour
- [ ] Error rate > 10%
- [ ] Multiple heartbeat misses (> 5)
- [ ] Job completion rate drops below 80%

### Next Business Day Escalation
- [ ] DLQ length > 5 after 24 hours
- [ ] Latency regression > 20%
- [ ] Intermittent errors (< 5% but consistent)

---

## 🔄 Rollback Decision Matrix

| Condition | Action | Time Limit |
|-----------|--------|------------|
| Health check failing | Rollback immediately | 5 min |
| Error rate > 10% | Rollback | 15 min |
| DLQ length > 20 | Rollback | 30 min |
| P99 > 2x baseline | Investigate, rollback if no fix | 1 hour |
| Intermittent issues | Monitor, rollback if worsening | 4 hours |

### Rollback Command
```bash
# Disable feature flags
FEATURE_FLAG_DLQ_ENABLED=false
FEATURE_FLAG_JOB_HEARTBEAT=false
```

---

## 📋 24-Hour Checkpoint Checklist

### At 1 Hour
- [ ] Health check passing
- [ ] No unexpected DLQ entries
- [ ] Heartbeat working (if enabled)
- [ ] No customer complaints

### At 6 Hours
- [ ] Error rate stable
- [ ] Latency within baseline
- [ ] DLQ entries (if any) have clear reasons
- [ ] Retry mechanism working

### At 24 Hours
- [ ] All metrics within thresholds
- [ ] No rollback needed
- [ ] DLQ processing normally
- [ ] Ready for next canary stage

---

## 📞 Contacts

| Issue | Contact | Method |
|-------|---------|--------|
| App issues | @alok | Slack |
| DB issues | Supabase Support | Email |
| Escalation | #platform-oncall | Slack |
