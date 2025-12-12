# Migration Plan

## Overview

This document outlines the database migrations required for the reliability hardening features.

---

## Migration 001: Create Job DLQ

**File:** `001_create_job_dlq.sql`
**Feature Flag:** `DLQ_ENABLED`
**Risk Level:** LOW (additive only)

### Purpose
Creates a Dead Letter Queue table to store failed jobs for later retry or manual review.

### Schema Changes
- Creates new table `job_dlq`
- Adds indexes for efficient querying
- Adds RLS policies for security

### Pre-Migration Checklist
- [ ] Backup current database
- [ ] Run dry-run against staging
- [ ] Verify no naming conflicts

### Dry-Run Command
```bash
# Connect to staging database
psql $STAGING_DATABASE_URL -f migrations/001_create_job_dlq.sql --set ON_ERROR_STOP=1 -v dry_run=true

# Or use Supabase CLI
supabase db push --dry-run
```

### Rollback Steps
```sql
DROP TRIGGER IF EXISTS job_dlq_updated_at ON job_dlq;
DROP FUNCTION IF EXISTS update_job_dlq_updated_at();
DROP TABLE IF EXISTS job_dlq;
```

### Verification
```sql
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'job_dlq';
```

---

## Migration 002: Add Heartbeat Column

**File:** `002_add_heartbeat_column.sql`
**Feature Flag:** `JOB_HEARTBEAT`
**Risk Level:** LOW (additive only)

### Purpose
Adds `last_heartbeat_at` column to `qc_jobs` table for watchdog monitoring.

### Schema Changes
- Adds column `last_heartbeat_at` to `qc_jobs`
- Adds indexes for watchdog queries

### Pre-Migration Checklist
- [ ] Backup current database
- [ ] Run dry-run against staging
- [ ] Verify column doesn't exist

### Dry-Run Command
```bash
# Check if column exists
psql $DATABASE_URL -c "
  SELECT column_name 
  FROM information_schema.columns 
  WHERE table_name = 'qc_jobs' AND column_name = 'last_heartbeat_at';
"

# Run migration
psql $DATABASE_URL -f migrations/002_add_heartbeat_column.sql
```

### Rollback Steps
```sql
DROP INDEX IF EXISTS idx_qc_jobs_running_heartbeat;
DROP INDEX IF EXISTS idx_qc_jobs_heartbeat;
ALTER TABLE qc_jobs DROP COLUMN IF EXISTS last_heartbeat_at;
```

### Verification
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'qc_jobs' AND column_name = 'last_heartbeat_at';
```

---

## Deployment Order

1. **Deploy code first** (with feature flags OFF)
2. **Run migrations** in order (001, 002)
3. **Verify migrations** using verification queries
4. **Enable feature flags** one at a time in staging
5. **Monitor for errors** for 24 hours
6. **Enable in production** via canary rollout

---

## Feature Flag Rollout Plan

### Phase 1: Staging (100%)
```bash
# .env.staging
FEATURE_FLAG_DLQ_ENABLED=true
FEATURE_FLAG_JOB_HEARTBEAT=true
```

### Phase 2: Production Canary (5%)
```bash
# Set via admin dashboard or environment
FEATURE_FLAG_DLQ_ENABLED=true  # 5% rollout
FEATURE_FLAG_JOB_HEARTBEAT=false  # Keep off initially
```

### Phase 3: Production (100%)
After 7 days with no issues:
```bash
FEATURE_FLAG_DLQ_ENABLED=true
FEATURE_FLAG_JOB_HEARTBEAT=true
```

---

## Backup Instructions

### Before Migration
```bash
# Create backup
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql

# Or via Supabase dashboard:
# 1. Go to Settings > Database
# 2. Click "Create Backup"
```

### Restore from Backup
```bash
# Restore (WARNING: destructive)
psql $DATABASE_URL < backup_YYYYMMDD_HHMMSS.sql
```

---

## Contacts

- **DB Admin:** @alok
- **On-Call:** #platform-oncall
- **Escalation:** support@supabase.io
