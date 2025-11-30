import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { writeFile, mkdir, unlink } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import { runVideoQC, checkSubtitleErrors } from "@/lib/qc/ffmpeg-checks";

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
    
    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's organization
    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 });
    }

    const formData = await request.formData();
    const files = formData.getAll("files") as File[];

    if (files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    // Get default project (or create one if needed)
    const { data: projects } = await supabase
      .from("projects")
      .select("id")
      .eq("organization_id", profile.organization_id)
      .limit(1);

    const projectId = projects?.[0]?.id;
    if (!projectId) {
      return NextResponse.json(
        { error: "No project found. Please create a project first." },
        { status: 400 }
      );
    }

    const jobs: QCJob[] = [];
    const tempDir = join(process.cwd(), "tmp", "qc-uploads");

    // Create temp directory if it doesn't exist
    if (!existsSync(tempDir)) {
      await mkdir(tempDir, { recursive: true });
    }

    // Save files temporarily and create jobs
    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const fileName = file.name;
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
        console.error("Upload error:", uploadError);
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
        })
        .select()
        .single();

      if (deliveryError || !delivery) {
        console.error("Delivery creation error:", deliveryError);
        continue;
      }

      jobs.push({
        fileId: delivery.id,
        fileName: fileName,
        filePath: storagePath,
        projectId: projectId,
        organizationId: profile.organization_id,
        userId: user.id,
      });
    }

    // Queue QC jobs (in production, use BullMQ or similar)
    // For now, we'll process them asynchronously
    processQCJobs(jobs).catch(console.error);

    return NextResponse.json({
      success: true,
      jobsQueued: jobs.length,
      jobs: jobs.map((j) => ({ fileId: j.fileId, fileName: j.fileName })),
    });
  } catch (error: any) {
    console.error("Bulk QC processing error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

async function processQCJobs(jobs: QCJob[]) {
  // This would typically use a queue system like BullMQ
  // For now, we'll process sequentially
  for (const job of jobs) {
    try {
      await processQCJob(job);
    } catch (error) {
      console.error(`Error processing job ${job.fileId}:`, error);
    }
  }
}

async function processQCJob(job: QCJob) {
  const supabase = await createClient();
  
  try {
    // Download file from Supabase Storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("deliveries")
      .download(job.filePath);

    if (downloadError || !fileData) {
      throw new Error(`Failed to download file: ${downloadError?.message}`);
    }

    // Save to temporary location for FFmpeg processing
    const tmpDir = join(process.cwd(), "tmp", "qc-processing");
    if (!existsSync(tmpDir)) {
      await mkdir(tmpDir, { recursive: true });
    }

    const tmpFilePath = join(tmpDir, `${job.fileId}-${job.fileName}`);
    const buffer = Buffer.from(await fileData.arrayBuffer());
    await writeFile(tmpFilePath, buffer);

    // Determine file type and run appropriate QC checks
    const isSubtitle = job.fileName.endsWith(".srt") || job.fileName.endsWith(".vtt");
    
    let qcReport: any;
    let qcErrors: any[] = [];

    if (isSubtitle) {
      // Run SRT QC checks
      const srtResult = await checkSubtitleErrors(tmpFilePath);
      
      qcReport = {
        status: srtResult.status,
        analyzedAt: new Date().toISOString(),
        errors: srtResult.errors,
        warnings: srtResult.warnings,
        metadata: srtResult.metadata,
      };
      qcErrors = srtResult.errors;
    } else {
      // Run video QC checks
      const videoResult = await runVideoQC(tmpFilePath);
      
      qcReport = {
        status: videoResult.status,
        analyzedAt: new Date().toISOString(),
        format: {
          container: videoResult.metadata.videoCodec ? "video" : "unknown",
          videoCodec: videoResult.metadata.videoCodec,
          audioCodec: videoResult.metadata.audioCodec,
          resolution: videoResult.metadata.resolution,
          frameRate: videoResult.metadata.frameRate,
        },
        duration: {
          actual: videoResult.metadata.duration,
        },
        errors: videoResult.errors,
        warnings: videoResult.warnings,
      };
      qcErrors = videoResult.errors;
    }

    // Clean up temporary file
    try {
      await unlink(tmpFilePath);
    } catch (cleanupError) {
      console.warn("Failed to cleanup temp file:", cleanupError);
    }

    // Update delivery record with QC results
    await supabase
      .from("deliveries")
      .update({
        status: qcReport.status === "passed" ? "qc_passed" : "qc_failed",
        qc_report: qcReport,
        qc_errors: qcErrors,
      })
      .eq("id", job.fileId);

  } catch (error: any) {
    console.error(`Error processing QC job ${job.fileId}:`, error);
    
    // Update delivery with error status
    await supabase
      .from("deliveries")
      .update({
        status: "qc_failed",
        qc_report: {
          status: "failed",
          analyzedAt: new Date().toISOString(),
          errors: [
            {
              type: "Processing Error",
              message: error.message || "Failed to process QC checks",
              timestamp: 0,
              severity: "error",
            },
          ],
        },
        qc_errors: [
          {
            type: "Processing Error",
            message: error.message || "Failed to process QC checks",
            timestamp: 0,
            severity: "error",
          },
        ],
      })
      .eq("id", job.fileId);
  }
}

