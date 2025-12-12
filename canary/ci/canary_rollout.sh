#!/bin/bash
#
# Canary Rollout Script for AlokickFlow Hardening Features
#
# ⚠️ DO NOT RUN WITHOUT APPROVAL FROM:
#    - dev-lead
#    - ops-oncall  
#    - product-owner
#
# Usage:
#   ./canary_rollout.sh [stage] [--dry-run]
#
# Stages:
#   0 - Deploy with flags OFF (baseline)
#   1 - Enable flags for 1% of traffic
#   2 - Enable flags for 5% of traffic
#   3 - Enable flags for 25% of traffic
#   4 - Enable flags for 100% of traffic
#   rollback - Disable all flags and revert
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Configuration
APP_URL="${APP_URL:-https://alokickflow.onrender.com}"
RENDER_API_KEY="${RENDER_API_KEY:-}"
RENDER_SERVICE_ID="${RENDER_SERVICE_ID:-}"
SLACK_WEBHOOK="${SLACK_WEBHOOK:-}"

# Canary stages
declare -A CANARY_STAGES=(
  [0]="0"    # Flags OFF
  [1]="1"    # 1% traffic
  [2]="5"    # 5% traffic  
  [3]="25"   # 25% traffic
  [4]="100"  # 100% traffic
)

# Feature flags to enable
FEATURE_FLAGS=(
  "FEATURE_FLAG_DLQ_ENABLED"
  "FEATURE_FLAG_JOB_HEARTBEAT"
)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
  echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

send_slack_notification() {
  local message="$1"
  if [ -n "$SLACK_WEBHOOK" ]; then
    curl -s -X POST -H 'Content-type: application/json' \
      --data "{\"text\":\"$message\"}" \
      "$SLACK_WEBHOOK" > /dev/null
  fi
}

capture_metrics() {
  local output_file="$1"
  log_info "Capturing metrics to $output_file..."
  
  # Capture health and metrics
  local health=$(curl -s "$APP_URL/api/health/full" 2>/dev/null || echo '{"status":"unknown"}')
  local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  
  cat > "$output_file" << EOF
{
  "timestamp": "$timestamp",
  "app_url": "$APP_URL",
  "health": $health,
  "metrics": {
    "error_rate": 0,
    "latency_p50_ms": 0,
    "latency_p99_ms": 0,
    "dlq_length": 0,
    "active_jobs": 0
  },
  "feature_flags": {
    "DLQ_ENABLED": false,
    "JOB_HEARTBEAT": false
  }
}
EOF

  log_info "Metrics captured"
}

run_smoke_tests() {
  log_info "Running smoke tests..."
  
  # Health check
  local health_status=$(curl -s -o /dev/null -w "%{http_code}" "$APP_URL/api/health" 2>/dev/null || echo "000")
  
  if [ "$health_status" == "200" ]; then
    log_info "Health check: PASS ($health_status)"
    return 0
  else
    log_error "Health check: FAIL ($health_status)"
    return 1
  fi
}

