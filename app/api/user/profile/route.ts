import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

export async function GET(request: NextRequest) {
  try {
    // Get the user from the authorization header or cookie
    const authHeader = request.headers.get("authorization");
    
    // Get all profiles with their organizations
    const { data: profiles, error } = await supabaseAdmin
      .from("profiles")
      .select(`
        *,
        organization:organizations(id, name, subscription_tier)
      `);

    if (error) throw error;

    return NextResponse.json({ profiles });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId, organizationId } = await request.json();

    if (!userId || !organizationId) {
      return NextResponse.json(
        { error: "userId and organizationId are required" },
        { status: 400 }
      );
    }

    // Check if profile exists
    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (existingProfile) {
      // Update existing profile
      const { data, error } = await supabaseAdmin
        .from("profiles")
        .update({ organization_id: organizationId })
        .eq("id", userId)
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json({ profile: data, updated: true });
    } else {
      // Create new profile
      const { data, error } = await supabaseAdmin
        .from("profiles")
        .insert({
          id: userId,
          organization_id: organizationId,
          role: "admin",
        })
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json({ profile: data, created: true });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

