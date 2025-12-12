# PR: Production Hardening Phase 2 - Final Verification

---

## ⚠️ **ACTION REQUIRED: Operator must run staging migrations and sign off. Do NOT run prod migrations or enable production feature flags without 3 approvals.**

---

## Summary

This PR completes the production hardening initiative with:
- ✅ All **35** empty catch blocks fixed (34 original + 1 in DLQ service)
- ✅ DLQ (Dead Letter Queue) system implemented
- ✅ Heartbeat/Watchdog system implemented
- ✅ API Contract tests added
- ✅ Monitoring alerts configured
- ✅ Runbooks created (4 total including first_24h_watchlist)
- ✅ Migration scripts with dry-run validation
- ✅ Canary rollout scripts
- ✅ Load test script (k6)

## Changes

### Code Changes (Non-Destructive)
- **35 empty catch blocks** replaced with structured logging (34 original + 1 in DLQ)
- New services: `lib/services/dlq/`, `lib/services/heartbeat/`
- New API: `/api/admin/dlq` (feature-flagged)
- New tests: `tests/contracts/api-contracts.test.ts`
- New load test: `tools/load/k6-qc-load-test.js`
- New runbook: `runbooks/first_24h_watchlist.md`

### Feature Flags (All Default OFF)
| Flag | Default | Purpose |
|------|---------|---------|
| `DLQ_ENABLED` | OFF | Dead letter queue for failed jobs |
| `JOB_HEARTBEAT` | OFF | Heartbeat monitoring for stuck jobs |

### Database Migrations (Requires Operator)
- `001_create_job_dlq.sql` - Creates DLQ table
- `002_add_heartbeat_column.sql` - Adds heartbeat column

**⚠️ Migrations must be run by operator following `migration/operator_instructions.md`**

## Verification Artifacts

| Artifact | Location |
|----------|----------|
| Dry-run report | `migration/dry_run_report.md` |
| Operator instructions | `migration/operator_instructions.md` |
| Final verification | `verification/final_verification.md` |
| Rollout checklist | `verification/rollout_checklist.md` |
| Health check script | `verification/health_check_script.sh` |
| Canary script | `canary/ci/canary_rollout.sh` |
| Backout commands | `backout_command.txt` |

## Test Plan

### Before Merge
- [x] TypeScript compilation passes
- [x] Production build succeeds
- [ ] Unit tests pass (requires operator setup)
- [ ] Contract tests pass (requires operator setup)

### After Merge
- [ ] Deploy to staging
- [ ] Run migrations on staging
- [ ] Enable feature flags on staging
- [ ] Run smoke tests
- [ ] Run load tests (100 concurrent jobs)
- [ ] Monitor for 24h

### Canary Rollout
- [ ] Stage 0: Deploy (flags OFF)
- [ ] Stage 1: Run migrations
- [ ] Stage 2: Enable DLQ (5%)
- [ ] Stage 3: Enable DLQ (100%)
- [ ] Stage 4: Enable Heartbeat (5%)
- [ ] Stage 5: Enable Heartbeat (100%)

## Rollback Plan

### Quick Rollback
```bash
# Disable feature flags (immediate)
FEATURE_FLAG_DLQ_ENABLED=false
FEATURE_FLAG_JOB_HEARTBEAT=false
```

### Code Rollback
```bash
git revert HEAD
git push origin main
```

### Migration Rollback
See `backout_command.txt` for full SQL

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Migration failure | Low | Medium | Dry-run first, backup |
| Feature regression | Low | Low | Feature flags OFF by default |
| Performance impact | Low | Low | Monitoring, canary |
| DLQ overflow | Low | Low | Alert at 10 entries |

## Required Approvals

- [ ] **@alok** (Dev Lead) - Code review, migration approval
- [ ] **#platform-oncall** (Ops) - Runbook review, rollback tested
- [ ] **Product Owner** - Rollout schedule approved

## One-Liner for Operators

> Do NOT run production migrations or toggle flags to ON until dev-lead, ops-oncall and product-owner check these artifacts and grant approval; follow `migration/operator_instructions.md` step-by-step.

---

## Checklist

- [x] Code follows project style guide
- [x] TypeScript compiles without errors
- [x] Build succeeds
- [x] Feature flags default to OFF
- [x] Migrations are idempotent
- [x] Rollback commands documented
- [x] Runbooks created
- [ ] Tests pass (operator setup required)
- [ ] Staging deployment tested
- [ ] Load test completed
