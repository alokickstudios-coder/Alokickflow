/**
 * QC Sheet Service
 * 
 * Professional QC Results Export to Google Sheets
 * 
 * Structure:
 * - One spreadsheet per VENDOR
 * - One TAB per PROJECT within the vendor's spreadsheet
 * - Professional formatting with color-coded status
 * 
 * Template is used for FORMAT/STRUCTURE only - no data is copied from it.
 */

import { createClient } from "@supabase/supabase-js";

// Template sheet ID - used for FORMAT/STRUCTURE only, not data
const TEMPLATE_SHEET_ID = "1pEcAHxvbIAndmk5AakCOnTYEmYeHqw95ePwBfEghKx8";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getAdminClient() {
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export interface ProjectQCSheet {
  sheetId: string;
  sheetUrl: string;
  isNew: boolean;
  tabName?: string;
}

export interface VendorInfo {
  id: string;
  name: string;
  email?: string;
}

export interface QCExportOptions {
  projectId: string;
  projectCode: string;
  projectName: string;
  vendorName: string;
  vendorId?: string;
  language?: string;
  accessToken: string;
}

/**
 * Professional header row with proper column labels
 */
const HEADER_ROW = [
  "Code",           // A: Concat code (e.g., VTV0001-1)
  "Project",        // B: Project code
  "Series Title",   // C: English title
  "Language",       // D: Target language
  "Vendor",         // E: Studio/Vendor name
  "EP#",            // F: Episode number
  "Source File",    // G: Original video link
  "QC Issues",      // H: Primary QC comments
  "Additional Notes", // I: Secondary comments
  "Rectified Video", // J: Fixed video link
  "QC-2 Comments",  // K: Second QC round comments
  "Rectified SRT",  // L: Fixed SRT link
  "Final Video",    // M: Final burned video
  "Client Notes",   // N: Agency/Client comments
  "Status",         // O: Pass/Fail status
  "QC Date",        // P: Date of QC
];

/**
 * Get or create a QC sheet for a vendor with a tab for the project
 * 
 * Organization:
 * - Spreadsheet name: "{VendorName} - QC Reports"
 * - Tab name: "{ProjectCode}"
 */
export async function getOrCreateVendorProjectSheet(
  options: QCExportOptions
): Promise<ProjectQCSheet> {
  const { projectId, projectCode, projectName, vendorName, vendorId, accessToken } = options;
  
  const adminClient = getAdminClient();
  if (!adminClient) {
    throw new Error("Server configuration error");
  }

  // Check if vendor already has a QC sheet
  let vendorSheetId: string | null = null;
  
  if (vendorId) {
    const { data: vendorProfile } = await adminClient
      .from("profiles")
      .select("qc_sheet_id")
      .eq("id", vendorId)
      .maybeSingle();
    
    vendorSheetId = vendorProfile?.qc_sheet_id || null;
  }

  // Also check if project has a sheet (fallback)
  const { data: project } = await adminClient
    .from("projects")
    .select("qc_sheet_id")
    .eq("id", projectId)
    .single();

  vendorSheetId = vendorSheetId || project?.qc_sheet_id || null;

  const tabName = projectCode || "QC Results";
  const spreadsheetName = `${vendorName || "All Vendors"} - QC Reports`;

  if (vendorSheetId) {
    // Sheet exists - check if project tab exists, if not create it
    console.log(`[QCSheetService] Using existing vendor sheet: ${vendorSheetId}`);
    
    const tabExists = await checkTabExists(vendorSheetId, tabName, accessToken);
    
    if (!tabExists) {
      console.log(`[QCSheetService] Creating new tab "${tabName}" in existing sheet`);
      await createProjectTab(vendorSheetId, tabName, accessToken);
    }
    
    const sheetUrl = `https://docs.google.com/spreadsheets/d/${vendorSheetId}/edit#gid=0`;
    return { sheetId: vendorSheetId, sheetUrl, isNew: false, tabName };
  }

  // Create new spreadsheet for vendor
  console.log(`[QCSheetService] Creating new spreadsheet: "${spreadsheetName}"`);
  
  const createResponse = await fetch(
    "https://sheets.googleapis.com/v4/spreadsheets",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        properties: {
          title: spreadsheetName,
        },
        sheets: [
          {
            properties: {
              title: tabName,
              gridProperties: {
                frozenRowCount: 1, // Freeze header row
              },
            },
          },
        ],
      }),
    }
  );

  if (!createResponse.ok) {
    const error = await createResponse.json();
    console.error("[QCSheetService] Failed to create spreadsheet:", error);
    throw new Error(error.error?.message || "Failed to create spreadsheet");
  }

  const newSpreadsheet = await createResponse.json();
  const newSheetId = newSpreadsheet.spreadsheetId;
  const sheetGid = newSpreadsheet.sheets[0]?.properties?.sheetId || 0;

  console.log(`[QCSheetService] Created spreadsheet: ${newSheetId}`);

  // Apply professional formatting
  await applyProfessionalFormatting(newSheetId, sheetGid, accessToken);

  // Write header row
  await writeHeaderRow(newSheetId, tabName, accessToken);

  // Save sheet ID to vendor profile and project
  if (vendorId) {
    await adminClient
      .from("profiles")
      .update({ qc_sheet_id: newSheetId })
      .eq("id", vendorId);
  }
  
  await adminClient
    .from("projects")
    .update({ qc_sheet_id: newSheetId })
    .eq("id", projectId);

  const sheetUrl = `https://docs.google.com/spreadsheets/d/${newSheetId}/edit`;

  return { sheetId: newSheetId, sheetUrl, isNew: true, tabName };
}

