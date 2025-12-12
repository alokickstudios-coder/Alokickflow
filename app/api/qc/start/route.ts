/**
 * POST /api/qc/start
 * 
 * Enqueue QC jobs - NON-BLOCKING
 * 
 * This endpoint:
 * 1. Validates user & subscription
 * 2. Handles uploads OR drive links
 * 3. Creates qc_jobs records with status 'queued'
 * 4. Returns immediately with job IDs
 * 
 * Actual QC processing happens via worker (process-queue endpoint)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import {
  getOrganisationSubscription,
  canProcessNewSeries,
} from "@/lib/services/subscriptionService";
import { getEnabledQCFeatures } from "@/lib/services/qc/engine";
import { extractDriveId } from "@/lib/google-drive";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60; // Short timeout - just enqueue, don't process

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getAdminClient() {
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * POST /api/qc/start
 * 
 * Request body can be:
 * - { files: File[], projectId?: string } - for uploads
 * - { driveLinks: string[], projectId?: string } - for Google Drive links
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's organization using admin client for reliable access
    const adminClient = getAdminClient();
    if (!adminClient) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    let { data: profile } = await adminClient
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    // Auto-create organization if needed
    if (!profile?.organization_id) {
      const { data: newOrg } = await adminClient
        .from("organizations")
        .insert({
          name: `${user.email?.split("@")[0] || "User"}'s Workspace`,
          subscription_tier: "enterprise",
        })
        .select()
        .single();

      if (newOrg) {
        if (!profile) {
          const { data: newProfile } = await adminClient
            .from("profiles")
            .insert({
              id: user.id,
              full_name: user.email?.split("@")[0] || "User",
              role: "admin",
              organization_id: newOrg.id,
            })
            .select()
            .single();
          profile = newProfile;
        } else {
          const { data: updatedProfile } = await adminClient
            .from("profiles")
            .update({ organization_id: newOrg.id })
            .eq("id", user.id)
            .select()
            .single();
          profile = updatedProfile;
        }
      }
    }

    if (!profile?.organization_id) {
      return NextResponse.json({ error: "Failed to setup organization. Please refresh." }, { status: 500 });
    }

    const orgId = profile.organization_id;

    // Check subscription
    const subscription = await getOrganisationSubscription(orgId);
    if (!subscription || subscription.plan.qcLevel === 'none') {
      return NextResponse.json(
        {
          error: "QC feature not available",
          message: "Upgrade to enable automated QC",
          upgradeRequired: true,
        },
        { status: 403 }
      );
    }

    // Check usage limits
    const canProcess = await canProcessNewSeries(orgId);
    if (!canProcess.allowed && !canProcess.requiresOverage) {
      return NextResponse.json(
        { error: "QC limit reached. Please upgrade or wait for next billing cycle." },
        { status: 403 }
      );
    }

    // Get enabled features
    const featuresEnabled = await getEnabledQCFeatures(orgId);

    // Parse request body
    const contentType = request.headers.get("content-type");
    let body: any;

    if (contentType?.includes("multipart/form-data")) {
      // Handle file uploads (mixed: files + driveLinks)
      const formData = await request.formData();
      const files = formData.getAll("files") as File[];
      const projectId = formData.get("projectId") as string | null;
      const driveLinks = formData.getAll("driveLinks") as string[];

      body = { files, projectId, driveLinks };
    } else {
      // JSON body (Drive links only - no uploads!)
      body = await request.json();
      // Ensure driveLinks is an array
      if (body.driveLinks && !Array.isArray(body.driveLinks)) {
        body.driveLinks = [body.driveLinks];
      }
    }

    // Get or validate project - use admin client for reliable access
    let projectId = body.projectId;
    if (!projectId) {
      const { data: projects } = await adminClient
        .from("projects")
        .select("id")
        .eq("organization_id", orgId)
        .limit(1);

      projectId = projects?.[0]?.id;
      if (!projectId) {
        // Auto-create a default project
        const { data: newProject, error: createError } = await adminClient
          .from("projects")
          .insert({
            organization_id: orgId,
            name: "Default Project",
            code: "DEFAULT",
            status: "active",
          })
          .select()
          .single();

        if (createError || !newProject) {
          console.error("Failed to create default project:", createError);
          return NextResponse.json(
            { error: "Failed to setup project. Please try again." },
            { status: 500 }
          );
        }
        projectId = newProject.id;
      }
    } else {
      // Verify project belongs to org using admin client
      const { data: project } = await adminClient
        .from("projects")
        .select("id")
        .eq("id", projectId)
        .eq("organization_id", orgId)
        .single();

      if (!project) {
        return NextResponse.json(
          { error: "Invalid project" },
          { status: 400 }
        );
      }
    }

    const jobs: Array<{ id: string; fileName: string; status: string }> = [];
    const errors: Array<{ fileName: string; error: string }> = [];

    // Process file uploads
    if (body.files && Array.isArray(body.files) && body.files.length > 0) {
      console.log(`[QCStart] Processing ${body.files.length} file(s)`);
      
      for (const file of body.files) {
        let fileName = "Unknown file";
        try {
          // Get file name safely
          fileName = file.name || `file-${Date.now()}`;
          console.log(`[QCStart] Processing file: ${fileName}, size: ${file.size} bytes`);
          
          // Validate file has content
          if (!file.size || file.size === 0) {
            console.error(`[QCStart] File ${fileName} is empty`);
            errors.push({ fileName, error: "File is empty (0 bytes)" });
            continue;
          }
          
          const buffer = Buffer.from(await file.arrayBuffer());
          
          // Validate buffer
          if (!buffer || buffer.length === 0) {
            console.error(`[QCStart] Failed to read file data for ${fileName}`);
            errors.push({ fileName, error: "Failed to read file data" });
            continue;
          }
          
          console.log(`[QCStart] File ${fileName} read successfully, buffer size: ${buffer.length} bytes`);

          // Upload to Supabase Storage
          const storagePath = `${orgId}/${projectId}/${Date.now()}-${fileName}`;
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from("deliveries")
            .upload(storagePath, buffer, {
              contentType: file.type,
              upsert: false,
            });

          if (uploadError) {
            console.error(`[QCStart] Storage upload failed for ${fileName}:`, uploadError);
            
            // Provide helpful error message for bucket not found
            let errorMessage = uploadError.message;
            if (uploadError.message?.includes("Bucket not found") || (uploadError as any).statusCode === '404') {
              errorMessage = "Storage bucket 'deliveries' not found. Please create it in Supabase Dashboard → Storage → Buckets, or run the SQL script: supabase/create-storage-bucket.sql";
            }
            
            errors.push({ fileName, error: `Upload failed: ${errorMessage}` });
            continue;
          }
          
          console.log(`[QCStart] File ${fileName} uploaded to storage: ${storagePath}`);

          // Create delivery record
          // Try with mime_type first, then retry without it if column doesn't exist
          let delivery: any = null;
          
          const deliveryDataWithMime: any = {
            organization_id: orgId,
            project_id: projectId,
            vendor_id: user.id,
            file_name: fileName,
            original_file_name: fileName,
            status: "processing",
            storage_path: storagePath,
            file_size: file.size,
            file_type: file.type.startsWith("video/") ? "video" : 
                      file.type.startsWith("audio/") ? "audio" : 
                      file.type.includes("subtitle") || fileName.endsWith(".srt") || fileName.endsWith(".vtt") ? "subtitle" : "other",
            mime_type: file.type,
          };
          
          const { data: deliveryWithMime, error: errorWithMime } = await supabase
            .from("deliveries")
            .insert(deliveryDataWithMime)
            .select()
            .single();
          
          // If error is about mime_type column, retry without it
          if (errorWithMime && errorWithMime.message?.includes("mime_type")) {
            console.warn(`[QCStart] mime_type column not found, retrying without it`);
            const deliveryDataWithoutMime = { ...deliveryDataWithMime };
            delete deliveryDataWithoutMime.mime_type;
            
            const { data: deliveryRetry, error: deliveryErrorRetry } = await supabase
              .from("deliveries")
              .insert(deliveryDataWithoutMime)
              .select()
              .single();
            
            if (deliveryErrorRetry || !deliveryRetry) {
              console.error(`[QCStart] Delivery creation failed for ${fileName}:`, deliveryErrorRetry);
              errors.push({ fileName, error: `Delivery creation failed: ${deliveryErrorRetry?.message || "Unknown error"}` });
              continue;
            }
            
            delivery = deliveryRetry;
          } else if (errorWithMime || !deliveryWithMime) {
            console.error(`[QCStart] Delivery creation failed for ${fileName}:`, errorWithMime);
            errors.push({ fileName, error: `Delivery creation failed: ${errorWithMime?.message || "Unknown error"}` });
            continue;
          } else {
            delivery = deliveryWithMime;
          }
          
          console.log(`[QCStart] Delivery created for ${fileName}: ${delivery.id}`);

          // Create QC job
          const qcType = featuresEnabled.premiumReport ? "full" : "basic";
          
          // Try with file_name first, then retry without it if column doesn't exist
          let qcJob: any = null;
          
          const jobDataWithFileName: any = {
            organisation_id: orgId,
            project_id: projectId,
            episode_id: delivery.id,
            delivery_id: delivery.id,
            source_type: "upload",
            source_path: storagePath,
            file_name: fileName,
            status: "queued",
            qc_type: qcType,
          };
          
          const { data: jobWithFileName, error: errorWithFileName } = await adminClient
            .from("qc_jobs")
            .insert(jobDataWithFileName)
            .select()
            .single();
          
          // If error is about file_name column, retry without it
          if (errorWithFileName && errorWithFileName.message?.includes("file_name")) {
            console.warn(`[QCStart] file_name column not found in qc_jobs, retrying without it`);
            const jobDataWithoutFileName = { ...jobDataWithFileName };
            delete jobDataWithoutFileName.file_name;
            
            const { data: jobRetry, error: jobErrorRetry } = await adminClient
              .from("qc_jobs")
              .insert(jobDataWithoutFileName)
              .select()
              .single();
            
            if (jobErrorRetry || !jobRetry) {
              console.error(`[QCStart] QC job creation failed for ${fileName}:`, jobErrorRetry);
              errors.push({ fileName, error: `Job creation failed: ${jobErrorRetry?.message || "Unknown error"}` });
              continue;
            }
            
            qcJob = jobRetry;
          } else if (errorWithFileName || !jobWithFileName) {
            console.error(`[QCStart] QC job creation failed for ${fileName}:`, errorWithFileName);
            errors.push({ fileName, error: `Job creation failed: ${errorWithFileName?.message || "Unknown error"}` });
            continue;
          } else {
            qcJob = jobWithFileName;
          }

          console.log(`[QCStart] QC job created for ${fileName}: ${qcJob.id}`);
          
          jobs.push({
            id: qcJob.id,
            fileName,
            status: "queued",
          });
        } catch (error: any) {
          console.error(`[QCStart] Unexpected error processing ${fileName}:`, error);
          errors.push({ fileName: fileName || "Unknown", error: error.message || "Unknown error" });
        }
      }
    }

    // Process Google Drive links
    if (body.driveLinks && Array.isArray(body.driveLinks) && body.driveLinks.length > 0) {
      for (const link of body.driveLinks) {
        try {
          const driveId = extractDriveId(link);
          if (!driveId) {
            errors.push({ fileName: link, error: "Invalid Google Drive link format" });
            continue;
          }

          // Get file metadata from Drive
          const cookieStore = await import("next/headers").then(m => m.cookies());
          let accessToken = cookieStore.get("google_access_token")?.value;
          let tokenExpiresAt: string | null = null;

          if (!accessToken) {
            // Try database
            const { data: dbTokens } = await adminClient
              .from("google_tokens")
              .select("access_token, expires_at")
              .eq("user_id", user.id)
              .maybeSingle();

            if (dbTokens && dbTokens.expires_at && new Date(dbTokens.expires_at) > new Date()) {
              accessToken = dbTokens.access_token;
              tokenExpiresAt = dbTokens.expires_at;
            }
          } else {
            // Get expiration from database if we have token from cookie
            const { data: dbTokens } = await adminClient
              .from("google_tokens")
              .select("expires_at")
              .eq("user_id", user.id)
              .maybeSingle();
            
            if (dbTokens?.expires_at) {
              tokenExpiresAt = dbTokens.expires_at;
            }
          }

          if (!accessToken) {
            errors.push({ fileName: link, error: "Google Drive not connected" });
            continue;
          }

          // Get file metadata
          const metaResponse = await fetch(
            `https://www.googleapis.com/drive/v3/files/${driveId.id}?fields=name,mimeType,size`,
            {
              headers: { Authorization: `Bearer ${accessToken}` },
            }
          );

          if (!metaResponse.ok) {
            errors.push({ fileName: link, error: "Failed to access Google Drive file" });
            continue;
          }

          const metadata = await metaResponse.json();
          const fileName = metadata.name || `drive-file-${driveId.id}`;

          // Create delivery record (optional - for tracking)
          const { data: delivery } = await supabase
            .from("deliveries")
            .insert({
              organization_id: orgId,
              project_id: projectId,
              vendor_id: user.id,
              file_name: fileName,
              original_file_name: fileName,
              status: "processing",
              storage_path: `drive:${driveId.id}`, // Special marker for Drive files
              file_size: parseInt(metadata.size || "0"),
              file_type: metadata.mimeType?.startsWith("video/") ? "video" : "subtitle",
              mime_type: metadata.mimeType,
            })
            .select()
            .single();

          // Create QC job
          // Store access token in result_json metadata temporarily for worker to use
          const qcType = featuresEnabled.premiumReport ? "full" : "basic";
          const jobMetadata = accessToken ? {
            google_access_token: accessToken, // Store token for worker to use
            token_expires_at: tokenExpiresAt || new Date(Date.now() + 3600000).toISOString(),
          } : {};
          
          const { data: qcJob, error: jobError } = await adminClient
            .from("qc_jobs")
            .insert({
              organisation_id: orgId,
              project_id: projectId,
              episode_id: delivery?.id,
              delivery_id: delivery?.id,
              source_type: "drive_link",
              source_path: driveId.id, // Store Drive file ID
              file_name: fileName,
              status: "queued",
              qc_type: qcType,
              result_json: Object.keys(jobMetadata).length > 0 ? jobMetadata as any : null, // Temporarily store token here
            })
            .select()
            .single();

          if (jobError || !qcJob) {
            errors.push({ fileName, error: `Job creation failed: ${jobError?.message || "Unknown error"}` });
            continue;
          }

          jobs.push({
            id: qcJob.id,
            fileName,
            status: "queued",
          });
        } catch (error: any) {
          errors.push({ fileName: link, error: error.message || "Unknown error" });
        }
      }
    }

    // Always return success: true/false and jobs array, even if all failed
    // This allows frontend to handle partial failures gracefully
    if (jobs.length === 0 && errors.length > 0) {
      return NextResponse.json(
        {
          success: false,
          jobs: [],
          errors: errors,
          message: `All ${errors.length} file(s) failed to process`,
        },
        { status: 200 } // Return 200 so frontend can process the errors
      );
    }

    // Trigger worker processing DIRECTLY (no HTTP call - avoids port issues)
    // This is more reliable than HTTP calls which can fail due to port mismatch
    try {
      const { processBatch } = await import("@/lib/services/qc/worker");
      const { getProcessingLimits } = await import("@/lib/config/platform");
      const limits = getProcessingLimits();
      
      console.log(`[QCStart] Triggering worker directly (no HTTP)`);
      
      // Non-blocking - process in background
      processBatch(limits.maxConcurrentJobs).then(result => {
        console.log(`[QCStart] Worker processed ${result.processed} job(s), ${result.errors} error(s)`);
      }).catch(err => {
        console.log("[QCStart] Worker error:", err.message);
      });
    } catch (err: any) {
      console.log("[QCStart] Worker trigger error:", err.message);
    }

    // Always return jobs array (even if empty) and errors array (even if empty)
    // This ensures consistent response format
    console.log(`[QCStart] Completed: ${jobs.length} job(s) created, ${errors.length} error(s)`);
    
    return NextResponse.json({
      success: jobs.length > 0,
      jobs: jobs,
      errors: errors.length > 0 ? errors : [],
      message: jobs.length > 0 
        ? `${jobs.length} job(s) queued for QC processing${errors.length > 0 ? `, ${errors.length} failed` : ""}`
        : `All files failed to process`,
    });
  } catch (error: any) {
    console.error("[QCStart] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to start QC" },
      { status: 500 }
    );
  }
}
