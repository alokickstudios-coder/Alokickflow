/**
 * Job Heartbeat & Watchdog Service
 * 
 * Monitors running jobs and detects stuck ones via heartbeat mechanism.
 * Feature-flagged via JOB_HEARTBEAT in feature-flags.ts
 * 
 * Architecture:
 * 1. Worker updates last_heartbeat_at every HEARTBEAT_INTERVAL_MS
 * 2. Watchdog runs every WATCHDOG_CHECK_INTERVAL_MS
 * 3. Jobs with no heartbeat for HEARTBEAT_THRESHOLD_MS are marked stuck
 * 4. After HEARTBEAT_MAX_MISSES, job is moved to DLQ and marked failed
 */

import { getAdminClient } from "@/lib/api/auth-helpers";
import { isFeatureEnabled } from "@/lib/config/feature-flags";
import { addToDLQ, FAILURE_CODES } from "@/lib/services/dlq";

// Configuration
export const HEARTBEAT_CONFIG = {
  // How often workers should send heartbeat (default: 30 seconds)
  HEARTBEAT_INTERVAL_MS: parseInt(process.env.HEARTBEAT_INTERVAL_MS || "30000", 10),
  
  // How long without heartbeat before job is considered stuck (default: 2 minutes)
  HEARTBEAT_THRESHOLD_MS: parseInt(process.env.HEARTBEAT_THRESHOLD_MS || "120000", 10),
  
  // How often watchdog checks for stuck jobs (default: 1 minute)
  WATCHDOG_CHECK_INTERVAL_MS: parseInt(process.env.WATCHDOG_CHECK_INTERVAL_MS || "60000", 10),
  
  // Number of missed heartbeats before moving to DLQ (default: 2)
  HEARTBEAT_MAX_MISSES: parseInt(process.env.HEARTBEAT_MAX_MISSES || "2", 10),
};

// Metrics tracking (in-memory for now, can be exported to monitoring)
const metrics = {
  heartbeatsSent: 0,
  stuckJobsDetected: 0,
  jobsMovedToDLQ: 0,
  lastWatchdogRun: null as Date | null,
};

/**
 * Send a heartbeat for a running job
 * Call this periodically during long-running operations
 */
export async function sendHeartbeat(jobId: string): Promise<boolean> {
  if (!isFeatureEnabled('JOB_HEARTBEAT')) {
    return true; // Silently succeed if feature disabled
  }

  const adminClient = getAdminClient();
  if (!adminClient) {
    console.warn('[Heartbeat] Admin client not available');
    return false;
  }

  try {
    const { error } = await adminClient
      .from('qc_jobs')
      .update({ last_heartbeat_at: new Date().toISOString() })
      .eq('id', jobId)
      .eq('status', 'running'); // Only update if still running

    if (error) {
      console.warn(`[Heartbeat] Failed to send for job ${jobId}:`, error.message);
      return false;
    }

    metrics.heartbeatsSent++;
    console.debug(`[Heartbeat] Sent for job ${jobId}`);
    return true;
  } catch (error: any) {
    console.warn(`[Heartbeat] Error sending for job ${jobId}:`, error.message);
    return false;
  }
}

/**
 * Create a heartbeat sender that can be started/stopped
 */
export function createHeartbeatSender(jobId: string): {
  start: () => void;
  stop: () => void;
  isRunning: () => boolean;
} {
  let intervalId: NodeJS.Timeout | null = null;

  return {
    start: () => {
      if (intervalId) return; // Already running
      
      if (!isFeatureEnabled('JOB_HEARTBEAT')) return;
      
      // Send initial heartbeat
      sendHeartbeat(jobId);
      
      // Set up interval
      intervalId = setInterval(() => {
        sendHeartbeat(jobId);
      }, HEARTBEAT_CONFIG.HEARTBEAT_INTERVAL_MS);
    },
    
    stop: () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    },
    
    isRunning: () => intervalId !== null,
  };
}

/**
 * Watchdog: Check for stuck jobs and handle them
 * Run this periodically (via cron or scheduled task)
 */
