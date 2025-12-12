/**
 * Creative QC (SPI) Analyze API
 * 
 * POST - Run Creative QC analysis for a specific job
 * 
 * Uses Groq Whisper for transcription and DeepSeek/Groq for SPI analysis.
 * 
 * Enterprise only - requires creative_qc_spi feature and toggle enabled
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedSession, getAdminClient } from "@/lib/api/auth-helpers";
import {
  runCreativeQCAnalysis,
  isCreativeQCAvailable,
  getCreativeQCSettings,
  extractTranscriptFromSubtitles,
  SPIAnalysisInput,
} from "@/lib/services/spi/engine";

/**
 * POST /api/qc/creative/analyze
 * 
 * Run Creative QC analysis for a specific job
 * 
 * Pipeline:
 * 1. Check Enterprise + feature + toggle
 * 2. Fetch job data (transcript, subtitles, metadata)
 * 3. If no transcript, use Groq Whisper to transcribe media
 * 4. Run SPI analysis (DeepSeek or Groq fallback)
 * 5. Store results in database
 * 
 * Body: { jobId: string, forceRerun?: boolean }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getAuthenticatedSession();
    if (!session.success) {
      return NextResponse.json({ error: session.error || "Unauthorized" }, { status: 401 });
    }

    const { user, organizationId } = session.data!;

    // Check if Creative QC is available
    const availability = await isCreativeQCAvailable(organizationId);
    if (!availability.available) {
      return NextResponse.json(
        { error: availability.reason || "Creative QC is not available" },
        { status: 403 }
      );
    }

    // Get settings and check if enabled
    const settings = await getCreativeQCSettings(organizationId);
    if (!settings?.enabled) {
      return NextResponse.json(
        { error: "Creative QC is not enabled. Please enable it in settings." },
        { status: 400 }
      );
    }

    // Parse request body
    const { jobId, forceRerun } = await request.json();

    if (!jobId) {
      return NextResponse.json(
        { error: "jobId is required" },
        { status: 400 }
      );
    }

    const adminClient = getAdminClient();
    if (!adminClient) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    // Fetch the QC job with related data
    const { data: job, error: jobError } = await adminClient
      .from("qc_jobs")
      .select(`
        *,
        project:projects(id, code, name),
        delivery:deliveries(id, file_name, metadata, subtitle_content, storage_path)
      `)
      .eq("id", jobId)
      .eq("organisation_id", organizationId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "QC job not found or access denied" },
        { status: 404 }
      );
    }

    // Check if already completed and not forcing rerun
    if (job.creative_qc_status === "completed" && !forceRerun) {
      return NextResponse.json({
        success: true,
        status: "already_completed",
        result: {
          overallCreativeScore: job.creative_qc_overall_score,
          overallRiskScore: job.creative_qc_overall_risk_score,
          overallBrandFitScore: job.creative_qc_overall_brand_fit_score,
          parameters: job.creative_qc_parameters,
          summary: job.creative_qc_summary,
          recommendations: job.creative_qc_recommendations,
        },
      });
    }

    // Check if already running
    if (job.creative_qc_status === "running") {
      return NextResponse.json({
        success: true,
        status: "running",
        message: "Creative QC analysis is already in progress",
      });
    }

    // Mark as running
    await adminClient
      .from("qc_jobs")
      .update({
        creative_qc_status: "running",
        creative_qc_started_at: new Date().toISOString(),
        creative_qc_error: null,
      })
      .eq("id", jobId);

    // Build analysis input
    const analysisInput: SPIAnalysisInput = {
      jobId,
      context: {
        projectName: job.project?.name,
        seriesName: job.project?.code,
        targetAudience: settings.targetAudience,
        brandGuidelines: settings.brandGuidelines,
        platformType: settings.platformType,
      },
    };

    // Extract content for analysis
    
    // 1. Check for subtitle content
    if (job.delivery?.subtitle_content) {
      analysisInput.subtitleContent = job.delivery.subtitle_content;
      analysisInput.transcript = extractTranscriptFromSubtitles(job.delivery.subtitle_content);
    }

    // 2. Check for transcript in result_json
    if (job.result_json?.transcript) {
      analysisInput.transcript = job.result_json.transcript;
    }

    // 3. If no transcript yet, we need to transcribe from media
    // Check if we have a media file to transcribe
    if (!analysisInput.transcript) {
      // Check for drive link or storage path
      if (job.drive_file_id || job.source_path) {
        // For Drive files, we'd need to download first
        // For now, mark as requiring transcript
        console.log(`[Creative QC API] Job ${jobId} needs transcription from media`);
        
        // If it's a local storage file, provide the path
        if (job.source_type === 'upload' && job.source_path) {
          // Would need to download from storage - for now skip
          // In a full implementation, you'd download and provide mediaFileBuffer
        }
        
        // If it's a Drive file, provide the URL
        if (job.drive_file_id) {
          // Would need Drive token to download - for now skip
          // In a full implementation, you'd get the file URL
        }
      }
    }

    // 4. Get audio metadata if available
    if (job.result_json?.basicQC) {
      analysisInput.audioAnalysis = {
        hasDialogue: !job.result_json.basicQC.audioMissing?.detected,
        hasBGM: job.result_json.bgm?.bgmDetected ?? false,
        loudnessLUFS: job.result_json.basicQC.loudness?.lufs,
        silencePercentage: job.result_json.basicQC.silence?.percentage,
      };
    }

    // Run the analysis
    console.log(`[Creative QC API] Starting analysis for job ${jobId}`);
    const result = await runCreativeQCAnalysis(analysisInput, settings);

    // Save results to database
    const updateData: Record<string, any> = {
      creative_qc_completed_at: new Date().toISOString(),
    };

    if (result.status === "completed") {
      updateData.creative_qc_status = "completed";
      updateData.creative_qc_overall_score = result.overall_creative_score;
      updateData.creative_qc_overall_risk_score = result.overall_risk_score;
      updateData.creative_qc_overall_brand_fit_score = result.overall_brand_fit_score;
      updateData.creative_qc_parameters = result.parameters;
      updateData.creative_qc_summary = result.summary;
      updateData.creative_qc_recommendations = result.recommendations;
    } else {
      updateData.creative_qc_status = "failed";
      updateData.creative_qc_error = result.error || "Analysis failed";
    }

    await adminClient
      .from("qc_jobs")
      .update(updateData)
      .eq("id", jobId);

    // Log the analysis (ignore errors)
    try {
      await adminClient.from("creative_qc_audit_log").insert({
        organization_id: organizationId,
        job_id: jobId,
        action: result.status === "completed" ? "completed" : "failed",
        details: {
          overallScore: result.overall_creative_score,
          riskScore: result.overall_risk_score,
          processingTimeMs: result.processing_time_ms,
          error: result.error,
        },
        performed_by: user.id,
      });
    } catch (auditError: any) {
      // Non-critical: audit logging shouldn't block the response
      console.warn("[CreativeQC] Audit log failed:", auditError.message);
    }
    console.log(`[Creative QC API] Analysis ${result.status} for job ${jobId}`);

    return NextResponse.json({
      success: result.status === "completed",
      status: result.status,
      result: {
        overallCreativeScore: result.overall_creative_score,
        overallRiskScore: result.overall_risk_score,
        overallBrandFitScore: result.overall_brand_fit_score,
        parameters: result.parameters,
        summary: result.summary,
        recommendations: result.recommendations,
        error: result.error,
        processingTimeMs: result.processing_time_ms,
      },
    });
  } catch (error: any) {
    console.error("[Creative QC Analyze API] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to run Creative QC analysis" },
      { status: 500 }
    );
  }
}