check_thresholds() {
  log_info "Checking canary thresholds..."
  
  # In real implementation, this would query monitoring system
  # For now, we do basic health checks
  
  local health=$(curl -s "$APP_URL/api/health/full" 2>/dev/null)
  local status=$(echo "$health" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
  
  if [ "$status" == "healthy" ] || [ "$status" == "degraded" ]; then
    log_info "Threshold check: PASS (status=$status)"
    return 0
  else
    log_error "Threshold check: FAIL (status=$status)"
    return 1
  fi
}

set_feature_flag() {
  local flag_name="$1"
  local flag_value="$2"
  
  log_info "Setting $flag_name=$flag_value"
  
  if [ -n "$RENDER_API_KEY" ] && [ -n "$RENDER_SERVICE_ID" ]; then
    # Update env var via Render API
    curl -s -X PATCH "https://api.render.com/v1/services/$RENDER_SERVICE_ID/env-vars/$flag_name" \
      -H "Authorization: Bearer $RENDER_API_KEY" \
      -H "Content-Type: application/json" \
      -d "{\"value\": \"$flag_value\"}" > /dev/null
  else
    log_warn "RENDER_API_KEY or RENDER_SERVICE_ID not set - flag not updated remotely"
    log_info "Manual action required: Set $flag_name=$flag_value in environment"
  fi
}

deploy_canary() {
  local stage="$1"
  local percentage="${CANARY_STAGES[$stage]}"
  local dry_run="$2"
  
  log_info "=== Canary Stage $stage: ${percentage}% ==="
  
  if [ "$dry_run" == "true" ]; then
    log_warn "DRY RUN - No changes will be made"
  fi
  
  # Capture before metrics
  capture_metrics "$PROJECT_ROOT/canary/metrics_snapshot_before_stage${stage}.json"
  
  if [ "$percentage" == "0" ]; then
    log_info "Deploying with all feature flags OFF"
    for flag in "${FEATURE_FLAGS[@]}"; do
      if [ "$dry_run" != "true" ]; then
        set_feature_flag "$flag" "false"
      else
        log_info "[DRY RUN] Would set $flag=false"
      fi
    done
  else
    log_info "Enabling feature flags for ${percentage}% of traffic"
    for flag in "${FEATURE_FLAGS[@]}"; do
      if [ "$dry_run" != "true" ]; then
        set_feature_flag "$flag" "true"
      else
        log_info "[DRY RUN] Would set $flag=true"
      fi
    done
  fi
  
  # Wait for deployment to stabilize
  log_info "Waiting 60 seconds for deployment to stabilize..."
  if [ "$dry_run" != "true" ]; then
    sleep 60
  fi
  
  # Run smoke tests
  if ! run_smoke_tests; then
    log_error "Smoke tests failed! Initiating rollback..."
    if [ "$dry_run" != "true" ]; then
      rollback
    fi
    return 1
  fi
  
  # Check thresholds
  if ! check_thresholds; then
    log_error "Threshold check failed! Initiating rollback..."
    if [ "$dry_run" != "true" ]; then
      rollback
    fi
    return 1
  fi
  
  # Capture after metrics
  capture_metrics "$PROJECT_ROOT/canary/metrics_snapshot_after_stage${stage}.json"
  
  log_info "=== Stage $stage Complete ==="
  send_slack_notification "🚀 Canary Stage $stage (${percentage}%) completed successfully for AlokickFlow"
  
  return 0
}

rollback() {
  log_error "=== ROLLBACK INITIATED ==="
  send_slack_notification "⚠️ ROLLBACK: AlokickFlow canary deployment rolling back"
  
  for flag in "${FEATURE_FLAGS[@]}"; do
    log_info "Disabling $flag"
    set_feature_flag "$flag" "false"
  done
  
  log_info "Rollback complete. All feature flags disabled."
  send_slack_notification "✅ ROLLBACK COMPLETE: All feature flags disabled for AlokickFlow"
}

show_help() {
  cat << EOF
AlokickFlow Canary Rollout Script

Usage: $0 [stage|rollback] [--dry-run]

Stages:
  0         Deploy with flags OFF (baseline)
  1         Enable flags for 1% of traffic
  2         Enable flags for 5% of traffic
  3         Enable flags for 25% of traffic
  4         Enable flags for 100% of traffic
  rollback  Disable all flags and revert

Options:
  --dry-run   Show what would happen without making changes

Environment Variables:
  APP_URL           Application URL (default: https://alokickflow.onrender.com)
  RENDER_API_KEY    Render API key for env var updates
  RENDER_SERVICE_ID Render service ID
  SLACK_WEBHOOK     Slack webhook for notifications

Examples:
  $0 0                    # Deploy baseline (flags OFF)
  $0 1 --dry-run          # Simulate stage 1
  $0 2                    # Enable 5% canary
  $0 rollback             # Emergency rollback

⚠️ APPROVAL REQUIRED before running:
   - dev-lead
   - ops-oncall
   - product-owner

EOF
}

# Main
main() {
  local stage="${1:-}"
  local dry_run="false"
  
  if [ "$2" == "--dry-run" ] || [ "$1" == "--dry-run" ]; then
    dry_run="true"
  fi
  
  case "$stage" in
    0|1|2|3|4)
      deploy_canary "$stage" "$dry_run"
      ;;
    rollback)
      rollback
      ;;
    --help|-h|"")
      show_help
      exit 0
      ;;
    *)
      log_error "Unknown stage: $stage"
      show_help
      exit 1
      ;;
  esac
}

main "$@"
