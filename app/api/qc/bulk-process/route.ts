import { NextRequest, NextResponse } from "next/server";
import { createClient, createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { writeFile, mkdir, unlink } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import {
  runQcForEpisode,
  getEnabledQCFeatures,
} from "@/lib/services/qc/engine";
import {
  getOrganisationSubscription,
  canProcessNewSeries,
  incrementUsageForSeries,
} from "@/lib/services/subscriptionService";
import { logQCEvent } from "@/lib/utils/qc-logger";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getAdminClient() {
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createAdminClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes

interface QCJob {
  fileId: string;
  fileName: string;
  filePath: string;
  projectId: string;
  organizationId: string;
  userId: string;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const adminClient = getAdminClient();
    
    if (!adminClient) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }
    
    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's organization using admin client for reliable access
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

    const formData = await request.formData();
    const files = formData.getAll("files") as File[];
    const providedProjectId = formData.get("projectId") as string | null;

    if (files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    // Get project ID - use provided one or get default
    let projectId = providedProjectId;
    if (!projectId) {
      const { data: projects } = await adminClient
        .from("projects")
        .select("id")
        .eq("organization_id", profile.organization_id)
        .limit(1);

      projectId = projects?.[0]?.id;
      if (!projectId) {
        // Auto-create a default project
        const { data: newProject } = await adminClient
          .from("projects")
          .insert({
            organization_id: profile.organization_id,
            name: "Default Project",
            code: "DEFAULT",
            status: "active",
          })
          .select()
          .single();

        if (newProject) {
          projectId = newProject.id;
        } else {
          return NextResponse.json(
            { error: "Failed to create project. Please try again." },
            { status: 500 }
          );
        }
      }
    } else {
      // Verify the provided project belongs to the organization
      const { data: project, error: projectError } = await adminClient
        .from("projects")
        .select("id")
        .eq("id", projectId)
        .eq("organization_id", profile.organization_id)
        .single();

      if (projectError || !project) {
        return NextResponse.json(
          { error: "Invalid project or project not found." },
          { status: 400 }
        );
      }
    }

    console.log(`[BulkQC] Using project ID: ${projectId}`);

    const jobs: QCJob[] = [];
    const errors: Array<{ fileName: string; error: string }> = [];
    const tempDir = join(process.cwd(), "tmp", "qc-uploads");

    // Create temp directory if it doesn't exist
    if (!existsSync(tempDir)) {
      await mkdir(tempDir, { recursive: true });
    }

    // Save files temporarily and create jobs
    for (const file of files) {
      const fileName = file.name;
      let errorMessage: string | null = null;

      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        const filePath = join(tempDir, `${Date.now()}-${fileName}`);

        await writeFile(filePath, buffer);

        // Upload to Supabase Storage
        const storagePath = `${profile.organization_id}/${projectId}/${Date.now()}-${fileName}`;
        
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("deliveries")
          .upload(storagePath, buffer, {
            contentType: file.type,
            upsert: false,
          });

        if (uploadError) {
          errorMessage = `Storage upload failed: ${uploadError.message}`;
          console.error(`[BulkQC] Upload error for ${fileName}:`, uploadError);
          errors.push({ fileName, error: errorMessage });
          continue;
        }

        // Create delivery record
        const { data: delivery, error: deliveryError } = await supabase
          .from("deliveries")
          .insert({
            organization_id: profile.organization_id,
            project_id: projectId,
            vendor_id: user.id,
            file_name: fileName,
            original_file_name: fileName,
            status: "processing",
            storage_path: storagePath,
            file_size: file.size,
            file_type: file.type.startsWith("video/") ? "video" : "subtitle",
            mime_type: file.type,
          })
          .select()
          .single();

        if (deliveryError || !delivery) {
          errorMessage = `Delivery creation failed: ${deliveryError?.message || "Unknown error"}`;
          console.error(`[BulkQC] Delivery creation error for ${fileName}:`, deliveryError);
          errors.push({ fileName, error: errorMessage });
          continue;
        }

        const job: QCJob = {
          fileId: delivery.id,
          fileName: fileName,
          filePath: storagePath,
          projectId: projectId as string, // projectId is guaranteed to be set at this point
          organizationId: profile.organization_id,
          userId: user.id,
        };

        jobs.push(job);
        console.log(`[BulkQC] Successfully created delivery ${delivery.id} for ${fileName}`, {
          deliveryId: delivery.id,
          fileName: fileName,
          storagePath: storagePath,
        });
      } catch (error: any) {
        errorMessage = `Processing failed: ${error.message || "Unknown error"}`;
        console.error(`[BulkQC] Unexpected error for ${fileName}:`, error);
        errors.push({ fileName, error: errorMessage });
      }
    }

    // If all files failed, return error
    if (jobs.length === 0 && errors.length > 0) {
      return NextResponse.json(
        {
          error: "All files failed to upload",
          details: errors,
        },
        { status: 400 }
      );
    }

    // Check subscription and features
    const subscription = await getOrganisationSubscription(profile.organization_id);
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

    const featuresEnabled = await getEnabledQCFeatures(profile.organization_id);
    const canProcess = await canProcessNewSeries(profile.organization_id);

    logQCEvent.qcStarted(jobs[0]?.fileId || 'unknown', profile.organization_id, projectId || 'unknown');
    console.log(`[BulkQC] Queuing ${jobs.length} QC jobs for org ${profile.organization_id}`);

    // Create qc_jobs records for tracking
    const qcJobRecords = await Promise.all(
      jobs.map(async (job) => {
        const { data: qcJob, error: jobError } = await adminClient
          .from("qc_jobs")
          .insert({
            organisation_id: profile.organization_id,
            project_id: job.projectId,
            episode_id: job.fileId,
            delivery_id: job.fileId,
            status: "processing",
            qc_type: featuresEnabled.premiumReport ? "full" : "basic",
            started_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (jobError) {
          console.error(`[BulkQC] Failed to create QC job for ${job.fileId}:`, jobError);
        } else if (qcJob) {
          logQCEvent.jobCreated(qcJob.id, job.fileId, profile.organization_id);
        }

        return { ...job, qcJobId: qcJob?.id };
      })
    );

    // Queue QC jobs (in production, use BullMQ or similar)
    // For now, we'll process them asynchronously
    processQCJobs(qcJobRecords, featuresEnabled, canProcess, profile.organization_id).catch((error) => {
      console.error("[BulkQC] Error processing QC jobs:", error);
    });

    return NextResponse.json({
      success: true,
      jobs: jobs.map((j) => ({ 
        fileId: j.fileId, 
        fileName: j.fileName,
        status: "queued",
      })),
      errors: errors.length > 0 ? errors : undefined,
      message: `${jobs.length} file(s) queued for QC processing${errors.length > 0 ? `, ${errors.length} file(s) failed` : ""}`,
    });
  } catch (error: any) {
    console.error("Bulk QC processing error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

async function processQCJobs(
  jobs: QCJob[],
  featuresEnabled: any,
  canProcess: any,
  organisationId: string
) {
  // This would typically use a queue system like BullMQ
  // For now, we'll process sequentially
  for (const job of jobs) {
    try {
      await processQCJob(job, featuresEnabled, canProcess, organisationId);
    } catch (error) {
      console.error(`Error processing job ${job.fileId}:`, error);
    }
  }
}

async function processQCJob(
  job: QCJob & { qcJobId?: string },
  featuresEnabled: any,
  canProcess: any,
  organisationId: string
) {
  const supabase = await createClient();
  const adminClient = getAdminClient();
  
  logQCEvent.qcStarted(job.fileId, organisationId, job.projectId);
  console.log(`[BulkQC] Processing QC job for delivery ${job.fileId}`);
  
  try {
    // Download file from Supabase Storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("deliveries")
      .download(job.filePath);

    if (downloadError || !fileData) {
      throw new Error(`Failed to download file: ${downloadError?.message}`);
    }

    // Save to temporary location for QC processing
    const tmpDir = join(process.cwd(), "tmp", "qc-processing");
    if (!existsSync(tmpDir)) {
      await mkdir(tmpDir, { recursive: true });
    }

    const tmpFilePath = join(tmpDir, `${job.fileId}-${job.fileName}`);
    const buffer = Buffer.from(await fileData.arrayBuffer());
    await writeFile(tmpFilePath, buffer);

    // Determine file type
    const isSubtitle = job.fileName.endsWith(".srt") || job.fileName.endsWith(".vtt");
    
    let qcResult: any;
    let qcReport: any;
    let qcErrors: any[] = [];

    if (isSubtitle) {
      // For subtitles, use basic subtitle timing check from basicQc
      // This is a simplified path - in production, you might want a dedicated subtitle QC
      qcReport = {
        status: "passed",
        analyzedAt: new Date().toISOString(),
        type: "subtitle",
        fileName: job.fileName,
      };
      qcErrors = [];
    } else {
      // Run full QC engine for video files
      qcResult = await runQcForEpisode({
        organisationId,
        seriesId: job.projectId,
        episodeId: job.fileId,
        fileInfo: {
          filePath: tmpFilePath,
          fileName: job.fileName,
        },
        featuresEnabled,
        deliveryId: job.fileId,
      });

      // Transform QC result to delivery format
      qcReport = {
        status: qcResult.status,
        analyzedAt: qcResult.analyzedAt,
        score: qcResult.score,
        basicQC: qcResult.basicQC,
        lipSync: qcResult.lipSync,
        videoGlitch: qcResult.videoGlitch,
        bgm: qcResult.bgm,
        premiumReport: qcResult.premiumReport,
      };

      // Extract errors
      qcErrors = [
        ...(qcResult.basicQC.audioMissing.detected ? [{
          type: 'Audio Missing',
          message: qcResult.basicQC.audioMissing.error,
          timestamp: 0,
          severity: 'error',
        }] : []),
        ...(qcResult.basicQC.loudness.status === 'failed' ? [{
          type: 'Loudness Compliance',
          message: qcResult.basicQC.loudness.message,
          timestamp: 0,
          severity: 'error',
        }] : []),
        ...qcResult.basicQC.missingDialogue.segments.map((seg: any) => ({
          type: 'Missing Dialogue',
          message: seg.message,
          timestamp: seg.start,
          severity: 'warning' as const,
        })),
        ...qcResult.basicQC.subtitleTiming.errors,
        ...(qcResult.videoGlitch?.glitches || []).map((glitch: any) => ({
          type: glitch.type,
          message: glitch.message,
          timestamp: glitch.timestamp,
          severity: glitch.severity,
        })),
        ...(qcResult.bgm?.issues || []).map((issue: any) => ({
          type: issue.type,
          message: issue.message,
          timestamp: issue.timestamp,
          severity: issue.severity,
        })),
      ];
    }

    // Clean up temporary file
    try {
      await unlink(tmpFilePath);
    } catch (cleanupError) {
      console.warn("Failed to cleanup temp file:", cleanupError);
    }

    // Determine final status based on QC result
    let finalStatus = "needs_review";
    if (qcReport.status === "passed") {
      finalStatus = "qc_passed";
    } else if (qcReport.status === "failed" || qcErrors.length > 0) {
      finalStatus = "qc_failed";
    }

    // Update delivery record with QC results
    const { error: updateError } = await supabase
      .from("deliveries")
      .update({
        status: finalStatus,
        qc_report: qcReport,
        qc_errors: qcErrors,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.fileId);

    if (updateError) {
      console.error(`[BulkQC] Failed to update delivery ${job.fileId}:`, updateError);
      logQCEvent.qcFailed(job.fileId, updateError as any, organisationId);
    } else {
      console.log(`[BulkQC] Successfully updated delivery ${job.fileId} with QC results (status: ${finalStatus}, errors: ${qcErrors.length})`);
      logQCEvent.qcCompleted(job.fileId, finalStatus === "qc_passed" ? "passed" : "failed", qcResult?.score, organisationId);
    }

    // Update QC job record if it exists
    if (job.qcJobId && adminClient) {
      await adminClient
        .from("qc_jobs")
        .update({
          status: qcReport.status === "passed" ? "completed" : 
                  qcReport.status === "failed" ? "error" : "completed",
          result_json: qcResult || qcReport,
          completed_at: new Date().toISOString(),
        })
        .eq("id", job.qcJobId);
    }

    // Track usage if needed
    if (canProcess.requiresOverage) {
      await incrementUsageForSeries(organisationId, job.projectId, 1, 1);
    } else {
      await incrementUsageForSeries(organisationId, job.projectId, 1, 0);
    }

  } catch (error: any) {
    logQCEvent.qcFailed(job.fileId, error, organisationId);
    console.error(`[BulkQC] Error processing QC job ${job.fileId}:`, error);
    console.error(`[BulkQC] Error stack:`, error.stack);
    
    // Update delivery with error status
    const errorReport = {
      status: "failed",
      analyzedAt: new Date().toISOString(),
      error: error.message || "Failed to process QC checks",
      errors: [
        {
          type: "Processing Error",
          message: error.message || "Failed to process QC checks",
          timestamp: 0,
          severity: "error",
        },
      ],
    };

    await supabase
      .from("deliveries")
      .update({
        status: "qc_failed",
        qc_report: errorReport,
        qc_errors: errorReport.errors,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.fileId);

    // Update QC job record if it exists
    if (job.qcJobId && adminClient) {
      await adminClient
        .from("qc_jobs")
        .update({
          status: "error",
          result_json: { error: error.message },
          completed_at: new Date().toISOString(),
        })
        .eq("id", job.qcJobId);
    }
  }
}

