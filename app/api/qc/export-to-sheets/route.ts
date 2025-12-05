import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { logQCEvent } from "@/lib/utils/qc-logger";
import {
  getOrCreateProjectQcSheet,
  getSheetRowCount,
  clearSheetDataRows,
} from "@/lib/services/qcSheetService";

export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getAdminClient() {
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Extract episode number from filename
 * Examples:
 * - VTV0001_001_final.mp4 -> 1
 * - VTV0001-EP02-final.mp4 -> 2
 * - episode_3.mp4 -> 3
 */
function extractEpisodeNumber(filename: string, index: number): number {
  // Try various patterns
  const patterns = [
    /[_-](\d{1,4})[_-]/, // _001_ or -001-
    /EP[_-]?(\d{1,4})/i, // EP001 or EP-001
    /episode[_-]?(\d{1,4})/i, // episode_1
    /[_-](\d{1,4})\./, // _001.mp4
  ];

  for (const pattern of patterns) {
    const match = filename.match(pattern);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > 0) {
        return num;
      }
    }
  }

  // Fallback to index + 1
  return index + 1;
}

/**
 * Format QC comments from errors array
 */
function formatQCComments(errors: any[]): { comment1: string; comment2: string } {
  if (!Array.isArray(errors) || errors.length === 0) {
    return { comment1: "", comment2: "" };
  }

  const formatted = errors.map((err: any) => {
    if (typeof err === "string") return err;
    const time = err.timestamp && err.timestamp > 0 
      ? `${Math.floor(err.timestamp)}s: ` 
      : "";
    return `${time}${err.message || err.type || String(err)}`;
  });

  const mid = Math.ceil(formatted.length / 2);
  return {
    comment1: formatted.slice(0, mid).join(" / "),
    comment2: formatted.slice(mid).join(" / "),
  };
}

/**
 * Get storage URL for a delivery
 */
