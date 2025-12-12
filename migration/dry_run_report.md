# Migration Dry-Run Report

**Generated:** 2024-12-12  
**Environment:** Dry-run analysis (no DB connection)  
**Status:** ⚠️ READY FOR OPERATOR VALIDATION

---

## Executive Summary

| Migration | Status | Risk | Lock Impact | Est. Runtime |
|-----------|--------|------|-------------|--------------|
| 001_create_job_dlq.sql | ✅ Ready | LOW | None (new table) | < 1s |
| 002_add_heartbeat_column.sql | ✅ Ready | LOW | Brief (ALTER TABLE) | < 5s |

**Recommendation:** PROCEED with operator validation on staging first.

---

## Migration 001: Create Job DLQ Table

### SQL Analysis

```sql
CREATE TABLE IF NOT EXISTS job_dlq (...)
```

**Operations:**
- CREATE TABLE IF NOT EXISTS job_dlq
- CREATE INDEX (6 indexes)
- CREATE FUNCTION update_job_dlq_updated_at
- CREATE TRIGGER job_dlq_updated_at
- ALTER TABLE ENABLE ROW LEVEL SECURITY
- CREATE POLICY (2 policies)
- GRANT ALL ON job_dlq TO service_role

**Lock Analysis:**
- No existing table locks required
- Table creation is atomic
- Index creation on empty table is instant

**Risk Assessment:** LOW
- Uses IF NOT EXISTS - idempotent
- No foreign keys to existing tables
- RLS policies are additive

**Estimated Runtime:** < 1 second

### Dry-Run Validation Commands

```bash
# Connect to staging/dry-run DB
export DB_URL="postgresql://user:pass@host:5432/db_staging"

# Validate syntax (psql --echo-errors)
psql $DB_URL -f migrations/001_create_job_dlq.sql --echo-errors -v ON_ERROR_STOP=1

# Verify table created
psql $DB_URL -c "\\d job_dlq"

# Verify indexes
psql $DB_URL -c "SELECT indexname FROM pg_indexes WHERE tablename = 'job_dlq';"
```

### Rollback SQL

```sql
-- ROLLBACK 001_create_job_dlq.sql
DROP TRIGGER IF EXISTS job_dlq_updated_at ON job_dlq;
DROP FUNCTION IF EXISTS update_job_dlq_updated_at();
DROP POLICY IF EXISTS "Users can view own org DLQ entries" ON job_dlq;
DROP POLICY IF EXISTS "Admins can manage DLQ entries" ON job_dlq;
DROP TABLE IF EXISTS job_dlq;
```

---

## Migration 002: Add Heartbeat Column

### SQL Analysis

```sql
ALTER TABLE qc_jobs ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMP WITH TIME ZONE;
```

**Operations:**
- ALTER TABLE qc_jobs ADD COLUMN
- CREATE INDEX (2 indexes)
- COMMENT ON COLUMN

**Lock Analysis:**
- Brief ACCESS EXCLUSIVE lock on qc_jobs during ALTER
- Lock duration: < 1ms (adding nullable column)
- Concurrent reads will wait briefly

**Risk Assessment:** LOW
- Uses ADD COLUMN IF NOT EXISTS - idempotent
- Nullable column - no default value needed
- No data migration required

**Estimated Runtime:** < 5 seconds (depending on table size)

### Dry-Run Validation Commands

```bash
# Check if column exists
psql $DB_URL -c "SELECT column_name FROM information_schema.columns WHERE table_name = 'qc_jobs' AND column_name = 'last_heartbeat_at';"

# Apply migration
psql $DB_URL -f migrations/002_add_heartbeat_column.sql

# Verify column added
psql $DB_URL -c "\\d qc_jobs" | grep heartbeat
```

### Rollback SQL

```sql
-- ROLLBACK 002_add_heartbeat_column.sql
DROP INDEX IF EXISTS idx_qc_jobs_running_heartbeat;
DROP INDEX IF EXISTS idx_qc_jobs_heartbeat;
ALTER TABLE qc_jobs DROP COLUMN IF EXISTS last_heartbeat_at;
```

---

## Pre-Migration Checklist

- [ ] Backup current database
- [ ] Verify checksum of migration files
- [ ] Run migrations on staging first
- [ ] Verify feature flags are OFF
- [ ] Schedule maintenance window (optional - low impact)

## Post-Migration Verification

```bash
# Verify DLQ table
psql $DB_URL -c "SELECT COUNT(*) FROM job_dlq;"

# Verify heartbeat column
psql $DB_URL -c "SELECT id, last_heartbeat_at FROM qc_jobs LIMIT 1;"

# Verify indexes exist
psql $DB_URL -c "SELECT indexname FROM pg_indexes WHERE indexname LIKE '%dlq%' OR indexname LIKE '%heartbeat%';"
```

---

## Destructive Statement Analysis

**NONE DETECTED** ✅

The migrations contain:
- No DROP statements (except in rollback comments)
- No DELETE statements
- No TRUNCATE statements
- No UPDATE statements affecting existing data

---

## Checksum Verification

```
b375326911b09563ca3a60762a2683061bc6cf18a43c44d7874d6794e32fbaa9  001_create_job_dlq.sql
a0b60fff93350ba513bb0d1afdf9bd4b7067d8c269dc684575a08adeb723626a  002_add_heartbeat_column.sql
```

Verify with: `shasum -a 256 -c migrations/checksum.txt`

---

## Approval Required

- [ ] **DBA/Ops:** Migration syntax validated
- [ ] **Dev Lead:** Code review complete
- [ ] **Staging:** Migrations tested on staging environment
