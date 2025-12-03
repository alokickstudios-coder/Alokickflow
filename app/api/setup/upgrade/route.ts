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

    const results: Record<string, any> = {};

    // Update profile full_name (keep role as admin - it's already the highest)
    const { data: profileUpdate, error: profileError } = await supabase
      .from('profiles')
      .update({ 
        full_name: 'Alok' 
      })
      .eq('id', '437b8f10-3fed-41f4-959e-54b680069e31')
      .select()
      .single();

    results.profileUpdate = profileError 
      ? { status: "failed", error: profileError.message }
      : { status: "success", profile: profileUpdate };

    // Update organization to enterprise
    const { data: orgUpdate, error: orgError } = await supabase
      .from('organizations')
      .update({ subscription_tier: 'enterprise' })
      .eq('id', 'be6201c8-e895-4e70-97d9-9befa4bcb06a')
      .select()
      .single();

    results.organizationUpdate = orgError 
      ? { status: "failed", error: orgError.message }
      : { status: "success", organization: orgUpdate };

    // Create vendor_team_members table if not exists
    // (This will fail silently if RPC doesn't exist - user needs to run SQL)
    try {
      await supabase.rpc('exec_sql', {
        sql: `
          CREATE TABLE IF NOT EXISTS vendor_team_members (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            vendor_id UUID NOT NULL,
            full_name TEXT NOT NULL,
            email TEXT,
            phone TEXT,
            role TEXT DEFAULT 'member',
            status TEXT DEFAULT 'active',
            created_at TIMESTAMPTZ DEFAULT NOW()
          );
        `
      });
      results.vendorTeamTable = { status: "attempted" };
    } catch (e) {
      results.vendorTeamTable = { status: "needs_manual_sql" };
    }

    return NextResponse.json({
      success: true,
      results,
      message: "Account upgraded to Enterprise Owner"
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET() {
  const supabase = getAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }

  // Get current status
  const { data: profile } = await supabase
    .from('profiles')
    .select('*, organization:organizations(*)')
    .eq('id', '437b8f10-3fed-41f4-959e-54b680069e31')
    .single();

  return NextResponse.json({ profile });
}