/**
 * Check if a tab exists in a spreadsheet
 */
async function checkTabExists(
  spreadsheetId: string,
  tabName: string,
  accessToken: string
): Promise<boolean> {
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!response.ok) return false;

  const data = await response.json();
  const sheets = data.sheets || [];
  
  return sheets.some((sheet: any) => 
    sheet.properties?.title?.toLowerCase() === tabName.toLowerCase()
  );
}

/**
 * Create a new tab for a project in existing spreadsheet
 */
async function createProjectTab(
  spreadsheetId: string,
  tabName: string,
  accessToken: string
): Promise<number> {
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [
          {
            addSheet: {
              properties: {
                title: tabName,
                gridProperties: {
                  frozenRowCount: 1,
                },
              },
            },
          },
        ],
      }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Failed to create tab");
  }

  const result = await response.json();
  const newSheetId = result.replies?.[0]?.addSheet?.properties?.sheetId || 0;
  
  // Apply formatting to new tab
  await applyProfessionalFormatting(spreadsheetId, newSheetId, accessToken);
  
  // Write header row to new tab
  await writeHeaderRow(spreadsheetId, tabName, accessToken);
  
  return newSheetId;
}

/**
 * Write professional header row
 */
async function writeHeaderRow(
  spreadsheetId: string,
  tabName: string,
  accessToken: string
): Promise<void> {
  const range = `'${tabName}'!A1:P1`;
  
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        values: [HEADER_ROW],
      }),
    }
  );
}

/**
 * Apply professional formatting to the sheet
 */
