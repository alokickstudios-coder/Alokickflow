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
import { runQcForJob, QcJobContext } from "./engine";
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
  } catch (e) {
    // Use default
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

  if (fetchError || !queuedJobs || queuedJobs.length === 0) {
    console.log("[QCWorker] No queued jobs found");
    return { processed: 0, errors: 0 };
  }

  console.log(`[QCWorker] Processing ${queuedJobs.length} jobs (max concurrent: ${maxConcurrent})`);

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
        })
        .eq("id", job.id);
    }
  }

  return { processed, errors };
}

/**
 * Process a single QC job directly (called from parallel batch)
 */
async function processQcJobDirect(
  job: QcJobRow,
  adminClient: ReturnType<typeof getAdminClient>
): Promise<{ status: string } | null> {
  console.log(`[QCWorker] Processing job ${job.id}`);
  
  try {
    // Update progress to 10%
    await updateJobProgress(job.id, 10, adminClient!);

    // Get enabled features
    const featuresEnabled = await getEnabledQCFeatures(job.organisation_id);

    // Update progress to 20%
    await updateJobProgress(job.id, 20, adminClient!);

    // Resolve file
    const context = await resolveFileContext(job, adminClient);
    
    // Update progress to 40%
    await updateJobProgress(job.id, 40, adminClient!);

    // Run QC
    const qcResult = await runQcForJob(job, context, featuresEnabled);

    // Update progress to 90%
    await updateJobProgress(job.id, 90, adminClient!);

    // Save results
    await adminClient!
      .from("qc_jobs")
      .update({
        status: "completed",
        result_json: qcResult,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        progress: 100,
      })
      .eq("id", job.id);

    // Update delivery if linked
    if (job.delivery_id) {
      await updateDeliveryRecord(job.delivery_id, qcResult, adminClient);
    }

    // Trigger Creative QC (non-blocking)
    triggerCreativeQC(job.id, job.organisation_id, qcResult, adminClient).catch(() => {});

    // Cleanup temp files
    if (context.cleanup) {
      await context.cleanup();
    }

    console.log(`[QCWorker] Job ${job.id} completed successfully`);
    return { status: "completed" };

  } catch (error: any) {
    console.error(`[QCWorker] Job ${job.id} failed:`, error);

    await adminClient!
      .from("qc_jobs")
      .update({
        status: "failed",
        error_message: error.message || "Unknown error",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        progress: 100,
      })
      .eq("id", job.id);

    return { status: "failed" };
  }
}

/**
 * Update job progress
 */
async function updateJobProgress(
  jobId: string, 
  progress: number,
  adminClient: ReturnType<typeof getAdminClient>
): Promise<void> {
  try {
    await adminClient!
      .from("qc_jobs")
      .update({ 
        progress, 
        updated_at: new Date().toISOString() 
      })
      .eq("id", jobId);
  } catch (e) {
    // Ignore progress update errors
  }
}

/**
 * Resolve file context based on source_type
 */
async function resolveFileContext(
  job: QcJobRow,
  adminClient: ReturnType<typeof getAdminClient>
): Promise<QcJobContext> {
  if (!job.source_path) {
    throw new Error("Job missing source_path");
  }

  if (job.source_type === "drive_link") {
    // Google Drive file - download via API
    return await resolveDriveFile(job.source_path, adminClient!, job);
  } else if (job.source_type === "upload") {
    // Supabase Storage file - download from bucket
    return await resolveStorageFile(job.source_path, adminClient!);
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
  } catch (e) {}
  
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
  const { createWriteStream } = await import("fs");
  const { join } = await import("path");
  const { existsSync } = await import("fs");
  const { Readable } = await import("stream");
  const { pipeline } = await import("stream/promises");

  // Use platform-agnostic temp directory
  let tempDir = "/tmp/qc-processing";
  try {
    const { isCloudEnvironment } = await import("@/lib/config/platform");
    if (!isCloudEnvironment()) {
      tempDir = join(process.cwd(), "tmp", "qc-processing");
    }
  } catch (e) {}
  
  if (!existsSync(tempDir)) {
    await mkdir(tempDir, { recursive: true });
  }

  const fileName = metadata.name || driveFileId;
  const tempPath = join(tempDir, `${Date.now()}-${fileName.replace(/[^a-zA-Z0-9.-]/g, '_')}`);
  
  // Stream download to file (memory efficient)
  const fileStream = createWriteStream(tempPath);
  
  // Convert fetch response to Node.js readable stream
  if (response.body) {
    const reader = response.body.getReader();
    const nodeStream = new Readable({
      async read() {
        const { done, value } = await reader.read();
        if (done) {
          this.push(null);
        } else {
          this.push(Buffer.from(value));
        }
      }
    });
    
    await pipeline(nodeStream, fileStream);
  } else {
    // Fallback for environments without ReadableStream
    const arrayBuffer = await response.arrayBuffer();
    const { writeFile } = await import("fs/promises");
    await writeFile(tempPath, Buffer.from(arrayBuffer));
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
      } catch (e) {
        // Ignore cleanup errors
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
  } catch (e) {}
  
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
  } catch (e) {}
  
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

