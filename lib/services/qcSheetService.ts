/**
 * QC Sheet Service
 * 
 * Manages per-project Google Sheets for QC results.
 * Uses a template sheet and copies it for each project.
 */

import { createClient } from "@supabase/supabase-js";

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
}

/**
 * Get or create a QC sheet for a project
 * 
 * If the project already has a qc_sheet_id, returns that sheet.
 * Otherwise, copies the template sheet and saves the new ID.
 * 
 * @param projectId - Project ID
 * @param accessToken - Google access token (from cookies or database)
 */
export async function getOrCreateProjectQcSheet(
  projectId: string,
  accessToken: string
): Promise<ProjectQCSheet> {
  const adminClient = getAdminClient();
  if (!adminClient) {
    throw new Error("Server configuration error");
  }

  // Get project info
  const { data: project, error: projectError } = await adminClient
    .from("projects")
    .select("id, code, name, qc_sheet_id")
    .eq("id", projectId)
    .single();

  if (projectError || !project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  // If sheet already exists, return it
  if (project.qc_sheet_id) {
    const sheetUrl = `https://docs.google.com/spreadsheets/d/${project.qc_sheet_id}/edit`;
    return {
      sheetId: project.qc_sheet_id,
      sheetUrl,
      isNew: false,
    };
  }

  // Copy template sheet
  const projectCode = project.code || "QC";
  const projectName = project.name || "Project";
  const newSheetName = `${projectCode} - QC Sheet`;

  console.log(`[QCSheetService] Copying template sheet for project ${projectCode}`);

  const copyResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files/${TEMPLATE_SHEET_ID}/copy`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: newSheetName,
      }),
    }
  );

  if (!copyResponse.ok) {
    const error = await copyResponse.json();
    console.error("[QCSheetService] Failed to copy template:", error);
    throw new Error(error.error?.message || "Failed to copy template sheet");
  }

  const newSheet = await copyResponse.json();
  const newSheetId = newSheet.id;

  console.log(`[QCSheetService] Created new sheet: ${newSheetId}`);

  // IMPORTANT: Clear all data rows from the copied template
  // We only want the format/structure, not the old data
  try {
    await clearSheetDataRows(newSheetId, accessToken);
    console.log(`[QCSheetService] Cleared old template data from new sheet`);
  } catch (clearError) {
    console.error("[QCSheetService] Warning: Failed to clear template data:", clearError);
    // Don't throw - sheet was created, we can try to clear later during export
  }

  // Save sheet ID to project
  const { error: updateError } = await adminClient
    .from("projects")
    .update({ qc_sheet_id: newSheetId })
    .eq("id", projectId);

  if (updateError) {
    console.error("[QCSheetService] Failed to save sheet ID to project:", updateError);
    // Don't throw - sheet was created, just couldn't save the reference
  }

  const sheetUrl = `https://docs.google.com/spreadsheets/d/${newSheetId}/edit`;

  return {
    sheetId: newSheetId,
    sheetUrl,
    isNew: true,
  };
}

/**
 * Get the header row from a sheet (to understand column structure)
 */
export async function getSheetHeaders(
  sheetId: string,
  accessToken: string
): Promise<string[]> {
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/A1:Z1`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error("Failed to get sheet headers");
  }

  const data = await response.json();
  return data.values?.[0] || [];
}

/**
 * Get the number of data rows in a sheet (excluding header)
 */
export async function getSheetRowCount(
  sheetId: string,
  accessToken: string
): Promise<number> {
  // Get sheet metadata to find the last row
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    return 1; // Assume only header row exists
  }

  const data = await response.json();
  const sheet = data.sheets?.[0];
  const lastRow = sheet?.properties?.gridProperties?.rowCount || 1;

  // Check actual data by reading a range
  const valuesResponse = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/A2:A${lastRow}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (valuesResponse.ok) {
    const valuesData = await valuesResponse.json();
    const rows = valuesData.values || [];
    // Find last non-empty row
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i] && rows[i][0] && rows[i][0].trim()) {
        return i + 2; // +2 because we start from row 2 and arrays are 0-indexed
      }
    }
  }

  return 1; // Only header row
}

/**
 * Clear all data rows from a sheet (preserves header row and formulas)
 * 
 * Clears rows 2 onwards in the main data columns (A2:Q10000)
 * This removes old template data or previous export data
 * 
 * @param sheetId - Google Spreadsheet ID
 * @param accessToken - Google access token
 * @param dataRange - Range to clear (default: A2:Q10000)
 */
export async function clearSheetDataRows(
  sheetId: string,
  accessToken: string,
  dataRange: string = "A2:Q10000"
): Promise<void> {
  console.log(`[QCSheetService] Clearing data rows in range ${dataRange} for sheet ${sheetId}`);

  // Use batchUpdate to clear the range
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [
          {
            updateCells: {
              range: {
                sheetId: 0, // First sheet (we assume single sheet or first sheet)
                startRowIndex: 1, // Row 2 (0-indexed, so 1 = row 2)
                endRowIndex: 10000, // Up to row 10000
                startColumnIndex: 0, // Column A (0-indexed)
                endColumnIndex: 17, // Column Q (17 = Q, since A=0, B=1, ..., Q=16)
              },
              fields: "userEnteredValue",
            },
          },
        ],
      }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    console.error("[QCSheetService] Failed to clear data rows:", error);
    throw new Error(error.error?.message || "Failed to clear data rows");
  }

  console.log(`[QCSheetService] Successfully cleared data rows in ${dataRange}`);
}