async function applyProfessionalFormatting(
  spreadsheetId: string,
  sheetId: number,
  accessToken: string
): Promise<void> {
  const requests = [
    // Header row styling - dark background, white text, bold
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: 16,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.15, green: 0.15, blue: 0.2 },
            textFormat: {
              foregroundColor: { red: 1, green: 1, blue: 1 },
              bold: true,
              fontSize: 11,
            },
            horizontalAlignment: "CENTER",
            verticalAlignment: "MIDDLE",
            padding: { top: 8, bottom: 8, left: 4, right: 4 },
          },
        },
        fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,padding)",
      },
    },
    // Set column widths
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 1 },
        properties: { pixelSize: 100 }, // Code column
        fields: "pixelSize",
      },
    },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: "COLUMNS", startIndex: 1, endIndex: 2 },
        properties: { pixelSize: 80 }, // Project column
        fields: "pixelSize",
      },
    },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: "COLUMNS", startIndex: 2, endIndex: 3 },
        properties: { pixelSize: 150 }, // Series Title column
        fields: "pixelSize",
      },
    },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: "COLUMNS", startIndex: 4, endIndex: 5 },
        properties: { pixelSize: 120 }, // Vendor column
        fields: "pixelSize",
      },
    },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: "COLUMNS", startIndex: 6, endIndex: 7 },
        properties: { pixelSize: 300 }, // Source File column (wider for URLs)
        fields: "pixelSize",
      },
    },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: "COLUMNS", startIndex: 7, endIndex: 9 },
        properties: { pixelSize: 250 }, // QC Issues & Notes columns
        fields: "pixelSize",
      },
    },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: "COLUMNS", startIndex: 14, endIndex: 15 },
        properties: { pixelSize: 80 }, // Status column
        fields: "pixelSize",
      },
    },
    // Alternate row coloring for data rows
    {
      addConditionalFormatRule: {
        rule: {
          ranges: [{ sheetId, startRowIndex: 1, startColumnIndex: 0, endColumnIndex: 16 }],
          booleanRule: {
            condition: {
              type: "CUSTOM_FORMULA",
              values: [{ userEnteredValue: "=MOD(ROW(),2)=0" }],
            },
            format: {
              backgroundColor: { red: 0.95, green: 0.95, blue: 0.97 },
            },
          },
        },
        index: 0,
      },
    },
    // Status column conditional formatting - PASS = green
    {
      addConditionalFormatRule: {
        rule: {
          ranges: [{ sheetId, startRowIndex: 1, startColumnIndex: 14, endColumnIndex: 15 }],
          booleanRule: {
            condition: {
              type: "TEXT_CONTAINS",
              values: [{ userEnteredValue: "PASS" }],
            },
            format: {
              backgroundColor: { red: 0.8, green: 0.95, blue: 0.8 },
              textFormat: { foregroundColor: { red: 0.1, green: 0.5, blue: 0.1 }, bold: true },
            },
          },
        },
        index: 1,
      },
    },
    // Status column conditional formatting - FAIL = red
    {
      addConditionalFormatRule: {
        rule: {
          ranges: [{ sheetId, startRowIndex: 1, startColumnIndex: 14, endColumnIndex: 15 }],
          booleanRule: {
            condition: {
              type: "TEXT_CONTAINS",
              values: [{ userEnteredValue: "FAIL" }],
            },
            format: {
              backgroundColor: { red: 1, green: 0.85, blue: 0.85 },
              textFormat: { foregroundColor: { red: 0.7, green: 0.1, blue: 0.1 }, bold: true },
            },
          },
        },
        index: 2,
      },
    },
  ];

  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ requests }),
    }
  );
}

/**
 * Get vendor info from assignment or project settings
 */
export async function getVendorForProject(projectId: string): Promise<VendorInfo | null> {
  const adminClient = getAdminClient();
  if (!adminClient) return null;

  // Try to get vendor from project settings
  const { data: project } = await adminClient
    .from("projects")
    .select("settings")
    .eq("id", projectId)
    .single();

  if (project?.settings?.vendor_name) {
    return {
      id: projectId,
      name: project.settings.vendor_name,
    };
  }

  // Try to get vendor from assignments table if it exists
  try {
    const { data: assignment } = await adminClient
      .from("assignments")
      .select("vendor_id")
      .eq("project_id", projectId)
      .limit(1)
      .maybeSingle();

    if (assignment?.vendor_id) {
      const { data: vendorProfile } = await adminClient
        .from("profiles")
        .select("id, full_name, email")
        .eq("id", assignment.vendor_id)
        .single();

      if (vendorProfile) {
        return {
          id: vendorProfile.id,
          name: vendorProfile.full_name || vendorProfile.email || "Unknown Vendor",
          email: vendorProfile.email,
        };
      }
    }
  } catch {
    // Assignments table may not exist, continue
  }

  return null;
}

/**
 * Clear all data rows from a specific tab (preserves header row 1)
 */
