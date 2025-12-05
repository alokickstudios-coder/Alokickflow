/**
 * POST /api/setup/create-google-tokens-table
 * 
 * Creates the google_tokens table if it doesn't exist
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { readFile } from "fs/promises";
import { join } from "path";

export const dynamic = "force-dynamic";

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
    const adminClient = getAdminClient();
    if (!adminClient) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    // Read the SQL file
    const sqlPath = join(process.cwd(), "supabase", "create-google-tokens-table.sql");
    const sql = await readFile(sqlPath, "utf-8");

    // Execute SQL statements one by one
    // Split by semicolons and execute each statement
    const statements = sql
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith("--") && !s.startsWith("COMMENT"));

    const errors: string[] = [];
    
    for (const statement of statements) {
      if (!statement) continue;
      
      try {
        // Use Supabase REST API to execute SQL
        // Note: This requires the SQL to be executed via PostgREST or direct DB connection
        // For now, we'll provide instructions to run manually
        
        // Try to execute via admin client (may not work for DDL)
        // DDL statements can't be executed via PostgREST RPC, so we expect this to fail
        let execError = null;
        try {
          const result = await adminClient.rpc("exec_sql", {
            sql_query: statement
          });
          execError = result.error;
        } catch (e) {
          execError = { message: "RPC not available" };
        }

        if (execError && !execError.message?.includes("already exists")) {
          errors.push(`${statement.substring(0, 50)}...: ${execError.message}`);
        }
      } catch (e: any) {
        // Expected - DDL statements can't be executed via PostgREST
        console.log(`[CreateGoogleTokensTable] Cannot execute DDL via API: ${statement.substring(0, 50)}...`);
      }
    }

    // Since we can't execute DDL via PostgREST, return instructions
    if (errors.length > 0 || statements.length > 0) {
      return NextResponse.json(
        {
          success: false,
          message: "Cannot execute DDL statements via API",
          instructions: [
            "Please run the SQL migration manually:",
            "1. Go to Supabase Dashboard → SQL Editor",
            "2. Copy and paste the contents of: supabase/create-google-tokens-table.sql",
            "3. Click 'Run'",
            "",
            "Or use Supabase CLI:",
            "npx supabase db push --file supabase/create-google-tokens-table.sql",
          ],
          sqlFile: "supabase/create-google-tokens-table.sql",
        },
        { status: 200 } // Return 200 with instructions
      );
    }

    return NextResponse.json({
      success: true,
      message: "google_tokens table created successfully",
    });
  } catch (error: any) {
    console.error("[CreateGoogleTokensTable] Error:", error);
    return NextResponse.json(
      {
        error: error.message || "Failed to create table",
        instructions:
          "Please run the SQL manually in Supabase Dashboard → SQL Editor: supabase/create-google-tokens-table.sql",
      },
      { status: 500 }
    );
  }
}

