/**
 * QC Worker - Platform-Agnostic Job Processing
 * 
 * This module contains the core worker logic that can run on ANY platform:
 * - Render, Vercel, Railway, Heroku, AWS, GCP, self-hosted
 * 
 * Uses centralized platform config for environment detection.
 * Optimized for memory efficiency on constrained environments.
 */

import { createClient } from "@supabase/supabase-js";
import { runQcForJob, QcJobContext, QCFeatures } from "./engine";
import { getEnabledQCFeatures } from "./engine";
import { logQCEvent } from "@/lib/utils/qc-logger";
import { decrypt } from "@/lib/utils/crypto";

/**
 * Clean up old temp files to prevent disk/memory buildup
 * Runs at the start of each batch to keep temp directory clean
 */
async function cleanupOldTempFiles(): Promise<void> {
  try {
    const { readdir, stat, unlink } = await import("fs/promises");
    const { join } = await import("path");
    const { existsSync } = await import("fs");

    const tempDir = "/tmp/qc-processing";
    if (!existsSync(tempDir)) return;

    const files = await readdir(tempDir);
    const now = Date.now();
    const MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

    let cleaned = 0;
    for (const file of files) {
      try {
        const filePath = join(tempDir, file);
        const fileStat = await stat(filePath);
        const age = now - fileStat.mtimeMs;
        
        if (age > MAX_AGE_MS) {
          await unlink(filePath);
          cleaned++;
        }
      } catch (e) {
        // Ignore individual file errors
      }
    }

    if (cleaned > 0) {
      console.log(`[QCWorker] Cleaned up ${cleaned} old temp files`);
    }
  } catch (e) {
    // Ignore cleanup errors
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getAdminClient() {
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export interface QcJobRow {
  id: string;
  organisation_id: string;
  project_id: string | null;
  episode_id: string | null;
  delivery_id: string | null;
  source_type: 'upload' | 'drive_link' | null;
  source_path: string | null;
  file_name: string | null;
  status: string;
  qc_type: string;
  result_json: any;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Process a single QC job from the queue
 * 
 * @returns The processed job or null if no job was available
 */
export async function processNextQcJob(): Promise<QcJobRow | null> {
  const adminClient = getAdminClient();
  if (!adminClient) {
    throw new Error("Admin client not available - check SUPABASE_SERVICE_ROLE_KEY");
  }

  // Select oldest queued job
  const { data: jobs, error: selectError } = await adminClient
    .from("qc_jobs")
    .select("*")
    .in("status", ["queued", "pending"])
    .order("created_at", { ascending: true })
    .limit(1);

  if (selectError) {
    console.error("[QCWorker] Error selecting job:", selectError);
    throw selectError;
  }

  if (!jobs || jobs.length === 0) {
    return null; // No jobs available
  }

  const job: QcJobRow = jobs[0] as QcJobRow;
  console.log(`[QCWorker] Processing job ${job.id} for org ${job.organisation_id}`);

  // Check if job was cancelled before we start
  const { data: currentJob, error: checkError } = await adminClient
    .from("qc_jobs")
    .select("status")
    .eq("id", job.id)
    .single();

  if (checkError) {
    console.error(`[QCWorker] Error checking job ${job.id} status:`, checkError);
    throw checkError;
  }

  if (currentJob?.status === "cancelled") {
    console.log(`[QCWorker] Job ${job.id} was cancelled, skipping`);
    return null; // Skip cancelled job
  }

  // Mark as running
  const { error: updateError } = await adminClient
    .from("qc_jobs")
    .update({
      status: "running",
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id);

  if (updateError) {
    console.error(`[QCWorker] Error marking job ${job.id} as running:`, updateError);
    throw updateError;
  }

  logQCEvent.qcStarted(job.id, job.organisation_id, job.project_id || "");

  try {
    // Check again if job was cancelled after marking as running
    const { data: runningJob, error: runningCheckError } = await adminClient
      .from("qc_jobs")
      .select("status")
      .eq("id", job.id)
      .single();

    if (runningCheckError) {
      console.warn(`[QCWorker] Could not check cancellation status for job ${job.id}`);
    } else if (runningJob?.status === "cancelled") {
      console.log(`[QCWorker] Job ${job.id} was cancelled, aborting`);
      return null; // Abort cancelled job
    }

    // Get enabled features for this organization
    const featuresEnabled = await getEnabledQCFeatures(job.organisation_id);

    // Resolve file based on source_type
    const context = await resolveFileContext(job, adminClient);

    // Run QC engine
    const qcResult = await runQcForJob(job, context, featuresEnabled);

    // Update job with results
    const { error: resultError } = await adminClient
      .from("qc_jobs")
      .update({
        status: "completed",
        result_json: qcResult,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    if (resultError) {
      console.error(`[QCWorker] Error updating job ${job.id} with results:`, resultError);
      throw resultError;
    }

    // Update delivery record if linked
    if (job.delivery_id) {
      await updateDeliveryRecord(job.delivery_id, qcResult, adminClient);
    }

    logQCEvent.qcCompleted(job.id, qcResult.status === "passed" ? "passed" : "failed", qcResult.score, job.organisation_id);

    // Trigger Creative QC if enabled for this organization (non-blocking)
    triggerCreativeQC(job.id, job.organisation_id, qcResult, adminClient).catch((err) => {
      console.warn(`[QCWorker] Creative QC trigger failed for job ${job.id}:`, err.message);
    });

    console.log(`[QCWorker] Successfully completed job ${job.id}`);
    return { ...job, status: "completed", result_json: qcResult };
  } catch (error: any) {
    // Check if job was cancelled (don't mark as failed if cancelled)
    const { data: cancelledCheck, error: cancelledCheckError } = await adminClient
      .from("qc_jobs")
      .select("status")
      .eq("id", job.id)
      .single();

    if (!cancelledCheckError && cancelledCheck?.status === "cancelled") {
      console.log(`[QCWorker] Job ${job.id} was cancelled during processing`);
      return null; // Don't mark as failed if cancelled
    }

    console.error(`[QCWorker] Error processing job ${job.id}:`, error);

    // Mark job as failed (only if not cancelled)
    await adminClient
      .from("qc_jobs")
      .update({
        status: "failed",
        error_message: error.message || "Unknown error",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    logQCEvent.qcFailed(job.id, error, job.organisation_id);

    return { ...job, status: "failed", error_message: error.message || "Unknown error" };
  }
}

/**
 * Process a batch of QC jobs - SEQUENTIAL to prevent memory overflow
 * 
 * Memory-optimized: Process one job at a time to keep memory usage low
 * 
 * @param limit Maximum number of jobs to process
 * @returns Summary of processed jobs
 */
export async function processBatch(limit: number = 5): Promise<{ processed: number; errors: number }> {
  console.log(`[QCWorker] ====== BATCH START ======`);
  
  // Clean up old temp files to prevent disk/memory buildup
  await cleanupOldTempFiles();

  const adminClient = getAdminClient();
  if (!adminClient) {
    console.error("[QCWorker] Admin client not available");
    return { processed: 0, errors: 0 };
  }

  // Get platform-specific limits
  let maxConcurrent = 1; // Default to 1 for memory safety
  try {
    const { getProcessingLimits } = await import("@/lib/config/platform");
    const limits = getProcessingLimits();
    maxConcurrent = limits.maxConcurrentJobs;
    console.log(`[QCWorker] Platform limits: maxConcurrent=${maxConcurrent}`);
  } catch (e) {
    console.log(`[QCWorker] Using default limits: maxConcurrent=1`);
  }

  // AUTO-RECOVERY: Reset jobs stuck in "running" for > 2 minutes
  // Check both started_at AND updated_at to catch all stuck scenarios
  try {
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    
    // Get ALL running jobs first
    const { data: runningJobs, error: runningError } = await adminClient
      .from("qc_jobs")
      .select("id, file_name, started_at, updated_at, progress")
      .eq("status", "running");

    if (!runningError && runningJobs && runningJobs.length > 0) {
      const stuckJobs = runningJobs.filter(job => {
        // Job is stuck if:
        // 1. started_at is more than 2 minutes ago, OR
        // 2. updated_at is more than 2 minutes ago AND progress < 50
        const startedAt = job.started_at ? new Date(job.started_at) : null;
        const updatedAt = job.updated_at ? new Date(job.updated_at) : null;
        const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000);
        
        if (startedAt && startedAt < twoMinAgo) return true;
        if (updatedAt && updatedAt < twoMinAgo && (job.progress || 0) < 50) return true;
        return false;
      });

      if (stuckJobs.length > 0) {
        console.log(`[QCWorker] Found ${stuckJobs.length} stuck job(s), resetting...`);
        for (const stuck of stuckJobs) {
          console.log(`[QCWorker] Resetting stuck job: ${stuck.id} (${stuck.file_name}) - was at ${stuck.progress}%`);
          await adminClient
            .from("qc_jobs")
            .update({
              status: "failed",
              progress: 100,
              error_message: `Processing timeout - job stuck at ${stuck.progress || 0}%. Please retry.`,
              completed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", stuck.id);
        }
      }
    }
  } catch (stuckCheckError: any) {
    console.warn("[QCWorker] Stuck job check failed:", stuckCheckError.message);
  }

  // Cap at provided limit
  const effectiveLimit = Math.min(limit, maxConcurrent);

  // Fetch queued jobs
  const { data: queuedJobs, error: fetchError } = await adminClient
    .from("qc_jobs")
    .select("*")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(effectiveLimit);

  if (fetchError) {
    console.error("[QCWorker] Failed to fetch jobs:", fetchError.message);
    return { processed: 0, errors: 0 };
  }
  
  if (!queuedJobs || queuedJobs.length === 0) {
    console.log("[QCWorker] No queued jobs found");
    console.log(`[QCWorker] ====== BATCH END (no work) ======`);
    return { processed: 0, errors: 0 };
  }

  console.log(`[QCWorker] Found ${queuedJobs.length} queued job(s) to process`);
  for (const j of queuedJobs) {
    console.log(`[QCWorker]   - ${j.id}: ${j.file_name || "unnamed"} (${j.source_type})`);
  }

  let processed = 0;
  let errors = 0;

  // Process jobs ONE AT A TIME to prevent memory overflow
  // This is crucial for Render's 512MB free tier
  for (const job of queuedJobs) {
    try {
      // Mark as running
      await adminClient
        .from("qc_jobs")
        .update({ 
          status: "running", 
          started_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);

      // Process the job
      const result = await processQcJobDirect(job, adminClient);
      processed++;
      
      if (result?.status === "failed") {
        errors++;
      }

      // Force garbage collection hint between jobs
      if (global.gc) {
        global.gc();
      }

    } catch (error: any) {
      console.error(`[QCWorker] Job ${job.id} failed:`, error.message);
      errors++;
      
      // Mark as failed
      await adminClient
        .from("qc_jobs")
        .update({
          status: "failed",
          error_message: error.message || "Processing failed",
          completed_at: new Date().toISOString(),
          progress: 100,
        })
        .eq("id", job.id);
    }
  }

  console.log(`[QCWorker] ====== BATCH END: ${processed} processed, ${errors} errors ======`);
  return { processed, errors };
}

/**
 * Check if job has been cancelled or paused
 */
/**
 * Check if job has been cancelled or paused
 * 
 * IMPORTANT: This function must NOT silently swallow errors.
 * A database error should be treated as "unknown state" and logged.
 */
async function isJobCancelled(
  jobId: string,
  adminClient: ReturnType<typeof getAdminClient>
): Promise<boolean> {
  try {
    const { data, error } = await adminClient!
      .from("qc_jobs")
      .select("status")
      .eq("id", jobId)
      .single();
    
    if (error) {
      // Log the error but don't throw - treat as "not cancelled" to allow retry
      console.error(`[QCWorker] isJobCancelled DB error for ${jobId}:`, error.message);
      return false;
    }
    
    return data?.status === "cancelled" || data?.status === "paused";
  } catch (error: any) {
    // Log unexpected errors - this helps debug silent failures
    console.error(`[QCWorker] isJobCancelled unexpected error for ${jobId}:`, error.message);
    // Return false to allow the job to continue - will fail at next checkpoint if DB is down
    return false;
  }
}

/**
 * Process a single QC job directly (called from batch)
 * Includes cancellation checks and granular progress updates
 */
async function processQcJobDirect(
  job: QcJobRow,
  adminClient: ReturnType<typeof getAdminClient>
): Promise<{ status: string } | null> {
  const jobId = job.id;
  const fileName = job.file_name || "unknown";
  console.log(`[QCWorker] ========== START JOB ${jobId} ==========`);
  console.log(`[QCWorker] File: ${fileName}, Source: ${job.source_type}`);
  const startTime = Date.now();

  try {
    // Check if already cancelled before starting
    if (await isJobCancelled(jobId, adminClient)) {
      console.log(`[QCWorker] Job ${jobId} was cancelled before processing`);
      return { status: "cancelled" };
    }

    // Stage 1: Initialize (5%)
    await updateJobProgress(jobId, 5, adminClient, "initializing");

    // Get enabled features
    console.log(`[QCWorker] Loading features for org ${job.organisation_id}`);
    const featuresEnabled = await getEnabledQCFeatures(job.organisation_id);
    console.log(`[QCWorker] Features: lipSync=${featuresEnabled.lipSyncQC}, bgm=${featuresEnabled.bgmQC}`);
    await updateJobProgress(jobId, 10, adminClient, "features_loaded");

    // Check cancellation
    if (await isJobCancelled(jobId, adminClient)) {
      console.log(`[QCWorker] Job ${jobId} cancelled during feature check`);
      return { status: "cancelled" };
    }

    // Stage 2: File Resolution (15-40%)
    await updateJobProgress(jobId, 15, adminClient, "downloading");
    console.log(`[QCWorker] Downloading file from ${job.source_type}: ${job.source_path}`);
    
    // Resolve file with inline progress updates
    let context: QcJobContext;
    try {
      await updateJobProgress(jobId, 20, adminClient, "downloading");
      context = await resolveFileContext(job, adminClient);
      console.log(`[QCWorker] Downloaded to: ${context.filePath}`);
      await updateJobProgress(jobId, 40, adminClient, "download_complete");
    } catch (downloadError: any) {
      console.error(`[QCWorker] Download failed for ${jobId}:`, downloadError.message);
      throw new Error(`File download failed: ${downloadError.message}`);
    }

    // Check cancellation after file download
    if (await isJobCancelled(jobId, adminClient)) {
      console.log(`[QCWorker] Job ${jobId} cancelled after download`);
      if (context.cleanup) await context.cleanup();
      return { status: "cancelled" };
    }

    // Stage 3: Basic QC Analysis (45-75%)
    await updateJobProgress(jobId, 45, adminClient, "analyzing");
    console.log(`[QCWorker] Running QC analysis on ${context.filePath}`);
    
    const QC_ANALYSIS_TIMEOUT_MS = 180000; // 3 minutes max for QC analysis
    
    let qcResult: any;
    try {
      // Run QC with progress updates AND timeout
      const qcPromise = runQcForJob(job, context, featuresEnabled, async (percent, stage) => {
        const mappedProgress = 45 + Math.floor(percent * 0.30);
        await updateJobProgress(jobId, mappedProgress, adminClient, stage);
      });
      
      // Wrap with timeout to prevent indefinite hangs
      qcResult = await withTimeout(
        qcPromise,
        QC_ANALYSIS_TIMEOUT_MS,
        `QC analysis timed out after ${QC_ANALYSIS_TIMEOUT_MS / 1000} seconds`
      );
      
      console.log(`[QCWorker] QC completed: status=${qcResult.status}, score=${qcResult.score}`);
    } catch (qcError: any) {
      console.error(`[QCWorker] QC analysis failed for ${jobId}:`, qcError.message);
      if (context.cleanup) await context.cleanup();
      throw new Error(`QC analysis failed: ${qcError.message}`);
    }

    await updateJobProgress(jobId, 75, adminClient, "analysis_complete");

    // Check cancellation before saving
    if (await isJobCancelled(jobId, adminClient)) {
      console.log(`[QCWorker] Job ${jobId} cancelled after QC processing`);
      if (context.cleanup) await context.cleanup();
      return { status: "cancelled" };
    }

    // Stage 4: Saving Results (80%)
    await updateJobProgress(jobId, 80, adminClient, "saving_results");
    console.log(`[QCWorker] Saving results for ${jobId}`);

    // Save results
    const { error: saveError } = await adminClient!
      .from("qc_jobs")
      .update({
        status: "completed",
        result_json: qcResult,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        progress: 85,
      })
      .eq("id", jobId);

    if (saveError) {
      console.error(`[QCWorker] Failed to save results for ${jobId}:`, saveError.message);
      throw new Error(`Failed to save results: ${saveError.message}`);
    }

    // Update delivery if linked
    if (job.delivery_id) {
      await updateJobProgress(jobId, 88, adminClient, "updating_delivery");
      try {
        await updateDeliveryRecord(job.delivery_id, qcResult, adminClient);
        console.log(`[QCWorker] Updated delivery ${job.delivery_id}`);
      } catch (deliveryError: any) {
        console.warn(`[QCWorker] Delivery update failed (non-fatal):`, deliveryError.message);
      }
    }

    // Stage 5: Creative QC (90%) - non-blocking
    await updateJobProgress(jobId, 90, adminClient, "creative_qc");
    triggerCreativeQC(jobId, job.organisation_id, qcResult, adminClient).catch((err) => {
      console.warn(`[QCWorker] Creative QC trigger failed (non-fatal):`, err.message);
    });

    // Stage 6: Cleanup (95%)
    await updateJobProgress(jobId, 95, adminClient, "cleanup");
    if (context.cleanup) {
      try {
        await context.cleanup();
        console.log(`[QCWorker] Cleaned up temp files for ${jobId}`);
      } catch (cleanupError: any) {
        console.warn(`[QCWorker] Cleanup failed (non-fatal):`, cleanupError.message);
      }
    }

    // Complete - mark 100%
    await adminClient!
      .from("qc_jobs")
      .update({
        progress: 100,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[QCWorker] ========== COMPLETE JOB ${jobId} in ${duration}s ==========`);
    return { status: "completed" };

  } catch (error: any) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`[QCWorker] ========== FAILED JOB ${jobId} after ${duration}s ==========`);
    console.error(`[QCWorker] Error:`, error.message);
    console.error(`[QCWorker] Stack:`, error.stack?.split("\n").slice(0, 5).join("\n"));

    // Check if job was cancelled during processing (don't mark as failed)
    if (await isJobCancelled(jobId, adminClient)) {
      console.log(`[QCWorker] Job ${jobId} was cancelled during processing`);
      return { status: "cancelled" };
    }

    // Mark as failed with detailed error
    await adminClient!
      .from("qc_jobs")
      .update({
        status: "failed",
        error_message: error.message || "Unknown error",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        progress: 100,
      })
      .eq("id", jobId);

    return { status: "failed" };
  }
}

/**
 * Update job progress - robust version with error logging
 */
async function updateJobProgress(
  jobId: string, 
  progress: number,
  adminClient: ReturnType<typeof getAdminClient>,
  stage?: string
): Promise<void> {
  try {
    const updateData: any = { 
      progress, 
      updated_at: new Date().toISOString() 
    };
    
    const { error } = await adminClient!
      .from("qc_jobs")
      .update(updateData)
      .eq("id", jobId);
    
    if (error) {
      console.warn(`[QCWorker] Progress update error for ${jobId}:`, error.message);
    } else {
      console.log(`[QCWorker] Job ${jobId}: ${progress}%${stage ? ` (${stage})` : ""}`);
    }
  } catch (e: any) {
    console.warn(`[QCWorker] Progress update exception for ${jobId}:`, e.message);
  }
}

/**
 * Wrap a promise with a timeout
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => 
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    )
  ]);
}

/**
 * Resolve file context based on source_type
 * Includes 60-second timeout for file downloads
 */
async function resolveFileContext(
  job: QcJobRow,
  adminClient: ReturnType<typeof getAdminClient>
): Promise<QcJobContext> {
  if (!job.source_path) {
    throw new Error("Job missing source_path");
  }

  const DOWNLOAD_TIMEOUT_MS = 60000; // 60 seconds

  try {
    if (job.source_type === "drive_link") {
      // Google Drive file - download via API with timeout
      return await withTimeout(
        resolveDriveFile(job.source_path, adminClient!, job),
        DOWNLOAD_TIMEOUT_MS,
        "Google Drive download timed out after 60 seconds. File may be too large or connection is slow."
      );
    } else if (job.source_type === "upload") {
      // Supabase Storage file - download from bucket with timeout
      return await withTimeout(
        resolveStorageFile(job.source_path, adminClient!),
        DOWNLOAD_TIMEOUT_MS,
        "File download timed out after 60 seconds. File may be too large."
      );
    } else {
      throw new Error(`Unknown source_type: ${job.source_type}`);
    }
  } catch (error: any) {
    // Enhance error message
    if (error.message.includes("token") || error.message.includes("401") || error.message.includes("403")) {
      throw new Error(`Google Drive access denied. Please reconnect Google Drive in Settings.`);
    }
    if (error.message.includes("404") || error.message.includes("not found")) {
      throw new Error(`File not found. It may have been deleted or moved.`);
    }
    throw error;
  }
}

/**
 * Resolve file context with progress reporting
 */
async function resolveFileContextWithProgress(
  job: QcJobRow,
  adminClient: ReturnType<typeof getAdminClient>,
  onProgress?: (percent: number) => Promise<void>
): Promise<QcJobContext> {
  if (!job.source_path) {
    throw new Error("Job missing source_path");
  }

  if (onProgress) await onProgress(0);

  if (job.source_type === "drive_link") {
    // Google Drive file - download via API with progress
    return await resolveDriveFileWithProgress(job.source_path, adminClient!, job, onProgress);
  } else if (job.source_type === "upload") {
    // Supabase Storage file - download from bucket with progress
    return await resolveStorageFileWithProgress(job.source_path, adminClient!, onProgress);
  } else {
    throw new Error(`Unknown source_type: ${job.source_type}`);
  }
}


/**
 * Resolve file from Google Drive
 */
async function resolveDriveFile(
  driveFileId: string,
  adminClient: ReturnType<typeof getAdminClient>,
  job?: QcJobRow
): Promise<QcJobContext> {
  console.log(`[QCWorker] Resolving Drive file ${driveFileId} for job ${job?.id}`);
  
  // Try to get token from the user who created the job (via delivery)
  let accessToken: string | null = null;
  
  // First, check if token was stored in job metadata (temporary storage)
  // This is the most reliable source since it's stored at job creation time
  if (job?.result_json && typeof job.result_json === 'object' && job.result_json !== null) {
    const metadata = job.result_json as any;
    if (metadata.google_access_token) {
      const expiresAt = metadata.token_expires_at ? new Date(metadata.token_expires_at) : null;
      if (!expiresAt || expiresAt > new Date()) {
        console.log(`[QCWorker] Found access token in job metadata`);
        accessToken = metadata.google_access_token;
        
        // Clear token from job metadata after reading (for security)
        // We'll update this after processing
        try {
          await adminClient!
            .from("qc_jobs")
            .update({
              result_json: { ...metadata, google_access_token: undefined, token_expires_at: undefined }
            })
            .eq("id", job.id);
        } catch (clearError) {
          console.warn("[QCWorker] Failed to clear token from job metadata:", clearError);
        }
      } else {
        console.log(`[QCWorker] Token in job metadata expired, will look up fresh token`);
      }
    }
  }
  
  if (job?.delivery_id) {
    // Get the user who created the delivery
    const { data: delivery, error: deliveryError } = await adminClient!
      .from("deliveries")
      .select("vendor_id")
      .eq("id", job.delivery_id)
      .maybeSingle();
    
    if (deliveryError) {
      console.warn(`[QCWorker] Error fetching delivery ${job.delivery_id}:`, deliveryError);
    }
    
    if (delivery?.vendor_id) {
      console.log(`[QCWorker] Looking for token for user ${delivery.vendor_id}`);
      
      // Get token from that user (try user_id first, then id)
      let userTokens: any = null;
      let tokenError: any = null;
      
      // Try user_id first
      const { data: tokensByUserId, error: errorByUserId } = await adminClient!
        .from("google_tokens")
        .select("access_token, expires_at, refresh_token, user_id, id")
        .eq("user_id", delivery.vendor_id)
        .maybeSingle();

      if (tokensByUserId) {
        userTokens = tokensByUserId;
      } else {
        // Try id as fallback
        const { data: tokensById, error: errorById } = await adminClient!
          .from("google_tokens")
          .select("access_token, expires_at, refresh_token, user_id, id")
          .eq("id", delivery.vendor_id)
          .maybeSingle();

        userTokens = tokensById;
        tokenError = errorById || errorByUserId;
      }
      
      if (tokenError) {
        console.warn(`[QCWorker] Error fetching user token:`, tokenError);
      }
      
      if (userTokens?.access_token) {
        // Check if token is expired
        const expiresAt = userTokens.expires_at ? new Date(userTokens.expires_at) : null;
        if (!expiresAt || expiresAt > new Date()) {
          console.log(`[QCWorker] Found valid access token for user ${delivery.vendor_id}`);
          accessToken = userTokens.access_token;
        } else {
          console.log(`[QCWorker] Token expired for user ${delivery.vendor_id}, attempting refresh`);
        }
      }
      
      // Try to refresh if expired or missing
      if (!accessToken && userTokens?.refresh_token) {
        try {
          console.log(`[QCWorker] Refreshing token for user ${delivery.vendor_id}`);
          const { refreshAccessToken } = await import("@/lib/google-drive/client");
          const refreshed = await refreshAccessToken(userTokens.refresh_token);
          accessToken = refreshed.access_token;
          
          // Update token in DB
          const updateQuery = userTokens.user_id
            ? adminClient!.from("google_tokens").update({
                access_token: refreshed.access_token,
                expires_at: new Date(refreshed.expires_at || Date.now() + 3600000).toISOString(),
              }).eq("user_id", delivery.vendor_id)
            : adminClient!.from("google_tokens").update({
                access_token: refreshed.access_token,
                expires_at: new Date(refreshed.expires_at || Date.now() + 3600000).toISOString(),
              }).eq("id", userTokens.id || "default");

          await updateQuery;
          console.log(`[QCWorker] Token refreshed and saved`);
        } catch (refreshError) {
          console.warn("[QCWorker] Failed to refresh token:", refreshError);
        }
      }
    }
  }
  
  // Fallback: get any valid token (try id="default" first, then any valid token)
  if (!accessToken) {
    console.log(`[QCWorker] Trying fallback: checking for default token or any valid token`);
    
    try {
      // First try id="default" (this is how callback saves it)
      const { data: defaultToken, error: defaultError } = await adminClient!
        .from("google_tokens")
        .select("access_token, expires_at, refresh_token, user_id, id")
        .eq("id", "default")
        .maybeSingle();
      
      if (defaultError) {
        // Table might not exist - check error code
        if (defaultError.code === 'PGRST205' || defaultError.message?.includes('table') || defaultError.message?.includes('schema cache')) {
          console.error(`[QCWorker] google_tokens table does not exist! Please run: supabase/create-google-tokens-table.sql`);
          throw new Error("Google tokens table not found. Please run the database migration: supabase/create-google-tokens-table.sql");
        }
        console.warn(`[QCWorker] Error fetching default token:`, defaultError);
      }
      
      if (defaultToken?.access_token) {
        const expiresAt = defaultToken.expires_at ? new Date(defaultToken.expires_at) : null;
        if (!expiresAt || expiresAt > new Date()) {
          console.log(`[QCWorker] Found valid default token`);
          accessToken = defaultToken.access_token;
        } else if (defaultToken.refresh_token) {
          // Try to refresh default token
          try {
            console.log(`[QCWorker] Refreshing default token`);
            const { refreshAccessToken } = await import("@/lib/google-drive/client");
            const refreshed = await refreshAccessToken(defaultToken.refresh_token);
            accessToken = refreshed.access_token;
            
            // Update in DB
            await adminClient!
              .from("google_tokens")
              .update({
                access_token: refreshed.access_token,
                expires_at: new Date(refreshed.expires_at || Date.now() + 3600000).toISOString(),
              })
              .eq("id", "default");
          } catch (refreshError) {
            console.warn("[QCWorker] Failed to refresh default token:", refreshError);
          }
        }
      }
      
      // If still no token, try any valid token
      if (!accessToken) {
        const { data: orgTokens, error: orgTokenError } = await adminClient!
          .from("google_tokens")
          .select("access_token, expires_at, refresh_token, user_id, id")
          .gt("expires_at", new Date().toISOString())
          .limit(1)
          .maybeSingle();
        
        if (orgTokenError && orgTokenError.code !== 'PGRST205') {
          console.warn(`[QCWorker] Error fetching any org token:`, orgTokenError);
        }
        
        if (orgTokens?.access_token) {
          console.log(`[QCWorker] Found valid fallback token`);
          accessToken = orgTokens.access_token;
        } else if (orgTokens?.refresh_token) {
          // Try to refresh any token
          try {
            console.log(`[QCWorker] Refreshing any available token`);
            const { refreshAccessToken } = await import("@/lib/google-drive/client");
            const refreshed = await refreshAccessToken(orgTokens.refresh_token);
            accessToken = refreshed.access_token;
          } catch (refreshError) {
            console.warn("[QCWorker] Failed to refresh any token:", refreshError);
          }
        }
      }
    } catch (tableError: any) {
      // If table doesn't exist, provide helpful error
      if (tableError.code === 'PGRST205' || tableError.message?.includes('table') || tableError.message?.includes('schema cache')) {
        throw new Error("Google tokens table not found. Please run the database migration: supabase/create-google-tokens-table.sql");
      }
      throw tableError;
    }
  }
  
  // Final fallback: env var
  if (!accessToken) {
    accessToken = process.env.GOOGLE_ACCESS_TOKEN || null;
    if (accessToken) {
      console.log(`[QCWorker] Using token from environment variable`);
    }
  }
  
  if (!accessToken) {
    console.error(`[QCWorker] No Google Drive access token found. Checked:`);
    console.error(`  - User token (via delivery.vendor_id)`);
    console.error(`  - Organization tokens`);
    console.error(`  - Environment variable`);
    throw new Error("Google Drive access token not configured. Please connect Google Drive in Settings.");
  }
  
  console.log(`[QCWorker] Using access token (length: ${accessToken.length})`);

  // Get file metadata first to check size
  const metadataUrl = `https://www.googleapis.com/drive/v3/files/${driveFileId}?fields=name,size,mimeType`;
  const metaResponse = await fetch(metadataUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  
  if (!metaResponse.ok) {
    throw new Error(`Failed to get file metadata: ${metaResponse.statusText}`);
  }
  
  const metadata = await metaResponse.json();
  const fileSizeMB = parseInt(metadata.size || "0") / (1024 * 1024);
  
  // Get platform limits
  let maxFileSizeMB = 100; // Default 100MB
  try {
    const { getProcessingLimits } = await import("@/lib/config/platform");
    maxFileSizeMB = getProcessingLimits().maxFileSizeMB;
  } catch (platformError: any) {
    // Log but continue with default - platform config is optional
    console.warn(`[QCWorker] Platform config unavailable, using default maxFileSizeMB=${maxFileSizeMB}:`, platformError.message);
  }
  
  if (fileSizeMB > maxFileSizeMB) {
    throw new Error(`File too large (${fileSizeMB.toFixed(1)}MB). Maximum allowed: ${maxFileSizeMB}MB. Please use a smaller file or upgrade your plan.`);
  }
  
  console.log(`[QCWorker] Downloading ${metadata.name} (${fileSizeMB.toFixed(1)}MB)`);

  // Download file using streaming to reduce memory usage
  const downloadUrl = `https://www.googleapis.com/drive/v3/files/${driveFileId}?alt=media`;
  const response = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to download from Google Drive: ${response.statusText}`);
  }

  // Setup temp directory
  const { mkdir } = await import("fs/promises");
  const { join } = await import("path");
  const { existsSync } = await import("fs");

  // Use platform-agnostic temp directory
  let tempDir = "/tmp/qc-processing";
  try {
    const { isCloudEnvironment } = await import("@/lib/config/platform");
    if (!isCloudEnvironment()) {
      tempDir = join(process.cwd(), "tmp", "qc-processing");
    }
  } catch (platformError: any) {
    // Log but continue with default - platform detection is optional
    console.debug(`[QCWorker] Platform detection unavailable, using default tempDir=${tempDir}`);
  }
  
  if (!existsSync(tempDir)) {
    await mkdir(tempDir, { recursive: true });
  }

  const fileName = metadata.name || driveFileId;
  const tempPath = join(tempDir, `${Date.now()}-${fileName.replace(/[^a-zA-Z0-9.-]/g, '_')}`);
  
  // Download file - use simple arrayBuffer approach for compatibility
  // The streaming approach caused "p is not a constructor" errors in some environments
  console.log(`[QCWorker] Downloading file to ${tempPath}...`);
  
  try {
    const arrayBuffer = await response.arrayBuffer();
    const { writeFile } = await import("fs/promises");
    await writeFile(tempPath, Buffer.from(arrayBuffer));
    console.log(`[QCWorker] File written successfully (${(arrayBuffer.byteLength / 1024 / 1024).toFixed(2)} MB)`);
  } catch (writeError: any) {
    console.error(`[QCWorker] Failed to write file:`, writeError.message);
    throw new Error(`Failed to save downloaded file: ${writeError.message}`);
  }

  console.log(`[QCWorker] Downloaded to ${tempPath}`);

  return {
    filePath: tempPath,
    fileName,
    cleanup: async () => {
      try {
        const { unlink } = await import("fs/promises");
        await unlink(tempPath);
        console.log(`[QCWorker] Cleaned up temp file: ${tempPath}`);
      } catch (cleanupError: any) {
        // Log cleanup errors but don't throw - cleanup is best-effort
        console.warn(`[QCWorker] Temp file cleanup failed for ${tempPath}:`, cleanupError.message);
      }
    },
  };
}

/**
 * Resolve file from Supabase Storage
 */
async function resolveStorageFile(
  storagePath: string,
  adminClient: ReturnType<typeof getAdminClient>
): Promise<QcJobContext> {
  // Download from Supabase Storage
  const { data, error } = await adminClient!.storage
    .from("deliveries")
    .download(storagePath);

  if (error || !data) {
    throw new Error(`Failed to download from storage: ${error?.message || "Unknown error"}`);
  }

  // Check file size
  const fileSizeMB = data.size / (1024 * 1024);
  let maxFileSizeMB = 100;
  try {
    const { getProcessingLimits } = await import("@/lib/config/platform");
    maxFileSizeMB = getProcessingLimits().maxFileSizeMB;
  } catch (platformError: any) {
    console.warn(`[QCWorker] Platform config unavailable for storage file, using default maxFileSizeMB=${maxFileSizeMB}`);
  }
  
  if (fileSizeMB > maxFileSizeMB) {
    throw new Error(`File too large (${fileSizeMB.toFixed(1)}MB). Maximum: ${maxFileSizeMB}MB`);
  }

  const arrayBuffer = await data.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Save to temp location using platform-agnostic config
  const { writeFile, mkdir } = await import("fs/promises");
  const { join } = await import("path");
  const { existsSync } = await import("fs");

  let tempDir = "/tmp/qc-processing";
  try {
    const { isCloudEnvironment } = await import("@/lib/config/platform");
    if (!isCloudEnvironment()) {
      tempDir = join(process.cwd(), "tmp", "qc-processing");
    }
  } catch (platformError: any) {
    console.debug(`[QCWorker] Platform detection unavailable for storage, using default tempDir=${tempDir}`);
  }
  
  if (!existsSync(tempDir)) {
    await mkdir(tempDir, { recursive: true });
  }

  const fileName = storagePath.split("/").pop() || "file";
  const tempPath = join(tempDir, `${Date.now()}-${fileName.replace(/[^a-zA-Z0-9.-]/g, '_')}`);
  await writeFile(tempPath, buffer);

  return {
    filePath: tempPath,
    fileName,
    cleanup: async () => {
      try {
        const { unlink } = await import("fs/promises");
        await unlink(tempPath);
      } catch (cleanupError: any) {
        console.warn(`[QCWorker] Storage temp file cleanup failed for ${tempPath}:`, cleanupError.message);
      }
    },
  };
}

/**
 * Resolve file from Google Drive with progress tracking
 */
async function resolveDriveFileWithProgress(
  driveFileId: string,
  adminClient: ReturnType<typeof getAdminClient>,
  job?: QcJobRow,
  onProgress?: (percent: number) => Promise<void>
): Promise<QcJobContext> {
  // Use the base implementation but add progress tracking
  // This is a simplified version - for full progress we'd need to track bytes
  if (onProgress) await onProgress(10);
  
  const context = await resolveDriveFile(driveFileId, adminClient, job);
  
  if (onProgress) await onProgress(100);
  return context;
}

/**
 * Resolve file from Supabase Storage with progress tracking
 */
async function resolveStorageFileWithProgress(
  storagePath: string,
  adminClient: ReturnType<typeof getAdminClient>,
  onProgress?: (percent: number) => Promise<void>
): Promise<QcJobContext> {
  if (onProgress) await onProgress(10);
  
  // Download from Supabase Storage
  const { data, error } = await adminClient!.storage
    .from("deliveries")
    .download(storagePath);

  if (error || !data) {
    throw new Error(`Failed to download from storage: ${error?.message || "Unknown error"}`);
  }

  if (onProgress) await onProgress(50);

  // Check file size
  const fileSizeMB = data.size / (1024 * 1024);
  let maxFileSizeMB = 100;
  try {
    const { getProcessingLimits } = await import("@/lib/config/platform");
    maxFileSizeMB = getProcessingLimits().maxFileSizeMB;
  } catch (platformError: any) {
    console.warn(`[QCWorker] Platform config unavailable for storage progress, using default maxFileSizeMB=${maxFileSizeMB}`);
  }
  
  if (fileSizeMB > maxFileSizeMB) {
    throw new Error(`File too large (${fileSizeMB.toFixed(1)}MB). Maximum: ${maxFileSizeMB}MB`);
  }

  if (onProgress) await onProgress(60);

  const arrayBuffer = await data.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (onProgress) await onProgress(80);

  // Save to temp location
  const { writeFile, mkdir } = await import("fs/promises");
  const { join } = await import("path");
  const { existsSync } = await import("fs");

  let tempDir = "/tmp/qc-processing";
  try {
    const { isCloudEnvironment } = await import("@/lib/config/platform");
    if (!isCloudEnvironment()) {
      tempDir = join(process.cwd(), "tmp", "qc-processing");
    }
  } catch (platformError: any) {
    console.debug(`[QCWorker] Platform detection unavailable for storage progress, using default tempDir=${tempDir}`);
  }
  
  if (!existsSync(tempDir)) {
    await mkdir(tempDir, { recursive: true });
  }

  const fileName = storagePath.split("/").pop() || "file";
  const tempPath = join(tempDir, `${Date.now()}-${fileName.replace(/[^a-zA-Z0-9.-]/g, '_')}`);
  await writeFile(tempPath, buffer);

  if (onProgress) await onProgress(100);

  return {
    filePath: tempPath,
    fileName,
    cleanup: async () => {
      try {
        const { unlink } = await import("fs/promises");
        await unlink(tempPath);
      } catch (e) {
        // Ignore cleanup errors
      }
    },
  };
}

/**
 * Update delivery record with QC results
 */
async function updateDeliveryRecord(
  deliveryId: string,
  qcResult: any,
  adminClient: ReturnType<typeof getAdminClient>
) {
  const status = qcResult.status === "passed" ? "qc_passed" :
                 qcResult.status === "failed" ? "qc_failed" : "needs_review";

  // Extract errors array
  const errors: any[] = [];
  if (qcResult.basicQC?.audioMissing?.detected) {
    errors.push({
      type: "Audio Missing",
      message: qcResult.basicQC.audioMissing.error,
      timestamp: 0,
      severity: "error",
    });
  }
  if (qcResult.basicQC?.loudness?.status === "failed") {
    errors.push({
      type: "Loudness Compliance",
      message: qcResult.basicQC.loudness.message,
      timestamp: 0,
      severity: "error",
    });
  }
  // Add more error extraction as needed

  await adminClient!
    .from("deliveries")
    .update({
      status,
      qc_report: qcResult,
      qc_errors: errors,
      updated_at: new Date().toISOString(),
    })
    .eq("id", deliveryId);
}

/**
 * Trigger Creative QC analysis after basic QC completes
 * This is non-blocking and runs asynchronously
 */
async function triggerCreativeQC(
  jobId: string,
  organizationId: string,
  qcResult: any,
  adminClient: ReturnType<typeof getAdminClient>
) {
  try {
    // Check if Creative QC is available and enabled
    const { isCreativeQCAvailable, getCreativeQCSettings, runCreativeQCAnalysis, extractTranscriptFromSubtitles } = 
      await import("@/lib/services/spi/engine");

    const availability = await isCreativeQCAvailable(organizationId);
    if (!availability.available) {
      console.log(`[QCWorker] Creative QC not available for org ${organizationId}: ${availability.reason}`);
      return;
    }

    const settings = await getCreativeQCSettings(organizationId);
    if (!settings?.enabled) {
      console.log(`[QCWorker] Creative QC not enabled for org ${organizationId}`);
      return;
    }

    // Mark Creative QC as running
    await adminClient!
      .from("qc_jobs")
      .update({
        creative_qc_status: "running",
        creative_qc_started_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    console.log(`[QCWorker] Starting Creative QC for job ${jobId}`);

    // Get transcript from QC result if available
    let transcript = qcResult.basicQC?.transcript?.text || qcResult.transcript?.text || "";

    // Try to get subtitle content from delivery
    const { data: job } = await adminClient!
      .from("qc_jobs")
      .select("delivery:deliveries(subtitle_content), project:projects(name, code)")
      .eq("id", jobId)
      .single();

    let subtitleContent = "";
    // Handle the joined data (could be array or object depending on Supabase version)
    const delivery = Array.isArray(job?.delivery) ? job.delivery[0] : job?.delivery;
    const project = Array.isArray(job?.project) ? job.project[0] : job?.project;
    
    if (delivery?.subtitle_content) {
      subtitleContent = delivery.subtitle_content;
      if (!transcript) {
        transcript = extractTranscriptFromSubtitles(subtitleContent);
      }
    }

    // Run Creative QC analysis
    const creativeResult = await runCreativeQCAnalysis({
      jobId,
      transcript,
      subtitleContent,
      context: {
        projectName: project?.name,
        seriesName: project?.code,
        targetAudience: settings.targetAudience,
        brandGuidelines: settings.brandGuidelines,
        platformType: settings.platformType,
        duration: qcResult.basicQC?.metadata?.duration,
      },
      audioAnalysis: {
        hasDialogue: !qcResult.basicQC?.audioMissing?.detected,
        hasBGM: qcResult.bgm?.bgmDetected ?? false,
        loudnessLUFS: qcResult.basicQC?.loudness?.lufs,
        silencePercentage: qcResult.basicQC?.silence?.totalSilenceDuration 
          ? (qcResult.basicQC.silence.totalSilenceDuration / (qcResult.basicQC.metadata?.duration || 1)) * 100
          : undefined,
      },
    }, settings);

    // Update job with Creative QC results
    const updateData: Record<string, any> = {
      creative_qc_completed_at: new Date().toISOString(),
    };

    if (creativeResult.status === "completed") {
      updateData.creative_qc_status = "completed";
      updateData.creative_qc_overall_score = creativeResult.overall_creative_score;
      updateData.creative_qc_overall_risk_score = creativeResult.overall_risk_score;
      updateData.creative_qc_overall_brand_fit_score = creativeResult.overall_brand_fit_score;
      updateData.creative_qc_parameters = creativeResult.parameters;
      updateData.creative_qc_summary = creativeResult.summary;
      updateData.creative_qc_recommendations = creativeResult.recommendations;
      console.log(`[QCWorker] Creative QC completed for job ${jobId}: score ${creativeResult.overall_creative_score}`);
    } else {
      updateData.creative_qc_status = "failed";
      updateData.creative_qc_error = creativeResult.error || "Analysis failed";
      console.log(`[QCWorker] Creative QC failed for job ${jobId}: ${creativeResult.error}`);
    }

    await adminClient!.from("qc_jobs").update(updateData).eq("id", jobId);

    // Generate SPI Fingerprint after Creative QC completes
    if (creativeResult.status === "completed") {
      try {
        console.log(`[QCWorker] Generating SPI Fingerprint for job ${jobId}`);
        await generateAndSaveSPIFingerprint(jobId, organizationId, qcResult, creativeResult, adminClient);
      } catch (fpError: any) {
        console.warn(`[QCWorker] Fingerprint generation failed (non-fatal):`, fpError.message);
      }
    }

  } catch (error: any) {
    console.error(`[QCWorker] Creative QC error for job ${jobId}:`, error);
    
    // Mark as failed
    await adminClient!
      .from("qc_jobs")
      .update({
        creative_qc_status: "failed",
        creative_qc_error: error.message || "Unknown error",
        creative_qc_completed_at: new Date().toISOString(),
      })
      .eq("id", jobId);
  }
}

/**
 * Generate and save SPI Fingerprint
 */
async function generateAndSaveSPIFingerprint(
  jobId: string,
  organizationId: string,
  qcResult: any,
  creativeResult: any,
  adminClient: ReturnType<typeof getAdminClient>
) {
  const { generateSPIFingerprint } = await import("@/lib/services/spi/fingerprint");

  // Get job details
  const { data: job } = await adminClient!
    .from("qc_jobs")
    .select(`
      *,
      delivery:deliveries(file_name, original_file_name, file_size, mime_type)
    `)
    .eq("id", jobId)
    .single();

  if (!job) {
    console.warn(`[QCWorker] Could not find job ${jobId} for fingerprint`);
    return;
  }

  const delivery = Array.isArray(job.delivery) ? job.delivery[0] : job.delivery;

  const input = {
    jobId,
    organizationId,
    fileName: job.file_name || delivery?.original_file_name || "unknown",
    fileSize: delivery?.file_size || 0,
    mimeType: delivery?.mime_type || "video/mp4",
    sourceType: job.source_type || "upload",
    sourcePath: job.source_path,
    
    mediaMetadata: {
      duration: qcResult.basicQC?.metadata?.duration,
      width: qcResult.basicQC?.metadata?.width,
      height: qcResult.basicQC?.metadata?.height,
      frameRate: qcResult.basicQC?.metadata?.frameRate,
      videoCodec: qcResult.basicQC?.metadata?.videoCodec,
      audioBitrate: qcResult.basicQC?.metadata?.audioBitrate,
      audioChannels: qcResult.basicQC?.metadata?.audioChannels,
    },
    
    audioAnalysis: {
      loudnessLUFS: qcResult.basicQC?.loudness?.lufs,
      silencePercentage: qcResult.basicQC?.silence?.percentage,
      hasBGM: qcResult.bgm?.bgmDetected,
      hasDialogue: !qcResult.basicQC?.audioMissing?.detected,
    },
    
    transcript: qcResult.transcript || creativeResult.raw_response?.transcript,
    
    spiResult: {
      overallCreativeScore: creativeResult.overall_creative_score,
      overallRiskScore: creativeResult.overall_risk_score,
      overallBrandFitScore: creativeResult.overall_brand_fit_score,
      parameters: creativeResult.parameters || {},
      summary: creativeResult.summary || "",
      recommendations: creativeResult.recommendations || [],
      detectedEmotions: creativeResult.detected_emotions || [],
      detectedThemes: creativeResult.detected_themes || [],
    },
  };

  const fingerprint = await generateSPIFingerprint(input);

  // Save fingerprint reference to database
  await adminClient!
    .from("qc_jobs")
    .update({
      spi_fingerprint_id: fingerprint._spi.fingerprint_id,
      spi_fingerprint_hash: fingerprint._spi.fingerprint_hash,
      spi_fingerprint_generated_at: fingerprint._spi.generated_at,
    })
    .eq("id", jobId);

  console.log(`[QCWorker] SPI Fingerprint generated: ${fingerprint._spi.fingerprint_id}`);
}

