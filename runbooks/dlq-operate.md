# Runbook: Dead Letter Queue (DLQ) Operations

**Service:** AlokickFlow DLQ
**Feature Flag:** `DLQ_ENABLED`
**Alert:** `dlq_length_high`

---

## Overview

The Dead Letter Queue (DLQ) stores failed jobs that couldn't be processed after max retries. This runbook covers common DLQ operations.

---

## Quick Commands

### Check DLQ Status
```bash
curl -s "https://alokickflow.onrender.com/api/admin/dlq?stats=true" \
  -H "Authorization: Bearer $AUTH_TOKEN" | jq
```

### List Pending Entries
```bash
curl -s "https://alokickflow.onrender.com/api/admin/dlq?status=pending&limit=10" \
  -H "Authorization: Bearer $AUTH_TOKEN" | jq
```

### Retry a Specific Entry (Dry Run)
```bash
curl -X POST "https://alokickflow.onrender.com/api/admin/dlq" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "retry", "id": "ENTRY_ID_HERE", "dryRun": true}' | jq
```

### Retry a Specific Entry (Actual)
```bash
curl -X POST "https://alokickflow.onrender.com/api/admin/dlq" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "retry", "id": "ENTRY_ID_HERE"}' | jq
```

### Resolve an Entry
```bash
curl -X POST "https://alokickflow.onrender.com/api/admin/dlq" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "resolve", "id": "ENTRY_ID_HERE", "notes": "Manually processed"}' | jq
```

---

## Common Scenarios

### Scenario 1: High DLQ Alert

**Alert:** `dlq_length > 10`

**Steps:**
1. Check DLQ stats to understand the scope
2. Review failure reasons for patterns
3. If transient error (timeout, rate limit), batch retry
4. If persistent error (auth, validation), investigate root cause

```bash
# Step 1: Get stats
curl -s ".../api/admin/dlq?stats=true" -H "Authorization: Bearer $TOKEN" | jq

# Step 2: List entries by failure code
curl -s ".../api/admin/dlq?limit=50" -H "Authorization: Bearer $TOKEN" \
  | jq '.entries | group_by(.failure_code) | map({code: .[0].failure_code, count: length})'
```

### Scenario 2: Timeout Failures

**Failure Code:** `TIMEOUT`

Common causes:
- File too large for current timeout
- Network issues during download
- External API (Groq, Google) slow

**Resolution:**
1. Check if file size exceeds limits
2. Verify network connectivity
3. Check external service status
4. If transient, retry with dry-run first

```bash
# Find timeout entries
curl -s ".../api/admin/dlq?limit=100" -H "Authorization: Bearer $TOKEN" \
  | jq '.entries | map(select(.failure_code == "TIMEOUT"))'

# Retry one (dry-run)
curl -X POST ".../api/admin/dlq" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "retry", "id": "xxx", "dryRun": true}'
```

### Scenario 3: Auth Errors

**Failure Code:** `AUTH_ERROR`

Common causes:
- Google OAuth token expired
- User disconnected Google Drive
- API key rotation

**Resolution:**
1. Check if token is still valid
2. Contact user to reconnect Google Drive
3. Resolve entry with notes

```bash
# Find auth error entries
curl -s ".../api/admin/dlq?limit=100" -H "Authorization: Bearer $TOKEN" \
  | jq '.entries | map(select(.failure_code == "AUTH_ERROR"))'

# Resolve with explanation
curl -X POST ".../api/admin/dlq" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "resolve", "id": "xxx", "notes": "User notified to reconnect Google Drive"}'
```

### Scenario 4: Bulk Retry

For retrying multiple entries after fixing root cause:

```bash
# Get all pending entry IDs
ENTRY_IDS=$(curl -s ".../api/admin/dlq?status=pending&limit=100" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.entries[].id')

# Retry each (with delay to avoid rate limiting)
for id in $ENTRY_IDS; do
  echo "Retrying $id..."
  curl -X POST ".../api/admin/dlq" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"action\": \"retry\", \"id\": \"$id\"}"
  sleep 2
done
```

---

## Monitoring

### DLQ Metrics to Watch
- `dlq_entries_total` - Total entries in DLQ
- `dlq_entries_pending` - Entries awaiting retry
- `dlq_entries_abandoned` - Entries exceeding max retries
- `dlq_retry_success_rate` - Success rate of retries

### Alert Thresholds
| Metric | Warning | Critical |
|--------|---------|----------|
| `dlq_entries_pending` | > 5 | > 20 |
| `dlq_entries_abandoned` | > 2 | > 10 |
| `dlq_retry_success_rate` | < 70% | < 50% |

---

## Purging Old Entries

Entries older than 30 days can be purged (requires super_admin):

```bash
curl -X POST ".../api/admin/dlq" \
  -H "Authorization: Bearer $SUPER_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "purge", "olderThanDays": 30}'
```

---

## Feature Flag Toggle

### Enable DLQ
```bash
# Via environment variable
FEATURE_FLAG_DLQ_ENABLED=true

# Or via .env file
echo "FEATURE_FLAG_DLQ_ENABLED=true" >> .env.production
```

### Disable DLQ (Emergency)
```bash
FEATURE_FLAG_DLQ_ENABLED=false
```

Note: Disabling DLQ means failed jobs will be marked failed but not stored for retry.

---

## Escalation

If DLQ growth continues after investigation:

1. **Page on-call:** #platform-oncall
2. **Check system health:** `/api/health/full`
3. **Review recent deployments** for regression
4. **Consider feature flag rollback** if new code is causing failures

---

## Contacts

- **Engineering Lead:** @alok
- **DLQ Service Owner:** @platform-team
- **External Support:** support@supabase.io
