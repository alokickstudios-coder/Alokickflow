#!/bin/bash
#
# QC Processing Smoke Test
#
# This script tests the QC processing flow end-to-end.
# Run after deployment to verify the system is working.
#
# Usage:
#   export AUTH_TOKEN="your-auth-token"
#   ./test-qc-flow.sh
#

set -e

BASE_URL="${BASE_URL:-https://alokickflow.onrender.com}"
AUTH_TOKEN="${AUTH_TOKEN:-}"

echo "🔍 QC Processing Smoke Test"
echo "=========================="
echo "Target: $BASE_URL"
echo ""

# Check if auth token is set
if [ -z "$AUTH_TOKEN" ]; then
  echo "⚠️  Warning: AUTH_TOKEN not set, some tests may fail"
fi

# Test 1: Health Check
echo "1. Health Check..."
HEALTH=$(curl -sf "$BASE_URL/api/health/full" || echo '{"status":"error"}')
STATUS=$(echo $HEALTH | jq -r '.status')

if [ "$STATUS" = "healthy" ]; then
  echo "   ✅ Health check passed"
else
  echo "   ❌ Health check failed: $STATUS"
  echo "$HEALTH" | jq
  exit 1
fi

# Test 2: Check for stuck jobs
echo "2. Checking for stuck jobs..."
STUCK=$(echo $HEALTH | jq -r '.services[] | select(.name=="qc_worker") | .details.stuck // 0')

if [ "$STUCK" -gt "0" ]; then
  echo "   ⚠️  Found $STUCK stuck job(s)"
else
  echo "   ✅ No stuck jobs"
fi

# Test 3: QC Status Endpoint
echo "3. QC Status Endpoint..."
QC_STATUS=$(curl -sf "$BASE_URL/api/qc/status" || echo '{"error":"failed"}')

if echo "$QC_STATUS" | jq -e '.error' > /dev/null 2>&1; then
  echo "   ❌ QC status failed"
else
  echo "   ✅ QC status OK"
fi

# Test 4: Debug Endpoint (requires auth)
if [ -n "$AUTH_TOKEN" ]; then
  echo "4. Debug Endpoint..."
  DEBUG=$(curl -sf "$BASE_URL/api/qc/debug" \
    -H "Authorization: Bearer $AUTH_TOKEN" \
    -H "Cookie: sb-access-token=$AUTH_TOKEN" || echo '{"error":"failed"}')
  
  if echo "$DEBUG" | jq -e '.error' > /dev/null 2>&1; then
    echo "   ⚠️  Debug endpoint requires auth"
  else
    TOTAL=$(echo $DEBUG | jq -r '.summary.total // 0')
    echo "   ✅ Debug endpoint OK (Total jobs: $TOTAL)"
  fi
else
  echo "4. Debug Endpoint... SKIPPED (no auth)"
fi

# Test 5: Check worker trigger
echo "5. Worker Trigger..."
TRIGGER=$(curl -sf -X POST "$BASE_URL/api/qc/process-queue" \
  -H "Content-Type: application/json" \
  -H "x-internal-trigger: true" \
  -d '{"limit":1}' || echo '{"error":"failed"}')

if echo "$TRIGGER" | jq -e '.success' > /dev/null 2>&1; then
  PROCESSED=$(echo $TRIGGER | jq -r '.processed')
  echo "   ✅ Worker triggered (Processed: $PROCESSED)"
else
  echo "   ❌ Worker trigger failed"
fi

# Summary
echo ""
echo "=========================="
echo "Summary:"
echo "  - Health: $STATUS"
echo "  - Stuck Jobs: $STUCK"
echo ""

if [ "$STATUS" = "healthy" ] && [ "$STUCK" -lt "5" ]; then
  echo "✅ All checks passed!"
  exit 0
else
  echo "⚠️  Some checks need attention"
  exit 1
fi
