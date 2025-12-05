/**
 * Standalone QC Worker Script
 * 
 * For dedicated server/container environments
 * 
 * Usage:
 *   npx tsx scripts/qcWorker.ts
 *   or
 *   npm run qc:worker
 * 
 * This script runs an infinite loop, processing QC jobs from the queue.
 * It uses the same worker logic as the API route, ensuring consistency.
 * 
 * Prerequisites:
 *   - Install tsx: npm install -D tsx
 *   - Or compile to JS first: npx tsc scripts/qcWorker.ts
 */

import { processBatch } from "../lib/services/qc/worker";
import { createClient } from "@supabase/supabase-js";

const BATCH_SIZE = 10;
const POLL_INTERVAL_MS = 2000; // 2 seconds between batches
const STUCK_JOB_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getAdminClient() {
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requeueStuckJobs() {
    console.log('[QCWorker] Checking for stuck jobs...');
    const adminClient = getAdminClient();
    if (!adminClient) {
        console.error('[QCWorker] Cannot requeue stuck jobs, admin client not available.');
        return;
    }

    const timeout = new Date(Date.now() - STUCK_JOB_TIMEOUT_MS).toISOString();

    const { data: stuckJobs, error } = await adminClient
        .from('qc_jobs')
        .select('id')
        .eq('status', 'running')
        .lt('started_at', timeout);

    if (error) {
        console.error('[QCWorker] Error fetching stuck jobs:', error);
        return;
    }

    if (stuckJobs && stuckJobs.length > 0) {
        console.log(`[QCWorker] Found ${stuckJobs.length} stuck jobs. Requeuing...`);
        const jobIds = stuckJobs.map(j => j.id);
        const { error: updateError } = await adminClient
            .from('qc_jobs')
            .update({ status: 'queued', started_at: null })
            .in('id', jobIds);

        if (updateError) {
            console.error('[QCWorker] Error requeuing stuck jobs:', updateError);
        } else {
            console.log('[QCWorker] Requeued stuck jobs successfully.');
        }
    } else {
        console.log('[QCWorker] No stuck jobs found.');
    }
}

async function main() {
  console.log("[QCWorker] Starting standalone QC worker...");
  console.log(`[QCWorker] Batch size: ${BATCH_SIZE}, Poll interval: ${POLL_INTERVAL_MS}ms`);

  await requeueStuckJobs();

  let totalProcessed = 0;
  let totalErrors = 0;

  while (true) {
    try {
      const result = await processBatch(BATCH_SIZE);
      
      totalProcessed += result.processed;
      totalErrors += result.errors;

      if (result.processed > 0) {
        console.log(
          `[QCWorker] Processed ${result.processed} job(s), ${result.errors} error(s) | Total: ${totalProcessed} processed, ${totalErrors} errors`
        );
      }

      // Sleep before next batch
      await sleep(POLL_INTERVAL_MS);
    } catch (error: any) {
      console.error("[QCWorker] Error in main loop:", error);
      // Continue running - don't crash on single batch failure
      await sleep(POLL_INTERVAL_MS * 2); // Wait longer after error
    }
  }
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\n[QCWorker] Received SIGINT, shutting down gracefully...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n[QCWorker] Received SIGTERM, shutting down gracefully...");
  process.exit(0);
});

// Start worker
main().catch((error) => {
  console.error("[QCWorker] Fatal error:", error);
  process.exit(1);
});
