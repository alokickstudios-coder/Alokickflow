import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { logQCEvent } from "@/lib/utils/qc-logger";
import {
  getOrCreateVendorProjectSheet,
  clearTabDataRows,
  buildRowFromQcResult,
  getVendorForProject,
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
 */
function extractEpisodeNumber(filename: string, index: number): number {
  const patterns = [
    /[_-](\d{1,4})[_-]/,
    /EP[_-]?(\d{1,4})/i,
    /episode[_-]?(\d{1,4})/i,
    /[_-](\d{1,4})\./,
    /(\d{1,4})\.(?:mp4|mkv|mov|avi|wav|mp3)/i,
  ];

  for (const pattern of patterns) {
    const match = filename.match(pattern);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > 0 && num < 10000) return num;
    }
  }

  return index + 1;
}

/**
 * POST /api/qc/export-to-sheets
 * 
 * Export QC results to Google Sheets
 * 
 * Structure:
 * - One spreadsheet per VENDOR (e.g., "ABC Studio - QC Reports")
 * - One TAB per PROJECT within the vendor's spreadsheet
 * - Professional formatting with color-coded status
 */
export async function POST(request: NextRequest) {
  let projectId: string | undefined;
  let userId: string | undefined;
  let organisationId: string | undefined;

  console.log("[ExportToSheets] ========================================");
  console.log("[ExportToSheets] Starting QC Export to Google Sheets");
  console.log("[ExportToSheets] ========================================");

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

    console.log(`[ExportToSheets] Project ID: ${projectId}`);
    console.log(`[ExportToSheets] User ID: ${userId}`);

    // Get admin client first
    const adminClient = getAdminClient();
    if (!adminClient) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
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
      return NextResponse.json({ error: "Failed to setup organization" }, { status: 500 });
    }

    organisationId = profile.organization_id;
    console.log(`[ExportToSheets] Organization ID: ${organisationId}`);

    // Get Google access token
    const cookieStore = await cookies();
    let accessToken = cookieStore.get("google_access_token")?.value;

    if (!accessToken) {
      const { data: userTokens } = await adminClient
        .from("google_tokens")
        .select("access_token, expires_at, refresh_token")
        .eq("user_id", user.id)
        .maybeSingle();

      if (userTokens?.access_token && userTokens.expires_at && new Date(userTokens.expires_at) > new Date()) {
        accessToken = userTokens.access_token;
      } else if (userTokens?.refresh_token) {
        try {
          const { refreshAccessToken } = await import("@/lib/google-drive/client");
          const refreshed = await refreshAccessToken(userTokens.refresh_token);
          accessToken = refreshed.access_token;
          
          await adminClient
            .from("google_tokens")
            .update({
              access_token: refreshed.access_token,
              expires_at: new Date(refreshed.expires_at || Date.now() + 3600000).toISOString(),
            })
            .eq("user_id", user.id);
        } catch (refreshError) {
          console.warn("[ExportToSheets] Failed to refresh token:", refreshError);
        }
      }
    }

    if (!accessToken) {
      const { data: orgTokens } = await adminClient
        .from("google_tokens")
        .select("access_token, expires_at")
        .gt("expires_at", new Date().toISOString())
        .limit(1)
        .maybeSingle();
      
      accessToken = orgTokens?.access_token || null;
    }

    if (!accessToken) {
      return NextResponse.json(
        { error: "Not connected to Google Drive. Please connect in Settings." },
        { status: 401 }
      );
    }

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
    
    console.log(`[ExportToSheets] Project: ${projectCode} - ${projectName}`);

    // Get vendor info
    const vendor = await getVendorForProject(projectId);
    const vendorName = vendor?.name || "All Vendors";
    
    console.log(`[ExportToSheets] Vendor: ${vendorName}`);

    // Get or create vendor's spreadsheet with project tab
    console.log(`[ExportToSheets] Getting/Creating spreadsheet...`);
    const { sheetId, sheetUrl, isNew, tabName } = await getOrCreateVendorProjectSheet({
      projectId,
      projectCode,
      projectName,
      vendorName,
      vendorId: vendor?.id,
      accessToken,
    });
    
    console.log(`[ExportToSheets] Spreadsheet: ${sheetId}`);
    console.log(`[ExportToSheets] Tab: ${tabName}`);
    console.log(`[ExportToSheets] Is New: ${isNew}`);

    // Fetch QC results from database
    console.log(`[ExportToSheets] Fetching QC results...`);
    const { data: qcJobs, error: jobsError } = await adminClient
      .from("qc_jobs")
      .select(`
        *,
        project:projects(code, name),
        delivery:deliveries(id, storage_path, metadata)
      `)
      .eq("organisation_id", organisationId)
      .eq("project_id", projectId)
      .eq("status", "completed")
      .order("created_at", { ascending: true });

    if (jobsError) {
      console.error("[ExportToSheets] Error fetching QC jobs:", jobsError);
      throw jobsError;
    }

    console.log(`[ExportToSheets] Found ${qcJobs?.length || 0} completed QC jobs`);

    if (!qcJobs || qcJobs.length === 0) {
      return NextResponse.json(
        { error: "No QC results found. Please ensure QC has been completed for files in this project." },
        { status: 404 }
      );
    }

    logQCEvent.exportStarted(projectId, qcJobs.length, organisationId || "");

    // STEP 1: Clear existing data in the project tab
    console.log(`[ExportToSheets] Clearing existing data in tab "${tabName}"...`);
    try {
      await clearTabDataRows(sheetId, tabName || projectCode, accessToken);
      console.log(`[ExportToSheets] ✓ Data cleared`);
    } catch (clearError) {
      console.warn(`[ExportToSheets] Warning: Could not clear data:`, clearError);
    }

    // STEP 2: Build fresh QC data rows
    console.log(`[ExportToSheets] Building data rows...`);
    const rows: string[][] = [];

    qcJobs.forEach((job: any, index: number) => {
      const fileName = job.file_name || `file-${index + 1}`;
      const episodeNumber = extractEpisodeNumber(fileName, index);

      const row = buildRowFromQcResult(job, projectCode, projectName, episodeNumber, {
        language: project.settings?.language || "Chinese",
        vendorName,
      });

      rows.push(row);
    });

    console.log(`[ExportToSheets] Built ${rows.length} data rows`);
    
    if (rows.length > 0) {
      console.log(`[ExportToSheets] Sample row: [${rows[0].slice(0, 5).join(", ")}...]`);
    }

    // STEP 3: Write data to sheet
    console.log(`[ExportToSheets] Writing data to sheet...`);
    const startRow = 2;
    const range = `'${tabName}'!A${startRow}:P${startRow + rows.length - 1}`;
    
    console.log(`[ExportToSheets] Writing to range: ${range}`);

    const updateResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ values: rows }),
      }
    );

    if (!updateResponse.ok) {
      const error = await updateResponse.json();
      console.error("[ExportToSheets] Failed to write rows:", error);
      
      let errorMessage = error.error?.message || "Failed to write data to spreadsheet";
      if (errorMessage.includes("has not been used in project") || errorMessage.includes("disabled")) {
        errorMessage = "Google Sheets API is not enabled. Please enable it at: https://console.developers.google.com/apis/api/sheets.googleapis.com/overview";
      }
      throw new Error(errorMessage);
    }

    const updateData = await updateResponse.json();
    console.log(`[ExportToSheets] ✓ Wrote ${rows.length} rows`);
    console.log(`[ExportToSheets]   Updated cells: ${updateData.updatedCells || "unknown"}`);

    // Auto-resize columns for better readability
    try {
      const spreadsheetInfo = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      
      if (spreadsheetInfo.ok) {
        const info = await spreadsheetInfo.json();
        const targetSheet = info.sheets?.find((s: any) => 
          s.properties?.title?.toLowerCase() === (tabName || projectCode).toLowerCase()
        );
        
        if (targetSheet) {
          await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                requests: [{
                  autoResizeDimensions: {
                    dimensions: {
                      sheetId: targetSheet.properties.sheetId,
                      dimension: "COLUMNS",
                      startIndex: 0,
                      endIndex: 16,
                    },
                  },
                }],
              }),
            }
          );
        }
      }
    } catch {
      // Non-critical, ignore
    }

    logQCEvent.exportCompleted(sheetId, projectId, organisationId || "");

    // Build final URL with tab focus
    let finalUrl = sheetUrl;
    if (tabName) {
      // Get tab GID for direct linking
      try {
        const spreadsheetInfo = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        
        if (spreadsheetInfo.ok) {
          const info = await spreadsheetInfo.json();
          const targetSheet = info.sheets?.find((s: any) => 
            s.properties?.title?.toLowerCase() === tabName.toLowerCase()
          );
          
          if (targetSheet) {
            finalUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/edit#gid=${targetSheet.properties.sheetId}`;
          }
        }
      } catch {
        // Use default URL
      }
    }

    console.log(`[ExportToSheets] ========================================`);
    console.log(`[ExportToSheets] EXPORT COMPLETED SUCCESSFULLY`);
    console.log(`[ExportToSheets] ========================================`);
    console.log(`[ExportToSheets]   Vendor: ${vendorName}`);
    console.log(`[ExportToSheets]   Project: ${projectCode} (${projectName})`);
    console.log(`[ExportToSheets]   Rows: ${rows.length}`);
    console.log(`[ExportToSheets]   URL: ${finalUrl}`);
    console.log(`[ExportToSheets] ========================================`);

    return NextResponse.json({
      success: true,
      spreadsheetId: sheetId,
      sheetUrl: finalUrl,
      rowCount: rows.length,
      isNewSheet: isNew,
      vendorName,
      projectCode,
      tabName,
      message: `Successfully exported ${rows.length} QC result(s) for ${vendorName} / ${projectCode}`,
    });
  } catch (error: any) {
    console.error("[ExportToSheets] ========================================");
    console.error("[ExportToSheets] EXPORT FAILED");
    console.error("[ExportToSheets] ========================================");
    console.error("[ExportToSheets] Error:", error.message);
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
