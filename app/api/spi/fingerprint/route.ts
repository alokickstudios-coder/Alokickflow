/**
 * POST /api/spi/fingerprint
 * 
 * Generate SPI Fingerprint for a QC job
 * Optionally save to Google Drive "SPI Database" folder
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
export const maxDuration = 60;

const GOOGLE_DRIVE_API = "https://www.googleapis.com/drive/v3";
const SPI_DATABASE_FOLDER_NAME = "SPI Database";

/**
 * Get or create "SPI Database" folder in Google Drive
 */
async function getOrCreateSPIDatabaseFolder(accessToken: string): Promise<string | null> {
  try {
    // Search for existing folder
    const searchResponse = await fetch(
      `${GOOGLE_DRIVE_API}/files?q=name='${SPI_DATABASE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id,name)`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!searchResponse.ok) {
      console.error("[SPI] Drive search failed:", await searchResponse.text());
      return null;
    }

    const searchData = await searchResponse.json();
    if (searchData.files && searchData.files.length > 0) {
      console.log(`[SPI] Found existing folder: ${searchData.files[0].id}`);
      return searchData.files[0].id;
    }

    // Create folder if not found
    const createResponse = await fetch(`${GOOGLE_DRIVE_API}/files`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: SPI_DATABASE_FOLDER_NAME,
        mimeType: "application/vnd.google-apps.folder",
        description: "SPI Fingerprint Database - Semantic Provenance Intelligence files for IP protection and media verification",
      }),
    });

    if (!createResponse.ok) {
      console.error("[SPI] Drive folder creation failed:", await createResponse.text());
      return null;
    }

    const createData = await createResponse.json();
    console.log(`[SPI] Created new folder: ${createData.id}`);
    return createData.id;
  } catch (error: any) {
    console.error("[SPI] Error with Drive folder:", error.message);
    return null;
  }
}

/**
 * Upload fingerprint file to Google Drive
 */
async function uploadFingerprintToDrive(
  accessToken: string,
  folderId: string,
  filename: string,
  content: Buffer
): Promise<{ success: boolean; fileId?: string; webViewLink?: string; error?: string }> {
  try {
    // Use resumable upload for reliability
    const initResponse = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: filename,
          parents: [folderId],
          mimeType: "application/json",
          description: "SPI Fingerprint - Media semantic provenance certificate",
        }),
      }
    );

    if (!initResponse.ok) {
      return { success: false, error: `Init failed: ${initResponse.status}` };
    }

    const uploadUrl = initResponse.headers.get("location");
    if (!uploadUrl) {
      return { success: false, error: "No upload URL received" };
    }

    // Upload content
    const uploadResponse = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": content.length.toString(),
      },
      body: new Uint8Array(content),
    });

    if (!uploadResponse.ok) {
      return { success: false, error: `Upload failed: ${uploadResponse.status}` };
    }

    const uploadData = await uploadResponse.json();
    
    // Get shareable link
    await fetch(`${GOOGLE_DRIVE_API}/files/${uploadData.id}/permissions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        role: "reader",
        type: "anyone",
      }),
    }).catch(() => {}); // Ignore permission errors

    return {
      success: true,
      fileId: uploadData.id,
      webViewLink: `https://drive.google.com/file/d/${uploadData.id}/view`,
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * POST /api/spi/fingerprint
 * 
 * Body: { jobId: string, saveToDrive?: boolean }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getAuthenticatedSession();
    if (!session.success) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { user, organizationId } = session.data!;
    const body = await request.json();
    const { jobId, saveToDrive = true } = body;

    if (!jobId) {
      return NextResponse.json({ error: "jobId is required" }, { status: 400 });
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
    console.log(`[SPI] Generating fingerprint for job ${jobId}`);
    const fingerprint = await generateSPIFingerprint(fingerprintInput);
    const fileContent = serializeFingerprintToFile(fingerprint);
    const filename = generateFingerprintFilename(fingerprint);

    console.log(`[SPI] Fingerprint generated: ${fingerprint._spi.fingerprint_id} (${fileContent.length} bytes)`);

    // Save fingerprint reference to database
    await adminClient
      .from("qc_jobs")
      .update({
        spi_fingerprint_id: fingerprint._spi.fingerprint_id,
        spi_fingerprint_hash: fingerprint._spi.fingerprint_hash,
        spi_fingerprint_generated_at: fingerprint._spi.generated_at,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    // Save to Google Drive if requested
    let driveResult: { success: boolean; fileId?: string; webViewLink?: string; error?: string } = { success: false };
    
    if (saveToDrive) {
      // Get user's Google token
      const { data: tokens } = await adminClient
        .from("google_tokens")
        .select("access_token, expires_at")
        .eq("user_id", user.id)
        .maybeSingle();

      if (tokens?.access_token && new Date(tokens.expires_at) > new Date()) {
        console.log(`[SPI] Saving to Google Drive`);
        
        const folderId = await getOrCreateSPIDatabaseFolder(tokens.access_token);
        if (folderId) {
          driveResult = await uploadFingerprintToDrive(
            tokens.access_token,
            folderId,
            filename,
            fileContent
          );
          
          if (driveResult.success) {
            // Update job with Drive file reference
            await adminClient
              .from("qc_jobs")
              .update({
                spi_fingerprint_drive_id: driveResult.fileId,
                spi_fingerprint_drive_link: driveResult.webViewLink,
              })
              .eq("id", jobId);
            
            console.log(`[SPI] Saved to Drive: ${driveResult.fileId}`);
          } else {
            console.warn(`[SPI] Drive upload failed: ${driveResult.error}`);
          }
        }
      } else {
        console.log(`[SPI] No valid Google token, skipping Drive save`);
        driveResult = { success: false, error: "Google Drive not connected" };
      }
    }

    return NextResponse.json({
      success: true,
      fingerprint: {
        id: fingerprint._spi.fingerprint_id,
        hash: fingerprint._spi.fingerprint_hash,
        generated_at: fingerprint._spi.generated_at,
        size_bytes: fileContent.length,
        filename,
      },
      drive: driveResult,
      download_url: `/api/spi/fingerprint/download?id=${jobId}`,
    });

  } catch (error: any) {
    console.error("[SPI Fingerprint] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * GET /api/spi/fingerprint?jobId=xxx
 * 
 * Get fingerprint status for a job
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getAuthenticatedSession();
    if (!session.success) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { organizationId } = session.data!;
    const jobId = request.nextUrl.searchParams.get("jobId");

    if (!jobId) {
      return NextResponse.json({ error: "jobId required" }, { status: 400 });
    }

    const adminClient = getAdminClient();
    if (!adminClient) {
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }

    const { data: job, error } = await adminClient
      .from("qc_jobs")
      .select("id, spi_fingerprint_id, spi_fingerprint_hash, spi_fingerprint_generated_at, spi_fingerprint_drive_id, spi_fingerprint_drive_link")
      .eq("id", jobId)
      .eq("organisation_id", organizationId)
      .single();

    if (error || !job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (!job.spi_fingerprint_id) {
      return NextResponse.json({
        success: true,
        hasFingerprint: false,
        message: "No fingerprint generated yet",
      });
    }

    return NextResponse.json({
      success: true,
      hasFingerprint: true,
      fingerprint: {
        id: job.spi_fingerprint_id,
        hash: job.spi_fingerprint_hash,
        generated_at: job.spi_fingerprint_generated_at,
        drive_id: job.spi_fingerprint_drive_id,
        drive_link: job.spi_fingerprint_drive_link,
      },
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
