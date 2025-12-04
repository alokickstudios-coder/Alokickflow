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

    // Step 1: Create vendors table
    const { error: vendorsTableError } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS vendors (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          full_name TEXT NOT NULL,
          email TEXT,
          phone TEXT,
          company_name TEXT,
          specialty TEXT,
          notes TEXT,
          status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
          trust_score INTEGER DEFAULT 85 CHECK (trust_score >= 0 AND trust_score <= 100),
          user_id UUID,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          created_by UUID
        );
      `
    });

    // If RPC doesn't exist, try direct table check
    const { data: tableCheck } = await supabase
      .from('vendors')
      .select('id')
      .limit(1);

    if (tableCheck !== null || vendorsTableError?.message?.includes('already exists')) {
      results.steps.push({ step: "vendors_table", status: "exists or created" });
    } else {
      results.steps.push({ 
        step: "vendors_table", 
        status: "needs_manual_creation",
        message: "Please run the SQL in supabase/vendors-schema.sql in your Supabase SQL Editor"
      });
    }

    // Step 2: Create vendor_team_members table (check if exists)
    const { data: teamTableCheck } = await supabase
      .from('vendor_team_members')
      .select('id')
      .limit(1);

    if (teamTableCheck !== null) {
      results.steps.push({ step: "vendor_team_members_table", status: "exists" });
    } else {
      results.steps.push({ 
        step: "vendor_team_members_table", 
        status: "needs_manual_creation"
      });
    }

    // Step 3: Upgrade user to enterprise
    const { data: user } = await supabase.auth.admin.listUsers();
    const targetUser = user?.users?.find(u => u.email === 'alokickstudios@gmail.com');

    if (targetUser) {
      // Get user's organization
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id, role')
        .eq('id', targetUser.id)
        .single();

      if (profile?.organization_id) {
        // Update organization to enterprise
        const { error: orgError } = await supabase
          .from('organizations')
          .update({ subscription_tier: 'enterprise' })
          .eq('id', profile.organization_id);

        results.steps.push({ 
          step: "organization_upgrade", 
          status: orgError ? "failed" : "success",
          tier: "enterprise"
        });

        // Update profile to owner
        const { error: profileError } = await supabase
          .from('profiles')
          .update({ role: 'owner', full_name: 'Alok' })
          .eq('id', targetUser.id);

        results.steps.push({ 
          step: "profile_upgrade", 
          status: profileError ? "failed" : "success",
          role: "owner"
        });
      }
    }

    results.success = true;
    results.message = "Migration completed. If tables weren't created automatically, run the SQL manually.";
    results.sqlPath = "/supabase/vendors-schema.sql";

    return NextResponse.json(results);
  } catch (error: any) {
    console.error("Migration error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    message: "POST to this endpoint to run the vendor migration",
    instructions: [
      "1. POST to /api/setup/migrate to attempt automatic migration",
      "2. If tables aren't created, run supabase/vendors-schema.sql manually",
      "3. This will create vendors & vendor_team_members tables",
      "4. This will upgrade alokickstudios@gmail.com to enterprise/owner"
    ]
  });
}