export async function runWatchdog(): Promise<{
  checked: number;
  stuckFound: number;
  movedToDLQ: number;
  failedToProcess: number;
}> {
  if (!isFeatureEnabled('JOB_HEARTBEAT')) {
    return { checked: 0, stuckFound: 0, movedToDLQ: 0, failedToProcess: 0 };
  }

  const adminClient = getAdminClient();
  if (!adminClient) {
    console.error('[Watchdog] Admin client not available');
    return { checked: 0, stuckFound: 0, movedToDLQ: 0, failedToProcess: 0 };
  }

  const startTime = Date.now();
  let checked = 0;
  let stuckFound = 0;
  let movedToDLQ = 0;
  let failedToProcess = 0;

  try {
    // Find all running jobs
    const { data: runningJobs, error: queryError } = await adminClient
      .from('qc_jobs')
      .select('id, file_name, organisation_id, started_at, last_heartbeat_at, progress')
      .eq('status', 'running');

    if (queryError) {
      console.error('[Watchdog] Failed to query running jobs:', queryError.message);
      return { checked: 0, stuckFound: 0, movedToDLQ: 0, failedToProcess: 0 };
    }

    const jobs = runningJobs || [];
    checked = jobs.length;

    if (checked === 0) {
      console.debug('[Watchdog] No running jobs to check');
      return { checked: 0, stuckFound: 0, movedToDLQ: 0, failedToProcess: 0 };
    }

    const now = Date.now();
    const threshold = now - HEARTBEAT_CONFIG.HEARTBEAT_THRESHOLD_MS;

    for (const job of jobs) {
      // Determine last activity time
      const lastActivity = job.last_heartbeat_at 
        ? new Date(job.last_heartbeat_at).getTime()
        : job.started_at 
          ? new Date(job.started_at).getTime()
          : 0;

      // Check if job is stuck
      if (lastActivity < threshold) {
        stuckFound++;
        metrics.stuckJobsDetected++;

        console.warn(`[Watchdog] Stuck job detected: ${job.id} (${job.file_name}), last activity: ${new Date(lastActivity).toISOString()}`);

        try {
          // Move to DLQ
          const dlqEntry = await addToDLQ({
            jobId: job.id,
            jobType: 'qc_job',
            payload: {
              file_name: job.file_name,
              progress: job.progress,
              started_at: job.started_at,
              last_heartbeat_at: job.last_heartbeat_at,
            },
            failureReason: `Job stuck - no heartbeat for ${Math.round((now - lastActivity) / 1000)}s`,
            failureCode: FAILURE_CODES.TIMEOUT,
            organisationId: job.organisation_id,
          });

          if (dlqEntry) {
            movedToDLQ++;
            metrics.jobsMovedToDLQ++;
          }

          // Mark job as failed
          await adminClient
            .from('qc_jobs')
            .update({
              status: 'failed',
              error_message: `Watchdog: No heartbeat for ${Math.round((now - lastActivity) / 1000)} seconds. Job moved to DLQ.`,
              completed_at: new Date().toISOString(),
              progress: 100,
            })
            .eq('id', job.id);

        } catch (processError: any) {
          console.error(`[Watchdog] Failed to process stuck job ${job.id}:`, processError.message);
          failedToProcess++;
        }
      }
    }

    const duration = Date.now() - startTime;
    metrics.lastWatchdogRun = new Date();
    
    console.log(`[Watchdog] Complete: checked=${checked}, stuck=${stuckFound}, movedToDLQ=${movedToDLQ}, failed=${failedToProcess}, duration=${duration}ms`);

    return { checked, stuckFound, movedToDLQ, failedToProcess };
  } catch (error: any) {
    console.error('[Watchdog] Unexpected error:', error.message);
    return { checked, stuckFound, movedToDLQ, failedToProcess };
  }
}

/**
 * Get watchdog metrics
 */
export function getWatchdogMetrics(): typeof metrics {
  return { ...metrics };
}

/**
 * Reset metrics (for testing)
 */
export function resetWatchdogMetrics(): void {
  metrics.heartbeatsSent = 0;
  metrics.stuckJobsDetected = 0;
  metrics.jobsMovedToDLQ = 0;
  metrics.lastWatchdogRun = null;
}