function getStorageUrl(storagePath: string): string {
  if (!storagePath) return "";
  
  // If it's already a full URL, return it
  if (storagePath.startsWith("http")) {
    return storagePath;
  }

  // Construct Supabase storage URL
  const bucket = "deliveries";
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${storagePath}`;
}

/**
 * POST /api/qc/export-to-sheets
 * 
 * Export QC results to Google Sheets using template-based per-project sheets
 */
export async function POST(request: NextRequest) {
  let projectId: string | undefined;
  let userId: string | undefined;
  let organisationId: string | undefined;

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    userId = user.id;

    const body = await request.json();
    projectId = body.projectId;

    if (!projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400 });
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

    organisationId = profile.organization_id;

    // Get admin client
    const adminClient = getAdminClient();
    if (!adminClient) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    // Get Google access token - try multiple sources
    const cookieStore = await cookies();
    let accessToken = cookieStore.get("google_access_token")?.value;

    if (!accessToken) {
      // Try to get from database for this user
      const { data: userTokens } = await adminClient
        .from("google_tokens")
        .select("access_token, expires_at, refresh_token")
        .eq("user_id", user.id)
        .maybeSingle();

      if (userTokens?.access_token) {
        const { decrypt, encrypt } = await import("@/lib/utils/crypto");
        try {
            const decryptedAccessToken = userTokens.access_token.includes(':') ? await decrypt(userTokens.access_token) : userTokens.access_token;
            if (userTokens.expires_at && new Date(userTokens.expires_at) > new Date()) {
                accessToken = decryptedAccessToken;
            } else if (userTokens.refresh_token) {
                const decryptedRefreshToken = userTokens.refresh_token.includes(':') ? await decrypt(userTokens.refresh_token) : userTokens.refresh_token;
                // Try to refresh the token
                try {
                const { refreshAccessToken } = await import("@/lib/google-drive/client");
                const refreshed = await refreshAccessToken(decryptedRefreshToken);
                accessToken = refreshed.access_token;
                
                const encryptedAccessToken = await encrypt(refreshed.access_token);
                // Update token in DB
                await adminClient
                    .from("google_tokens")
                    .update({
                    access_token: encryptedAccessToken,
                    expires_at: new Date(refreshed.expires_at || Date.now() + 3600000).toISOString(),
                    })
                    .eq("user_id", user.id);
                } catch (refreshError) {
                console.warn("[ExportToSheets] Failed to refresh token:", refreshError);
                }
            }
        } catch (e) {
            console.error("Failed to decrypt access token", e);
        }
      }
    }

    // Fallback: try any valid token from the organization
    if (!accessToken) {
      const { data: orgTokens } = await adminClient
        .from("google_tokens")
        .select("access_token, expires_at")
        .gt("expires_at", new Date().toISOString())
        .limit(1)
        .maybeSingle();
      
        if (orgTokens?.access_token) {
            const { decrypt } = await import("@/lib/utils/crypto");
            try {
                accessToken = orgTokens.access_token.includes(':') ? await decrypt(orgTokens.access_token) : orgTokens.access_token;
            } catch (e) {
                console.error("Failed to decrypt access token", e);
            }
        }
    }

    if (!accessToken) {
      return NextResponse.json(
        { error: "Not connected to Google Drive. Please connect in Settings." },
        { status: 401 }
      );
    }

    // Get or create project QC sheet
    console.log(`[ExportToSheets] Getting or creating QC sheet for project ${projectId}`);
    const { sheetId, sheetUrl, isNew } = await getOrCreateProjectQcSheet(projectId, accessToken);
    console.log(`[ExportToSheets] Using sheet ${sheetId} (new: ${isNew})`);

    // Fetch QC results from qc_jobs table (source of truth)
    // Also fetch linked delivery records for metadata (rectified links, etc.)
    const { data: qcJobs, error: jobsError } = await adminClient
      .from("qc_jobs")
      .select(
        `
        *,
        project:projects(code, name),
        delivery:deliveries(id, storage_path, metadata)
      `
      )
      .eq("organisation_id", organisationId)
      .eq("project_id", projectId)
      .eq("status", "completed")
      .order("created_at", { ascending: true });

    if (jobsError) {
      console.error("[ExportToSheets] Error fetching QC jobs:", jobsError);
      throw jobsError;
    }

    if (!qcJobs || qcJobs.length === 0) {
      return NextResponse.json(
        { 
          error: "No QC results found. Please ensure QC has been completed for files in this project.",
        },
        { status: 404 }
      );
    }

    console.log(`[ExportToSheets] Found ${qcJobs.length} QC results to export`);

    logQCEvent.exportStarted(projectId, qcJobs.length, organisationId || "");

    // Get project info
    const { data: project } = await adminClient
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .single();

    if (!project) {
      throw new Error("Project not found");
    }

    const projectCode = (project.code as string) || "";
    const projectName = (project.name as string) || "";
    // Use defaults - settings column may not exist in all schema versions
    const defaultLanguage = "Chinese";
    const defaultStudio = "AKS Dubbing";

    // STEP 1: Always clear existing data rows before writing fresh QC data
    // This ensures we never have old template data or stale export data
    console.log(`[ExportToSheets] Clearing existing data rows from sheet`);
    try {
      await clearSheetDataRows(sheetId, accessToken);
      console.log(`[ExportToSheets] Successfully cleared old data rows`);
    } catch (clearError) {
      console.error(`[ExportToSheets] Warning: Failed to clear data rows:`, clearError);
      // Continue anyway - we'll overwrite starting from row 2
    }

    // Always start writing from row 2 (after header)
    const startRow = 2;
    console.log(`[ExportToSheets] Starting to write fresh QC data at row ${startRow}`);

    // Prepare data rows matching template format
    // Based on template structure:
    // A: Concat, B: Number, C: English Titles, D: Language, E: Studio, F: Episode#, 
    // G: Old Video, H: Comment-1, I: Comment-2, J: Rectified Video, 
    // K: QC-2 Comments, L: Rectified SRT file link, M: Rectified Burned Video link, 
    // N: Agency Comments, O: Map, P: Column 1, Q: Number, R: English Titles,
    // S: COUNTA of QC-2 Comments, T: COUNTA of Rectified Burned Video link
    const rows: any[][] = [];

    qcJobs.forEach((job: any, index: number) => {
      const fileName = job.file_name || `file-${index + 1}`;
      const episodeNumber = extractEpisodeNumber(fileName, index);

      // Build concat (e.g., VTV0001-1)
      const concat = `${projectCode}-${episodeNumber}`;

      // Extract QC data from result_json
      const qcReport = job.result_json || {};
      const qcErrors = qcReport.errors || [];
      
      // Collect all errors from various sources
      const allErrors: any[] = [...qcErrors];
      
      // Add errors from qc_report structure
      if (qcReport.basicQC) {
        if (qcReport.basicQC.audioMissing?.detected) {
          allErrors.push({
            type: "Audio Missing",
            message: qcReport.basicQC.audioMissing.error || "Audio track is missing",
            timestamp: 0,
            severity: "error",
          });
        }
        if (qcReport.basicQC.loudness?.status === "failed") {
          allErrors.push({
            type: "Loudness Compliance",
            message: qcReport.basicQC.loudness.message || "Loudness compliance failed",
            timestamp: 0,
            severity: "error",
          });
        }
        if (qcReport.basicQC.missingDialogue?.detected) {
          qcReport.basicQC.missingDialogue.segments?.forEach((seg: any) => {
            allErrors.push({
              type: "Missing Dialogue",
              message: seg.message || "Missing dialogue detected",
              timestamp: seg.start || 0,
              severity: "warning",
            });
          });
        }
        if (qcReport.basicQC.subtitleTiming?.errors) {
          allErrors.push(...qcReport.basicQC.subtitleTiming.errors);
        }
        if (qcReport.basicQC.visualQuality?.status === "failed") {
          qcReport.basicQC.visualQuality.issues?.forEach((issue: any) => {
            allErrors.push({
              type: "Visual Quality",
              message: issue.message || "Visual quality issue",
              timestamp: 0,
              severity: "error",
            });
          });
        }
      }
      
      // Add video glitch errors
      if (qcReport.videoGlitch?.glitches) {
        allErrors.push(...qcReport.videoGlitch.glitches.map((g: any) => ({
          type: g.type || "Video Glitch",
          message: g.message || "Video glitch detected",
          timestamp: g.timestamp || 0,
          severity: g.severity || "error",
        })));
      }
      
      // Add BGM errors
      if (qcReport.bgm?.issues) {
        allErrors.push(...qcReport.bgm.issues.map((i: any) => ({
          type: i.type || "BGM",
          message: i.message || "BGM issue detected",
          timestamp: i.timestamp || 0,
          severity: i.severity || "warning",
        })));
      }
      
      // Format comments
      const { comment1, comment2 } = formatQCComments(allErrors);

      // Get QC-2 comments (from qc_report.errors if available, or from premium report)
      const qc2Errors = qcReport.errors || qcReport.premiumReport?.summary?.criticalIssues || [];
      const qc2Comments = formatQCComments(
        Array.isArray(qc2Errors) 
          ? qc2Errors.map((e: any) => typeof e === "string" ? { message: e } : e)
          : []
      ).comment1;

      // Get storage URL from delivery or source_path
      const delivery = job.delivery || null;
      const storagePath = delivery?.storage_path || job.source_path || "";
      const storageUrl = storagePath 
        ? (storagePath.startsWith("http") 
            ? storagePath 
            : getStorageUrl(storagePath))
        : "";

      // Extract rectified links from metadata if available
      // Check both delivery metadata and result_json metadata
      const deliveryMetadata = delivery?.metadata || {};
      const qcMetadata = qcReport.metadata || {};
      const metadata = { ...deliveryMetadata, ...qcMetadata };
      
      const rectifiedVideo = metadata.rectified_video_link || "";
      const rectifiedSRT = metadata.rectified_srt_link || "";
      const rectifiedBurned = metadata.rectified_burned_video_link || "";
      const agencyComments = metadata.agency_comments || "";

      // Build row matching template columns (format-only, no template data)
      // Column mapping based on template structure:
      // A: Concat, B: Number, C: English Titles, D: Language, E: Studio, F: Episode#,
      // G: Old Video, H: Comment-1, I: Comment-2, J: Rectified Video,
      // K: QC-2 Comments, L: Rectified SRT file link, M: Rectified Burned Video link,
      // N: Agency Comments, O: Map, P: Column 1, Q: Number, R: English Titles,
      // S: COUNTA formula (auto), T: COUNTA formula (auto)
      const row = [
        concat, // A: Concat (e.g., "VTV0001-1")
        projectCode, // B: Number (project code)
        projectName, // C: English Titles
        defaultLanguage, // D: Language
        defaultStudio, // E: Studio
        episodeNumber.toString(), // F: Episode#
        storageUrl || fileName, // G: Old Video (link or filename)
        comment1, // H: Comment-1 (primary QC issues)
        comment2, // I: Comment-2 (secondary QC notes)
        rectifiedVideo || "", // J: Rectified Video (to be filled manually or from metadata)
        qc2Comments, // K: QC-2 Comments (post-rectification)
        rectifiedSRT || "", // L: Rectified SRT file link
        rectifiedBurned || "", // M: Rectified Burned Video link (Final Submission)
        agencyComments || "", // N: Agency Comments
        projectCode, // O: Map (project code for mapping)
        "", // P: Column 1 (reserved/empty)
        projectCode, // Q: Number (duplicate project code)
        projectName, // R: English Titles (duplicate)
        // S and T are formulas - leave empty, template's formulas will auto-calculate
        "",
        "",
      ];

      rows.push(row);
    });

    console.log(`[ExportToSheets] Prepared ${rows.length} fresh QC data rows to write`);
    console.log(`[ExportToSheets] Project: ${projectCode} (${projectName})`);
    console.log(`[ExportToSheets] QC jobs processed: ${qcJobs.length}`);
    
    // Log sample row for debugging
    if (rows.length > 0) {
      console.log(`[ExportToSheets] Sample row (first):`, rows[0].slice(0, 10)); // First 10 columns
    }

    // Write rows to sheet (starting at startRow)
    const range = `A${startRow}:T${startRow + rows.length - 1}`;
    console.log(`[ExportToSheets] Writing to range: ${range}`);

    const updateResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?valueInputOption=RAW`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          values: rows,
        }),
      }
    );

    if (!updateResponse.ok) {
      const error = await updateResponse.json();
      console.error("[ExportToSheets] Failed to write rows:", error);
      throw new Error(error.error?.message || "Failed to populate spreadsheet");
    }

    const updateData = await updateResponse.json();
    console.log(`[ExportToSheets] Successfully wrote ${rows.length} rows to sheet`);
    console.log(`[ExportToSheets] Updated cells: ${updateData.updatedCells || 'unknown'}`);
    
    // Verify data was written by reading back a sample
    const verifyResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/A${startRow}:J${startRow}?valueRenderOption=UNFORMATTED_VALUE`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    
    if (verifyResponse.ok) {
      const verifyData = await verifyResponse.json();
      console.log(`[ExportToSheets] Verification - first row data:`, verifyData.values?.[0]?.slice(0, 5));
    }

    // Note: Formulas in columns S and T are already in the template, so they'll automatically
    // calculate based on the data we just wrote. No need to manually add formulas.

    logQCEvent.exportCompleted(sheetId, projectId, organisationId || "");

    console.log(`[ExportToSheets] ✅ Export completed successfully`);
    console.log(`[ExportToSheets]   - Sheet ID: ${sheetId}`);
    console.log(`[ExportToSheets]   - Rows written: ${rows.length}`);
    console.log(`[ExportToSheets]   - Project: ${projectCode} (${projectName})`);
    console.log(`[ExportToSheets]   - Sheet URL: ${sheetUrl}`);
    console.log(`[ExportToSheets]   - Template data cleared: Yes`);
    console.log(`[ExportToSheets]   - Fresh QC data only: Yes`);

    return NextResponse.json({
      success: true,
      spreadsheetId: sheetId,
      sheetUrl,
      rowCount: rows.length,
      isNewSheet: isNew,
      message: `Successfully exported ${rows.length} QC result(s) to Google Sheets. Old template data has been cleared.`,
    });
  } catch (error: any) {
    console.error("[ExportToSheets] Error:", error);
    console.error("[ExportToSheets] Stack:", error.stack);
    
    if (projectId && organisationId) {
      logQCEvent.exportFailed(projectId, error, organisationId);
    }

    return NextResponse.json(
      { 
        error: error.message || "Failed to export to Google Sheets",
        details: process.env.NODE_ENV === "development" ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
