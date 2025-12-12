# Operator Migration Instructions

**Service:** AlokickFlow  
**Migration Version:** 001-002  
**Date:** 2024-12-12  
**Risk Level:** LOW

---

## ⚠️ IMPORTANT: DO NOT RUN WITHOUT APPROVAL

This document provides step-by-step instructions for operators to run migrations.

**Required Approvals Before Proceeding:**
- [ ] Dev Lead (@alok)
- [ ] Ops On-Call (#platform-oncall)
- [ ] Product Owner

---

## Prerequisites

1. **Access:**
   - Read access to staging database
   - Write access to production database (for actual migration)
   - Access to Render/Supabase dashboard

2. **Tools:**
   - psql client installed
   - Access to database connection strings

3. **Verification:**
   - Feature flags are OFF in production
   - No active QC jobs running (check dashboard)
   - Recent database backup exists

---

## Environment Variables

```bash
# Staging (for testing)
export DB_STAGING_URL="postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres"

# Production (DO NOT USE until approved)
export DB_PROD_URL="postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres"
```

---

## Step 1: Pre-Migration Backup

### Option A: Supabase Dashboard
1. Go to Supabase Dashboard → Settings → Database
2. Click "Create Backup" or "Download Backup"
3. Wait for backup to complete
4. Note the backup timestamp

### Option B: pg_dump (Manual)
```bash
# Create backup
pg_dump $DB_PROD_URL > backup_$(date +%Y%m%d_%H%M%S).sql

# Verify backup size (should be > 0)
ls -lh backup_*.sql
```

---

## Step 2: Verify Migration Checksums

```bash
cd /path/to/alokickflow

# Verify checksums match expected
shasum -a 256 -c migrations/checksum.txt

# Expected output:
# migrations/001_create_job_dlq.sql: OK
# migrations/002_add_heartbeat_column.sql: OK
```

---

## Step 3: Run Migrations on STAGING First

```bash
# Connect to staging
psql $DB_STAGING_URL

# Run migration 001
\i migrations/001_create_job_dlq.sql

# Verify success
\d job_dlq

# Run migration 002
\i migrations/002_add_heartbeat_column.sql

# Verify success
\d qc_jobs | grep heartbeat

# Exit
\q
```

### Verification Queries (Staging)
```sql
-- Check DLQ table exists
SELECT COUNT(*) FROM job_dlq;
-- Expected: 0

-- Check heartbeat column exists
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'qc_jobs' AND column_name = 'last_heartbeat_at';
-- Expected: 1 row

-- Check indexes
SELECT indexname FROM pg_indexes WHERE indexname LIKE '%dlq%' OR indexname LIKE '%heartbeat%';
-- Expected: 8 rows (6 DLQ + 2 heartbeat)
```

---

## Step 4: Run Migrations on PRODUCTION

⚠️ **STOP HERE** if staging verification failed.

```bash
# Connect to production
psql $DB_PROD_URL

# Run migration 001
\i migrations/001_create_job_dlq.sql

# Verify
SELECT COUNT(*) FROM job_dlq;

# Run migration 002
\i migrations/002_add_heartbeat_column.sql

# Verify
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'qc_jobs' AND column_name = 'last_heartbeat_at';

# Exit
\q
```

---

## Step 5: Post-Migration Health Check

```bash
# Run health check
curl -s "https://alokickflow.onrender.com/api/health/full" | jq

# Expected: status = "healthy"

# Check DLQ stats (should be empty)
curl -s "https://alokickflow.onrender.com/api/admin/dlq?stats=true" \
  -H "Authorization: Bearer $AUTH_TOKEN" | jq

# Expected: total = 0
```

---

## Step 6: Enable Feature Flags (GRADUAL)

⚠️ **Wait 24 hours** after migration before enabling flags.

### Week 1: Enable DLQ Only
```bash
# In Render dashboard or .env
FEATURE_FLAG_DLQ_ENABLED=true
```

### Week 2: Enable Heartbeat
```bash
FEATURE_FLAG_JOB_HEARTBEAT=true
```

---

## Rollback Procedure

If issues occur, rollback immediately:

### Rollback Migration 002
```sql
-- Connect to production
psql $DB_PROD_URL

-- Run rollback
DROP INDEX IF EXISTS idx_qc_jobs_running_heartbeat;
DROP INDEX IF EXISTS idx_qc_jobs_heartbeat;
ALTER TABLE qc_jobs DROP COLUMN IF EXISTS last_heartbeat_at;
```

### Rollback Migration 001
```sql
-- Only if DLQ is empty (check first)
SELECT COUNT(*) FROM job_dlq;

-- If count = 0, safe to rollback
DROP TRIGGER IF EXISTS job_dlq_updated_at ON job_dlq;
DROP FUNCTION IF EXISTS update_job_dlq_updated_at();
DROP POLICY IF EXISTS "Users can view own org DLQ entries" ON job_dlq;
DROP POLICY IF EXISTS "Admins can manage DLQ entries" ON job_dlq;
DROP TABLE IF EXISTS job_dlq;
```

### Disable Feature Flags
```bash
FEATURE_FLAG_DLQ_ENABLED=false
FEATURE_FLAG_JOB_HEARTBEAT=false
```

---

## Restore from Backup (Nuclear Option)

Only if rollback SQL fails:

```bash
# Restore from backup
psql $DB_PROD_URL < backup_YYYYMMDD_HHMMSS.sql
```

---

## Contact Information

| Issue | Contact |
|-------|---------|
| Migration fails | @alok (dev lead) |
| Database issues | support@supabase.io |
| App issues | #platform-oncall Slack |
| Escalation | @alok via phone |

---

## Checklist Summary

### Pre-Migration
- [ ] Approvals received (dev-lead, ops-oncall, product-owner)
- [ ] Database backup created
- [ ] Feature flags verified OFF
- [ ] Checksums verified
- [ ] Low-traffic window selected

### During Migration
- [ ] Staging migration successful
- [ ] Staging verification passed
- [ ] Production migration run
- [ ] Production verification passed

### Post-Migration
- [ ] Health check passing
- [ ] No errors in logs
- [ ] DLQ stats endpoint working
- [ ] Wait 24h before enabling flags
