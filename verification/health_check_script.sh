#!/bin/bash
#
# AlokickFlow Health Check Script
#
# Validates system health, DLQ status, and runs synthetic smoke tests.
#
# Usage:
#   ./health_check_script.sh [--verbose]
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_URL="${APP_URL:-https://alokickflow.onrender.com}"
AUTH_TOKEN="${AUTH_TOKEN:-}"
VERBOSE="${1:-}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_pass() { echo -e "${GREEN}[PASS]${NC} $1"; }
log_fail() { echo -e "${RED}[FAIL]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_info() { echo -e "[INFO] $1"; }

TESTS_PASSED=0
TESTS_FAILED=0
TESTS_WARNED=0

check() {
  local name="$1"
  local result="$2"
  local expected="$3"
  
  if [ "$result" == "$expected" ]; then
    log_pass "$name: $result"
    ((TESTS_PASSED++))
    return 0
  else
    log_fail "$name: expected=$expected, got=$result"
    ((TESTS_FAILED++))
    return 1
  fi
}

# ============================================
# Health Checks
# ============================================

echo "============================================"
echo "AlokickFlow Health Check"
echo "URL: $APP_URL"
echo "Time: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "============================================"
echo ""

# 1. Basic Health
echo "--- Basic Health ---"
HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$APP_URL/api/health" 2>/dev/null || echo "000")
check "Health endpoint reachable" "$HEALTH_STATUS" "200"

# 2. Full Health
echo ""
echo "--- Full Health Check ---"
FULL_HEALTH=$(curl -s "$APP_URL/api/health/full" 2>/dev/null || echo '{}')

if [ "$VERBOSE" == "--verbose" ]; then
  echo "$FULL_HEALTH" | jq . 2>/dev/null || echo "$FULL_HEALTH"
fi

HEALTH_STATUS_VALUE=$(echo "$FULL_HEALTH" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4 2>/dev/null || echo "unknown")
if [ "$HEALTH_STATUS_VALUE" == "healthy" ]; then
  log_pass "System health: $HEALTH_STATUS_VALUE"
  ((TESTS_PASSED++))
elif [ "$HEALTH_STATUS_VALUE" == "degraded" ]; then
  log_warn "System health: $HEALTH_STATUS_VALUE"
  ((TESTS_WARNED++))
else
  log_fail "System health: $HEALTH_STATUS_VALUE"
  ((TESTS_FAILED++))
fi

# 3. QC Debug Endpoint
echo ""
echo "--- QC System Status ---"
DEBUG_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$APP_URL/api/qc/debug" 2>/dev/null || echo "000")
if [ "$DEBUG_STATUS" == "200" ] || [ "$DEBUG_STATUS" == "401" ]; then
  log_pass "QC debug endpoint: $DEBUG_STATUS"
  ((TESTS_PASSED++))
else
  log_fail "QC debug endpoint: $DEBUG_STATUS"
  ((TESTS_FAILED++))
fi

# 4. DLQ Status (if auth token provided)
echo ""
echo "--- DLQ Status ---"
if [ -n "$AUTH_TOKEN" ]; then
  DLQ_RESPONSE=$(curl -s "$APP_URL/api/admin/dlq?stats=true" \
    -H "Authorization: Bearer $AUTH_TOKEN" 2>/dev/null || echo '{}')
  
  DLQ_TOTAL=$(echo "$DLQ_RESPONSE" | grep -o '"total":[0-9]*' | cut -d':' -f2 2>/dev/null || echo "-1")
  
  if [ "$DLQ_TOTAL" == "-1" ]; then
    log_warn "DLQ stats: Unable to fetch (auth error or feature disabled)"
    ((TESTS_WARNED++))
  elif [ "$DLQ_TOTAL" -lt 10 ]; then
    log_pass "DLQ length: $DLQ_TOTAL (< 10 threshold)"
    ((TESTS_PASSED++))
  else
    log_warn "DLQ length: $DLQ_TOTAL (exceeds threshold)"
    ((TESTS_WARNED++))
  fi
else
  log_warn "DLQ stats: Skipped (no AUTH_TOKEN)"
  ((TESTS_WARNED++))
fi

# 5. Feature Flags Check
echo ""
echo "--- Feature Flags ---"
# This would query a config endpoint if available
log_info "DLQ_ENABLED: Check environment"
log_info "JOB_HEARTBEAT: Check environment"

# 6. Response Time
echo ""
echo "--- Response Time ---"
START_TIME=$(date +%s%N)
curl -s -o /dev/null "$APP_URL/api/health" 2>/dev/null
END_TIME=$(date +%s%N)
LATENCY_MS=$(( (END_TIME - START_TIME) / 1000000 ))

if [ "$LATENCY_MS" -lt 500 ]; then
  log_pass "Response latency: ${LATENCY_MS}ms (< 500ms)"
  ((TESTS_PASSED++))
else
  log_warn "Response latency: ${LATENCY_MS}ms (> 500ms)"
  ((TESTS_WARNED++))
fi

# ============================================
# Summary
# ============================================
echo ""
echo "============================================"
echo "Health Check Summary"
echo "============================================"
echo -e "Passed:  ${GREEN}$TESTS_PASSED${NC}"
echo -e "Failed:  ${RED}$TESTS_FAILED${NC}"
echo -e "Warned:  ${YELLOW}$TESTS_WARNED${NC}"
echo ""

if [ "$TESTS_FAILED" -gt 0 ]; then
  echo -e "${RED}OVERALL: FAIL${NC}"
  exit 1
elif [ "$TESTS_WARNED" -gt 0 ]; then
  echo -e "${YELLOW}OVERALL: DEGRADED${NC}"
  exit 0
else
  echo -e "${GREEN}OVERALL: HEALTHY${NC}"
  exit 0
fi
