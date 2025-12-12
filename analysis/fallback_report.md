# Fallback Anti-Pattern Report

**Generated:** 2024-12-12
**Analyzer:** SRE Reliability Audit
**Severity Levels:** 🔴 CRITICAL | 🟠 HIGH | 🟡 MEDIUM | 🟢 LOW

---

## Executive Summary

**Total Anti-Patterns Found:** 41 empty catch blocks + 327 potentially unsafe fallbacks
**Critical Issues:** 15
**Files Affected:** 25

### Impact Assessment
- Silent failures causing jobs stuck at 5%
- No error visibility in production
- Impossible to debug without logs
- Potential data loss on async operations

---

## 🔴 CRITICAL: Empty Catch Blocks (Swallowed Errors)

### 1. lib/services/qc/worker.ts

| Line | Snippet | Problem | Fix |
|------|---------|---------|-----|
| 406 | `} catch { return false; }` | Swallows DB errors when checking job status | Log error, return specific error state |
| 944 | `} catch (e) {}` | Silently fails on platform config import | Log warning, use default with explicit flag |
| 977 | `} catch (e) {}` | Silently fails on cloud environment check | Log warning, default to safe option |
| 1050 | `} catch (e) {}` | Silent failure on token refresh | Log error, mark token as invalid |
| 1070 | `} catch (e) {}` | Silent failure on metadata clear | Log warning (non-critical) |
| 1140 | `} catch (e) {}` | Silent failure on progress callback | Log error, continue with warning |
| 1164 | `} catch (e) {}` | Silent failure on progress update | Log error, emit metric |

### 2. lib/services/qc/engine.ts

| Line | Snippet | Problem | Fix |
|------|---------|---------|-----|
| 528 | `} catch {` | Swallows errors in QC engine | Propagate with structured error |

### 3. lib/services/qc/basicQc.ts

| Line | Snippet | Problem | Fix |
|------|---------|---------|-----|
| 258 | `} catch {` | Silent FFmpeg failure | Log and return partial result |
| 765 | `} catch {` | Silent audio analysis failure | Log and return error state |

### 4. app/api/qc/debug/route.ts

| Line | Snippet | Problem | Fix |
|------|---------|---------|-----|
| 181 | `} catch (e) {}` | Silent failure in debug endpoint | Log and include in response |
| 293 | `} catch (e) {}` | Silent failure in diagnostics | Log warning |

### 5. app/api/qc/pause/route.ts

| Line | Snippet | Problem | Fix |
|------|---------|---------|-----|
| 121 | `} catch (e) {}` | Silent failure triggering worker | Log warning, return partial success |

### 6. app/api/google/auth/route.ts & callback/route.ts

| Line | Snippet | Problem | Fix |
|------|---------|---------|-----|
| 47, 61, 67 | `} catch {` | Silent OAuth failures | Log and return user-friendly error |
| 41, 61, 167, 191 | `} catch {` | Silent callback processing errors | Log and redirect with error param |

### 7. app/api/qc/status/route.ts

| Line | Snippet | Problem | Fix |
|------|---------|---------|-----|
| 83 | `} catch {}` | Silent status check failure | Log and return unknown status |
| 97 | `} catch {}` | Silent metric calculation failure | Return partial data |

### 8. lib/services/qc/ffmpegPaths.ts

| Line | Snippet | Problem | Fix |
|------|---------|---------|-----|
| 23, 35, 86, 98, 120, 127 | `} catch {` | Silent FFmpeg path resolution | Log warning, try fallback paths explicitly |

### 9. app/api/qc/export-to-sheets/route.ts

| Line | Snippet | Problem | Fix |
|------|---------|---------|-----|
| 363 | `} catch {` | Silent sheet export failure | Log and return partial success |
| 389 | `} catch {` | Silent data formatting failure | Skip row with warning |

### 10. lib/supabase/server.ts

| Line | Snippet | Problem | Fix |
|------|---------|---------|-----|
| 40, 49 | `} catch {` | Silent cookie operations | Log warning (can be non-critical) |

### 11. lib/services/qcSheetService.ts

| Line | Snippet | Problem | Fix |
|------|---------|---------|-----|
| 497 | `} catch {` | Silent sheet service failure | Log and throw structured error |

### 12. lib/google-drive/index.ts

| Line | Snippet | Problem | Fix |
|------|---------|---------|-----|
| 52 | `} catch {` | Silent Drive API failure | Log and throw |

### 13. app/api/auth/register/route.ts

| Line | Snippet | Problem | Fix |
|------|---------|---------|-----|
| 108, 131 | `} catch {}` | Silent registration side-effects | Log warning, continue registration |

---

## 🟠 HIGH: Missing Error Propagation

### Pattern: `|| 50` / `|| 10` Hardcoded Fallbacks

Found in 327 locations. Most critical:

```typescript
// BAD - masks real progress state
progress: job.progress || 50

// GOOD - explicit handling
progress: job.progress ?? 0  // Use nullish coalescing
```

### Pattern: Fire-and-Forget Async

```typescript
// BAD - no error handling
fetch(url, options).catch(() => {});

// GOOD - log and track
fetch(url, options).catch(e => {
  logger.error('Worker trigger failed', { error: e.message });
  metrics.increment('worker_trigger_failure');
});
```

---

## 🟡 MEDIUM: Missing Observability

### No Correlation IDs
- Requests cannot be traced across services
- No job-level logging correlation

### No Metrics
- `job_enqueued` - not tracked
- `job_started` - not tracked  
- `job_completed` - not tracked
- `job_failed` - not tracked
- `dlq_length` - no DLQ exists
- `retry_count` - not tracked

### No Structured Logging
- Console.log used throughout
- No log levels
- No JSON formatting for log aggregation

---

## 🟢 LOW: Code Quality

### Magic Numbers
- `5 * 60 * 1000` - should be `STUCK_JOB_THRESHOLD_MS`
- `60000` - should be `DOWNLOAD_TIMEOUT_MS`
- Progress percentages should be constants

### Missing Type Safety
- Many `any` types in error handlers
- Optional chaining without null checks

---

## Recommended Fixes (Priority Order)

### P0 - Immediate (Blocking Production)
1. Replace all empty `catch {}` with structured error logging
2. Add job timeout watchdog with heartbeat
3. Add DLQ for failed jobs

### P1 - High Priority (This Sprint)
4. Add correlation IDs to all logs
5. Add metrics for job lifecycle
6. Replace magic numbers with constants

### P2 - Medium Priority (Next Sprint)
7. Add structured logging (JSON)
8. Add health check synthetic monitors
9. Add contract tests for APIs

### P3 - Low Priority (Backlog)
10. Type safety improvements
11. Code documentation
12. Integration test coverage

---

## Files Requiring Immediate Attention

1. `lib/services/qc/worker.ts` - 7 critical issues
2. `lib/services/qc/basicQc.ts` - 2 critical issues  
3. `app/api/qc/process-queue/route.ts` - missing error metrics
4. `app/api/google/callback/route.ts` - 4 silent failures
5. `lib/services/qc/ffmpegPaths.ts` - 6 silent failures
