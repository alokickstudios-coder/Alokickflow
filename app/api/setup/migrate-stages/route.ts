import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getAdminClient() {
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: "Server not configured" }, { status: 500 });
    }

    const results: Record<string, any> = { steps: [] };

    // Check if project_stages table exists
    const { data: tableCheck, error: checkError } = await supabase
      .from("project_stages")
      .select("id")
      .limit(1);

    if (checkError && checkError.code === "42P01") {
      // Table doesn't exist, need to create it
      results.steps.push({
        step: "project_stages_table",
        status: "needs_manual_creation",
        message: "Please run the SQL in supabase/project-stages.sql in your Supabase SQL Editor",
        sqlFile: "supabase/project-stages.sql",
      });
    } else {
      results.steps.push({
        step: "project_stages_table",
        status: "exists",
        message: "Table already exists",
      });
    }

    results.success = true;
    results.message =
      "Migration check completed. If table doesn't exist, run supabase/project-stages.sql manually.";

    return NextResponse.json(results);
  } catch (error: any) {
    console.error("Migration error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    message: "POST to this endpoint to check project_stages table migration",
    instructions: [
      "1. POST to /api/setup/migrate-stages to check if table exists",
      "2. If table doesn't exist, run supabase/project-stages.sql manually in Supabase SQL Editor",
      "3. This will create the project_stages table for managing production stages",
    ],
  });
}



