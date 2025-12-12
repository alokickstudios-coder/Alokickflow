/**
 * QC Worker - Environment-Agnostic Job Processing
 * 
 * This module contains the core worker logic that can run in:
 * - Local dev (via API route)
 * - Vercel (via API route + cron)
 * - Dedicated server (via standalone script)
 * 
 * NO environment-specific logic here - pure business logic.
 */

import { createClient } from "@supabase/supabase-js";
import { runQcForJob, QcJobContext } from "./engine";
import { getEnabledQCFeatures } from "./engine";
import { logQCEvent } from "@/lib/utils/qc-logger";
import { decrypt } from "@/lib/utils/crypto";

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
 * Process a batch of QC jobs
 * 
 * @param limit Maximum number of jobs to process
 * @returns Summary of processed jobs
 */
export async function processBatch(limit: number = 5): Promise<{ processed: number; errors: number }> {
  let processed = 0;
  let errors = 0;

  for (let i = 0; i < limit; i++) {
    try {
      const job = await processNextQcJob();
      if (!job) {
        break; // No more jobs
      }
      processed++;
      if (job.status === "failed") {
        errors++;
      }
    } catch (error: any) {
      console.error(`[QCWorker] Error in batch processing:`, error);
      errors++;
      // Continue with next job
    }
  }

  return { processed, errors };
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

  // Download file from Drive
  const downloadUrl = `https://www.googleapis.com/drive/v3/files/${driveFileId}?alt=media`;
  const response = await fetch(downloadUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to download from Google Drive: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Save to temp location (use /tmp on Vercel, local tmp otherwise)
  const { writeFile, mkdir } = await import("fs/promises");
  const { join } = await import("path");
  const { existsSync } = await import("fs");

  // On serverless/cloud (Vercel, Render), use /tmp which is writable; locally use project tmp
  const isCloud = !!process.env.VERCEL || !!process.env.RENDER || !!process.env.RAILWAY_ENVIRONMENT;
  const tempDir = isCloud ? "/tmp/qc-processing" : join(process.cwd(), "tmp", "qc-processing");
  if (!existsSync(tempDir)) {
    await mkdir(tempDir, { recursive: true });
  }

  const tempPath = join(tempDir, `${Date.now()}-${driveFileId}`);
  await writeFile(tempPath, buffer);

  return {
    filePath: tempPath,
    fileName: driveFileId,
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

  const arrayBuffer = await data.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Save to temp location (use /tmp on Vercel, local tmp otherwise)
  const { writeFile, mkdir } = await import("fs/promises");
  const { join } = await import("path");
  const { existsSync } = await import("fs");

  // On serverless/cloud (Vercel, Render), use /tmp which is writable; locally use project tmp
  const isCloud = !!process.env.VERCEL || !!process.env.RENDER || !!process.env.RAILWAY_ENVIRONMENT;
  const tempDir = isCloud ? "/tmp/qc-processing" : join(process.cwd(), "tmp", "qc-processing");
  if (!existsSync(tempDir)) {
    await mkdir(tempDir, { recursive: true });
  }

  const fileName = storagePath.split("/").pop() || "file";
  const tempPath = join(tempDir, `${Date.now()}-${fileName}`);
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

