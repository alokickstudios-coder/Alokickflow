# Rollout Checklist

**Service:** AlokickFlow Hardening Features  
**Version:** Phase 2 (DLQ + Heartbeat)  
**Date:** 2024-12-12

---

## Pre-Rollout Approvals

| Approver | Role | Approved | Date |
|----------|------|----------|------|
| @alok | Dev Lead | ☐ | |
| #platform-oncall | Ops On-Call | ☐ | |
| @product | Product Owner | ☐ | |

**⚠️ DO NOT PROCEED UNTIL ALL THREE ARE CHECKED**

---

## Stage 0: Baseline Deployment

### Actions
- [ ] Deploy code to production (feature flags OFF)
- [ ] Verify build successful on Render
- [ ] Capture baseline metrics

### Verification
```bash
# Run health check
./verification/health_check_script.sh --verbose

# Expected output: OVERALL: HEALTHY
```

### Metrics Thresholds
| Metric | Threshold | Actual |
|--------|-----------|--------|
| Health status | healthy | |
| Error rate | < 1% | |
| P99 latency | < 500ms | |

### Backout Command
```bash
# Rollback to previous deploy
git revert HEAD && git push origin main
```

---

## Stage 1: Run Migrations

### Pre-Migration
- [ ] Database backup created
- [ ] Verified low-traffic period
- [ ] Staging migrations successful

### Actions
- [ ] Run migration 001 (DLQ table)
- [ ] Verify DLQ table created
- [ ] Run migration 002 (heartbeat column)
- [ ] Verify column added

### Verification Commands
```sql
-- Check DLQ table
SELECT COUNT(*) FROM job_dlq;
-- Expected: 0

-- Check heartbeat column
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'qc_jobs' AND column_name = 'last_heartbeat_at';
-- Expected: 1 row
```

### Backout Command
```sql
-- See migration/operator_instructions.md for full rollback SQL
```

### Who to Call if Issues
- **DB Issues:** support@supabase.io
- **App Issues:** @alok
- **Escalation:** #platform-oncall

---

## Stage 2: Enable DLQ (5% → 100%)

### Week 1: 5% Canary
- [ ] Set `FEATURE_FLAG_DLQ_ENABLED=true` in staging
- [ ] Verify staging DLQ working
- [ ] Set `FEATURE_FLAG_DLQ_ENABLED=true` in production (via rollout %)

### Verification
```bash
# Check DLQ is accepting entries
curl -s "$APP_URL/api/admin/dlq?stats=true" \
  -H "Authorization: Bearer $TOKEN" | jq

# Inject test failure and verify it appears in DLQ
```

### Metrics Thresholds
| Metric | Threshold | Actual |
|--------|-----------|--------|
| DLQ entries | < 10 | |
| Error rate change | < +5% | |
| Latency regression | < +15% | |

### Wait Period
- [ ] Wait 24 hours before increasing to 100%

### Week 2: 100% Rollout
- [ ] Verify 5% canary healthy for 24h
- [ ] Increase to 100%
- [ ] Monitor for 24h

### Backout Command
```bash
# Disable DLQ
FEATURE_FLAG_DLQ_ENABLED=false
```

---

## Stage 3: Enable Heartbeat (5% → 100%)

### Pre-Requisites
- [ ] DLQ enabled and stable
- [ ] No outstanding issues from Stage 2

### Week 3: 5% Canary
- [ ] Set `FEATURE_FLAG_JOB_HEARTBEAT=true` in staging
- [ ] Verify watchdog detecting stuck jobs
- [ ] Verify stuck jobs moving to DLQ
- [ ] Enable in production (5%)

### Verification
```bash
# Check heartbeat metrics
curl -s "$APP_URL/api/qc/debug" \
  -H "Authorization: Bearer $TOKEN" | jq '.watchdogMetrics'
```

### Metrics Thresholds
| Metric | Threshold | Actual |
|--------|-----------|--------|
| Heartbeat misses | < 5/hour | |
| Jobs moved to DLQ | < 3/hour | |
| False positive rate | < 1% | |

### Week 4: 100% Rollout
- [ ] Verify 5% canary healthy for 24h
- [ ] Increase to 100%
- [ ] Monitor for 48h

### Backout Command
```bash
# Disable heartbeat (DLQ stays on)
FEATURE_FLAG_JOB_HEARTBEAT=false
```

---

## Post-Rollout Verification

### Final Checklist
- [ ] All feature flags enabled (100%)
- [ ] No increase in error rate
- [ ] No latency regression
- [ ] DLQ processing correctly
- [ ] Heartbeat detecting stuck jobs
- [ ] Runbooks updated
- [ ] Team notified

### Sign-Off
| Role | Name | Date |
|------|------|------|
| Dev Lead | | |
| Ops On-Call | | |
| Product Owner | | |

---

## Emergency Contacts

| Issue | Contact | Method |
|-------|---------|--------|
| App down | @alok | Slack/Phone |
| DB issues | Supabase Support | Email |
| Escalation | #platform-oncall | Slack |

---

## Incident Response

If metrics breach thresholds:

1. **Immediately:** Disable feature flag(s)
   ```bash
   FEATURE_FLAG_DLQ_ENABLED=false
   FEATURE_FLAG_JOB_HEARTBEAT=false
   ```

2. **Within 5 minutes:** 
   - Page on-call
   - Capture logs and metrics
   - Create incident ticket

3. **Within 30 minutes:**
   - RCA started
   - Stakeholders notified

4. **Within 24 hours:**
   - Post-mortem scheduled
   - Fix identified