export async function clearTabDataRows(
  spreadsheetId: string,
  tabName: string,
  accessToken: string
): Promise<void> {
  const range = `'${tabName}'!A2:P10000`;
  console.log(`[QCSheetService] Clearing data range: ${range}`);

  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:clear`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    console.error("[QCSheetService] Failed to clear data:", error);
    
    let errorMessage = error.error?.message || "Failed to clear data rows";
    if (errorMessage.includes("has not been used in project") || errorMessage.includes("disabled")) {
      errorMessage = "Google Sheets API is not enabled. Enable at: https://console.developers.google.com/apis/api/sheets.googleapis.com/overview";
    }
    throw new Error(errorMessage);
  }

  console.log(`[QCSheetService] ✓ Data cleared successfully`);
}

/**
 * Build a row array from QC result data with CORRECT column mapping
 */
export function buildRowFromQcResult(
  qcJob: any,
  projectCode: string,
  projectName: string,
  episodeNumber: number,
  options: {
    language?: string;
    vendorName?: string;
  } = {}
): string[] {
  const { language = "Chinese", vendorName = "—" } = options;
  
  const concat = `${projectCode}-${episodeNumber}`;
  const qcReport = qcJob.result_json || qcJob.result || {};
  
  // Extract errors and format comments
  const allErrors = extractAllErrors(qcReport);
  const { comment1, comment2 } = formatComments(allErrors);
  
  // Determine pass/fail status
  const hasErrors = allErrors.length > 0;
  const criticalErrors = allErrors.filter(e => e.severity === "error").length;
  const status = criticalErrors > 0 ? "FAIL" : (hasErrors ? "WARNING" : "PASS");
  
  // Get storage/source URL
  const storagePath = qcJob.delivery?.storage_path || qcJob.source_path || qcJob.drive_link || "";
  let sourceUrl = "";
  
  if (qcJob.drive_link) {
    sourceUrl = qcJob.drive_link;
  } else if (qcJob.drive_file_id) {
    sourceUrl = `https://drive.google.com/file/d/${qcJob.drive_file_id}/view`;
  } else if (storagePath.startsWith("http")) {
    sourceUrl = storagePath;
  } else if (storagePath) {
    sourceUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/deliveries/${storagePath}`;
  } else {
    sourceUrl = qcJob.file_name || "";
  }
  
  // Get metadata for rectified links
  const metadata = {
    ...(qcJob.delivery?.metadata || {}),
    ...(qcReport.metadata || {}),
  };
  
  // Format date
  const qcDate = qcJob.updated_at || qcJob.created_at;
  const formattedDate = qcDate 
    ? new Date(qcDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "";
  
  // CORRECT column mapping matching HEADER_ROW
  return [
    concat,                               // A: Code
    projectCode,                          // B: Project
    projectName,                          // C: Series Title
    language,                             // D: Language
    vendorName,                           // E: Vendor
    episodeNumber.toString(),             // F: EP#
    sourceUrl,                            // G: Source File
    comment1,                             // H: QC Issues
    comment2,                             // I: Additional Notes
    metadata.rectified_video_link || "",  // J: Rectified Video
    "",                                   // K: QC-2 Comments
    metadata.rectified_srt_link || "",    // L: Rectified SRT
    metadata.rectified_burned_video_link || "", // M: Final Video
    metadata.agency_comments || "",       // N: Client Notes
    status,                               // O: Status
    formattedDate,                        // P: QC Date
  ];
}

/**
 * Extract all QC errors from a QC report
 */
function extractAllErrors(qcReport: any): any[] {
  const allErrors: any[] = [];
  
  // Top-level errors
  if (Array.isArray(qcReport.errors)) {
    allErrors.push(...qcReport.errors);
  }
  
  // Summary errors
  if (qcReport.summary?.issues) {
    allErrors.push(...qcReport.summary.issues.map((i: any) => ({
      type: i.type || "Issue",
      message: i.message || i.description || String(i),
      severity: i.severity || "warning",
    })));
  }
  
  // BasicQC errors
  if (qcReport.basicQC) {
    const basicQC = qcReport.basicQC;
    
    if (basicQC.audioMissing?.detected) {
      allErrors.push({
        type: "Audio Missing",
        message: basicQC.audioMissing.error || "Audio track is missing",
        severity: "error",
      });
    }
    
    if (basicQC.loudness) {
      const loudness = basicQC.loudness;
      if (loudness.status === "failed" || loudness.lufs) {
        const lufsValue = loudness.lufs || loudness.integrated_loudness;
        if (lufsValue && (lufsValue < -24 || lufsValue > -14)) {
          allErrors.push({
            type: "Loudness",
            message: `Loudness ${lufsValue?.toFixed(1)} LUFS is outside target range (-24 to -14 LUFS)`,
            severity: "error",
          });
        }
      }
    }
    
    if (basicQC.resolution) {
      const res = basicQC.resolution;
      if (res.width && res.height) {
        const minDimension = Math.min(res.width, res.height);
        if (minDimension < 720) {
          allErrors.push({
            type: "Resolution",
            message: `Resolution ${res.width}x${res.height} is below HD (1280x720)`,
            severity: "error",
          });
        }
      }
    }
    
    if (basicQC.missingDialogue?.detected && basicQC.missingDialogue.segments) {
      basicQC.missingDialogue.segments.forEach((seg: any) => {
        allErrors.push({
          type: "Missing Dialogue",
          message: seg.message || "Missing dialogue",
          timestamp: seg.start || 0,
          severity: "warning",
        });
      });
    }
    
    if (basicQC.subtitleTiming?.errors) {
      allErrors.push(...basicQC.subtitleTiming.errors);
    }
    
    if (basicQC.visualQuality?.issues) {
      basicQC.visualQuality.issues.forEach((issue: any) => {
        allErrors.push({
          type: "Visual Quality",
          message: issue.message || "Visual quality issue",
          severity: "error",
        });
      });
    }
  }
  
  // Video glitches
  if (qcReport.videoGlitch?.glitches) {
    allErrors.push(...qcReport.videoGlitch.glitches.map((g: any) => ({
      type: g.type || "Video Glitch",
      message: g.message || "Video glitch detected",
      timestamp: g.timestamp || 0,
      severity: g.severity || "error",
    })));
  }
  
  // BGM issues
  if (qcReport.bgm?.issues) {
    allErrors.push(...qcReport.bgm.issues.map((i: any) => ({
      type: i.type || "BGM",
      message: i.message || "BGM issue",
      timestamp: i.timestamp || 0,
      severity: i.severity || "warning",
    })));
  }
  
  return allErrors;
}

/**
 * Format errors into comment strings
 */
function formatComments(errors: any[]): { comment1: string; comment2: string } {
  if (!Array.isArray(errors) || errors.length === 0) {
    return { comment1: "No issues detected ✓", comment2: "" };
  }

  const formatted = errors.map((err: any) => {
    if (typeof err === "string") return err;
    const time = err.timestamp && err.timestamp > 0 
      ? `[${Math.floor(err.timestamp)}s] ` 
      : "";
    return `${time}${err.message || err.type || String(err)}`;
  });

  // Split into two columns for readability
  const mid = Math.ceil(formatted.length / 2);
  return {
    comment1: formatted.slice(0, mid).join("\n"),
    comment2: formatted.slice(mid).join("\n"),
  };
}

// Legacy export for backward compatibility
export async function getOrCreateProjectQcSheet(
  projectId: string,
  accessToken: string
): Promise<ProjectQCSheet> {
  const adminClient = getAdminClient();
  if (!adminClient) {
    throw new Error("Server configuration error");
  }

  const { data: project } = await adminClient
    .from("projects")
    .select("id, code, name, qc_sheet_id")
    .eq("id", projectId)
    .single();

  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  const vendor = await getVendorForProject(projectId);

  return getOrCreateVendorProjectSheet({
    projectId,
    projectCode: project.code || "QC",
    projectName: project.name || "Project",
    vendorName: vendor?.name || "All Vendors",
    vendorId: vendor?.id,
    accessToken,
  });
}

export async function clearSheetDataRows(
  sheetId: string,
  accessToken: string
): Promise<void> {
  // Get the first tab name
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) {
    throw new Error("Failed to get spreadsheet info");
  }

  const data = await response.json();
  const firstTabName = data.sheets?.[0]?.properties?.title || "Sheet1";
  
  await clearTabDataRows(sheetId, firstTabName, accessToken);
}

export async function getSheetRowCount(
  sheetId: string,
  accessToken: string
): Promise<number> {
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/A:A`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) return 1;

  const data = await response.json();
  return (data.values?.length || 1);
}

export async function getSheetHeaders(
  sheetId: string,
  accessToken: string
): Promise<string[]> {
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/A1:Z1`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) return [];

  const data = await response.json();
  return data.values?.[0] || [];
}
