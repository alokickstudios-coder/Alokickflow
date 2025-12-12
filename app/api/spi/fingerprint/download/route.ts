/**
 * GET /api/spi/fingerprint/download?id=xxx
 * 
 * Download SPI Fingerprint file for a job
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedSession, getAdminClient } from "@/lib/api/auth-helpers";
import {
  generateSPIFingerprint,
  serializeFingerprintToFile,
  generateFingerprintFilename,
  FingerprintInput,
} from "@/lib/services/spi/fingerprint";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthenticatedSession();
    if (!session.success) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { organizationId } = session.data!;
    const jobId = request.nextUrl.searchParams.get("id");

    if (!jobId) {
      return NextResponse.json({ error: "Job ID required" }, { status: 400 });
    }

    const adminClient = getAdminClient();
    if (!adminClient) {
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }

    // Get QC job with all data
    const { data: job, error: jobError } = await adminClient
      .from("qc_jobs")
      .select(`
        *,
        delivery:deliveries(file_name, original_file_name, file_size, file_type, mime_type)
      `)
      .eq("id", jobId)
      .eq("organisation_id", organizationId)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Extract data for fingerprint
    const result = job.result_json || {};
    const delivery = Array.isArray(job.delivery) ? job.delivery[0] : job.delivery;
    
    const fingerprintInput: FingerprintInput = {
      jobId: job.id,
      organizationId: organizationId,
      fileName: job.file_name || delivery?.original_file_name || "unknown",
      fileSize: delivery?.file_size || 0,
      mimeType: delivery?.mime_type || "video/mp4",
      sourceType: job.source_type || "upload",
      sourcePath: job.source_path,
      
      mediaMetadata: {
        duration: result.basicQC?.metadata?.duration,
        width: result.basicQC?.metadata?.width,
        height: result.basicQC?.metadata?.height,
        frameRate: result.basicQC?.metadata?.frameRate,
        videoCodec: result.basicQC?.metadata?.videoCodec,
        videoBitrate: result.basicQC?.metadata?.videoBitrate,
        audioCodec: result.basicQC?.metadata?.audioCodec,
        audioBitrate: result.basicQC?.metadata?.audioBitrate,
        audioChannels: result.basicQC?.metadata?.audioChannels,
        audioSampleRate: result.basicQC?.metadata?.audioSampleRate,
      },
      
      audioAnalysis: {
        loudnessLUFS: result.basicQC?.loudness?.lufs,
        peakDB: result.basicQC?.loudness?.peak,
        silencePercentage: result.basicQC?.silence?.percentage,
        hasBGM: result.bgm?.bgmDetected,
        hasDialogue: !result.basicQC?.audioMissing?.detected,
      },
      
      transcript: result.transcript || job.creative_qc_transcript,
      
      spiResult: job.creative_qc_status === "completed" ? {
        overallCreativeScore: job.creative_qc_overall_score || 0,
        overallRiskScore: job.creative_qc_overall_risk_score || 0,
        overallBrandFitScore: job.creative_qc_overall_brand_fit_score || 0,
        parameters: job.creative_qc_parameters || {},
        summary: job.creative_qc_summary || "",
        recommendations: job.creative_qc_recommendations || [],
        detectedEmotions: job.creative_qc_emotions || [],
        detectedThemes: job.creative_qc_themes || [],
      } : undefined,
    };

    // Generate fingerprint
    const fingerprint = await generateSPIFingerprint(fingerprintInput);
    const fileContent = serializeFingerprintToFile(fingerprint);
    const filename = generateFingerprintFilename(fingerprint);

    // Return as downloadable file
    return new NextResponse(new Uint8Array(fileContent), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": fileContent.length.toString(),
        "X-SPI-Fingerprint-ID": fingerprint._spi.fingerprint_id,
        "X-SPI-Hash": fingerprint._spi.fingerprint_hash,
      },
    });

  } catch (error: any) {
    console.error("[SPI Download] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
