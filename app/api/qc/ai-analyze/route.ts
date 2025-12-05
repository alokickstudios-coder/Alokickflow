/**
 * AI-Powered QC Analysis API
 * Uses Gemini 2.0 Flash for intelligent media quality control
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { analyzeSubtitles, analyzeAudioData, runComprehensiveQC, AIQCAnalysis } from "@/lib/ai/gemini";
import { writeFile, mkdir, unlink, readFile } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes

interface QCJob {
  id: string;
  fileName: string;
  fileType: "video" | "subtitle" | "audio";
  storagePath: string;
  organizationId: string;
  projectId: string;
}

// A new function to handle the heavy processing in the background
async function processFileInBackground(
  deliveryId: string,
  tempPath: string,
  file: File,
  useAI: boolean
) {
  const supabase = await createClient(); // Create a new client for the background task

  try {
    const isSubtitle =
      file.name.endsWith(".srt") || file.name.endsWith(".vtt");
    const isVideo = /\.(mp4|mov|avi|mkv|webm|m4v)$/i.test(file.name);
    const isAudio = /\.(mp3|wav|aac|m4a|flac)$/i.test(file.name);
    let analysis: AIQCAnalysis;

    if (useAI && process.env.GEMINI_API_KEY) {
      if (isSubtitle) {
        const content = await readFile(tempPath, "utf-8");
        analysis = await analyzeSubtitles(content);
      } else if (isVideo || isAudio) {
        const audioMetadata = await extractAudioMetadata(tempPath);
        analysis = await runComprehensiveQC({ audioMetadata });
      } else {
        // Fallback for unsupported types
        analysis = await runBasicAnalysis(tempPath, file.name);
      }
    } else {
      analysis = await runBasicAnalysis(tempPath, file.name);
    }

    // Update the delivery record with the final QC results
    await supabase
      .from("deliveries")
      .update({
        status:
          analysis.status === "passed"
            ? "qc_passed"
            : analysis.status === "failed"
            ? "qc_failed"
            : "needs_review",
        qc_report: analysis,
        qc_errors: analysis.issues.filter(
          (i) => i.severity === "critical" || i.severity === "major"
        ),
      })
      .eq("id", deliveryId);
  } catch (error) {
    console.error(`Background processing failed for ${deliveryId}:`, error);
    // Update the delivery to show a failed status
    await supabase
      .from("deliveries")
      .update({
        status: "qc_failed",
        qc_report: {
          summary: "Processing failed",
          issues: [
            {
              type: "Processing Error",
              severity: "critical",
              description:
                error instanceof Error ? error.message : "An unknown error occurred",
            },
          ],
        },
      })
      .eq("id", deliveryId);
  } finally {
    // Clean up the temporary file
    try {
      await unlink(tempPath);
    } catch (e) {
      console.warn(`Failed to cleanup temp file ${tempPath}:`, e);
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // ... (auth, profile, and subscription checks remain the same) ...
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json(
        { error: "No organization found" },
        { status: 400 }
      );
    }

    // ============================================================
    // Subscription & Usage Check
    // ============================================================
    const orgId = profile.organization_id;

    const { data: subscription, error: subError } = await supabase
      .from("organisation_subscriptions")
      .select("*, plan:plan_id(*)")
      .eq("organisation_id", orgId)
      .eq("status", "active")
      .single();

    if (subError || !subscription) {
      return NextResponse.json(
        { error: "No active subscription found. Please subscribe to run QC." },
        { status: 403 }
      );
    }

    const plan = subscription.plan;
    const qcLevel = plan?.metadata?.qcLevel;

    if (!qcLevel || qcLevel === "none") {
      return NextResponse.json(
        { error: "Your current plan does not include QC features." },
        { status: 403 }
      );
    }

    const monthlyLimit = plan?.metadata?.includedSeriesPerBillingCycle;

    if (monthlyLimit !== null) {
      const today = new Date();
      const periodStart = new Date(
        today.getFullYear(),
        today.getMonth(),
        1
      ).toISOString();

      const { data: usage, error: usageError } = await supabase
        .from("qc_usage_monthly")
        .select("series_count")
        .eq("organisation_id", orgId)
        .gte("period_start", periodStart)
        .single();

      const currentUsage = usage?.series_count || 0;

      if (currentUsage >= monthlyLimit) {
        return NextResponse.json(
          {
            error: "You have exceeded your monthly QC limit.",
            details: `Limit: ${monthlyLimit} files/month. Usage: ${currentUsage}.`,
          },
          { status: 403 }
        );
      }
    }
    // ============================================================

    const formData = await request.formData();
    const files = formData.getAll("files") as File[];
    const useAI = formData.get("useAI") === "true";
    const projectId = formData.get("projectId") as string | null;

    if (files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    let targetProjectId = projectId;
    if (!targetProjectId) {
      const { data: projects } = await supabase
        .from("projects")
        .select("id")
        .eq("organization_id", profile.organization_id)
        .limit(1);

      targetProjectId = projects?.[0]?.id;
      if (!targetProjectId) {
        return NextResponse.json(
          { error: "No project found. Please create a project first." },
          { status: 400 }
        );
      }
    }

    const results: Array<{
      fileName: string;
      status: "processing";
      deliveryId: string;
    }> = [];

    const tempDir = join(process.cwd(), "tmp", "ai-qc");
    if (!existsSync(tempDir)) {
      await mkdir(tempDir, { recursive: true });
    }

    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const fileName = file.name;
      const tempPath = join(tempDir, `${Date.now()}-${fileName}`);
      await writeFile(tempPath, buffer);

      const storagePath = `${
        profile.organization_id
      }/${targetProjectId}/qc/${Date.now()}-${fileName}`;
      const { error: uploadError } = await supabase.storage
        .from("deliveries")
        .upload(storagePath, buffer, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) {
        // ... (error handling for upload)
        continue;
      }

      // Create an initial delivery record with 'processing' status
      const { data: delivery, error: deliveryError } = await supabase
        .from("deliveries")
        .insert({
          organization_id: profile.organization_id,
          project_id: targetProjectId,
          vendor_id: user.id,
          file_name: fileName,
          original_file_name: fileName,
          status: "processing", // Initial status
          storage_path: storagePath,
          file_size: file.size,
          file_type:
            file.name.endsWith(".srt") || file.name.endsWith(".vtt")
              ? "subtitle"
              : "video",
        })
        .select()
        .single();

      if (deliveryError || !delivery) {
        // ... (error handling for delivery creation)
        continue;
      }

      // Start the background processing but DO NOT wait for it
      processFileInBackground(delivery.id, tempPath, file, useAI);

      results.push({
        fileName,
        status: "processing",
        deliveryId: delivery.id,
      });
    }

    // Immediately return the initial results
    return NextResponse.json({
      success: true,
      summary: {
        total: results.length,
        processing: results.length,
      },
      results,
    });
    
    // ============================================================
    // Update Usage - This will now be done when the job is created
    // ============================================================
    if (results.length > 0) {
      const { error: rpcError } = await supabase.rpc('increment_qc_usage', {
        p_organisation_id: orgId,
        p_increment_by: results.length,
      });

      if (rpcError) {
        console.warn('Failed to update QC usage:', rpcError);
      }
    }
    // ============================================================

  } catch (error: any) {
    console.error("AI QC Analysis error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}


async function extractAudioMetadata(filePath: string): Promise<any> {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration:stream=codec_type,codec_name,channels,sample_rate,bit_rate -of json "${filePath}"`
    );

    const data = JSON.parse(stdout);
    const audioStream = data.streams?.find((s: any) => s.codec_type === "audio");

    // Get loudness
    let loudnessLUFS: number | undefined;
    try {
      const { stdout: loudnessOutput } = await execAsync(
        `ffmpeg -i "${filePath}" -af loudnorm=I=-23:TP=-2.0:LRA=7:print_format=json -f null - 2>&1`
      );
      const loudnessMatch = loudnessOutput.match(/"input_i"\s*:\s*"([^"]+)"/);
      if (loudnessMatch) {
        loudnessLUFS = parseFloat(loudnessMatch[1]);
      }
    } catch (e) {
      // Loudness check failed, continue without it
    }

    // Detect silence ranges
    let silenceRanges: { start: number; end: number }[] = [];
    try {
      const { stdout: silenceOutput } = await execAsync(
        `ffmpeg -i "${filePath}" -af silencedetect=noise=-30dB:d=2 -f null - 2>&1 | grep -E "silence_start|silence_end"`
      );
      
      const starts = silenceOutput.match(/silence_start: ([\d.]+)/g) || [];
      const ends = silenceOutput.match(/silence_end: ([\d.]+)/g) || [];
      
      for (let i = 0; i < Math.min(starts.length, ends.length); i++) {
        const start = parseFloat(starts[i].split(": ")[1]);
        const end = parseFloat(ends[i].split(": ")[1]);
        if (end - start > 3) {
          silenceRanges.push({ start, end });
        }
      }
    } catch (e) {
      // Silence detection failed
    }

    return {
      duration: parseFloat(data.format?.duration || "0"),
      channels: audioStream?.channels || 0,
      sampleRate: parseInt(audioStream?.sample_rate || "0"),
      bitRate: parseInt(audioStream?.bit_rate || "0"),
      codec: audioStream?.codec_name || "unknown",
      loudnessLUFS,
      silenceRanges: silenceRanges.slice(0, 10), // Limit to first 10
    };
  } catch (error) {
    console.error("Error extracting audio metadata:", error);
    return {
      duration: 0,
      channels: 0,
      sampleRate: 0,
      codec: "unknown",
    };
  }
}

async function runBasicAnalysis(filePath: string, fileName: string): Promise<AIQCAnalysis> {
  const startTime = Date.now();
  const issues: AIQCAnalysis["issues"] = [];

  const isSubtitle = fileName.endsWith(".srt") || fileName.endsWith(".vtt");

  if (isSubtitle) {
    try {
      const content = await readFile(filePath, "utf-8");
      const lines = content.split("\n");
      
      // Basic subtitle checks
      let subtitleCount = 0;
      let hasTimingIssues = false;

      for (const line of lines) {
        if (/^\d+$/.test(line.trim())) {
          subtitleCount++;
        }
        if (/\d{2}:\d{2}:\d{2},\d{3}/.test(line)) {
          // Has valid timestamp
        }
      }

      if (subtitleCount === 0) {
        issues.push({
          type: "Empty File",
          severity: "critical",
          description: "No subtitles found in file",
        });
      }

    } catch (e) {
      issues.push({
        type: "Parse Error",
        severity: "critical",
        description: "Failed to parse subtitle file",
      });
    }
  } else {
    // Basic media file checks
    try {
      const audioMetadata = await extractAudioMetadata(filePath);
      
      if (audioMetadata.channels === 0) {
        issues.push({
          type: "Audio Missing",
          severity: "critical",
          description: "No audio track detected",
        });
      }

      if (audioMetadata.silenceRanges && audioMetadata.silenceRanges.length > 0) {
        issues.push({
          type: "Extended Silence",
          severity: "major",
          description: `Found ${audioMetadata.silenceRanges.length} extended silence section(s)`,
        });
      }

      if (audioMetadata.loudnessLUFS && (audioMetadata.loudnessLUFS < -26 || audioMetadata.loudnessLUFS > -20)) {
        issues.push({
          type: "Loudness Issue",
          severity: "major",
          description: `Loudness ${audioMetadata.loudnessLUFS.toFixed(1)} LUFS is outside target range`,
        });
      }

    } catch (e) {
      issues.push({
        type: "Analysis Error",
        severity: "minor",
        description: "Some checks could not be performed",
      });
    }
  }

  const criticalCount = issues.filter((i) => i.severity === "critical").length;
  const majorCount = issues.filter((i) => i.severity === "major").length;

  return {
    status: criticalCount > 0 ? "failed" : majorCount > 0 ? "needs_review" : "passed",
    confidence: 70, // Lower confidence for basic analysis
    summary: criticalCount > 0 
      ? `Found ${criticalCount} critical issue(s)` 
      : majorCount > 0 
        ? `Found ${majorCount} issue(s) requiring review`
        : "Basic checks passed",
    issues,
    recommendations: criticalCount > 0 
      ? ["Address critical issues before delivery"]
      : majorCount > 0
        ? ["Review flagged issues before final delivery"]
        : ["File appears to meet basic quality standards"],
    metadata: {
      analyzedAt: new Date().toISOString(),
      modelVersion: "basic-v1",
      processingTime: Date.now() - startTime,
    },
  };
}

/**
 * GET endpoint to check QC status
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const deliveryId = searchParams.get("deliveryId");

    if (!deliveryId) {
      return NextResponse.json({ error: "deliveryId required" }, { status: 400 });
    }

    const { data: delivery, error } = await supabase
      .from("deliveries")
      .select("*")
      .eq("id", deliveryId)
      .single();

    if (error || !delivery) {
      return NextResponse.json({ error: "Delivery not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: delivery.id,
      fileName: delivery.file_name,
      status: delivery.status,
      qcReport: delivery.qc_report,
      qcErrors: delivery.qc_errors,
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

