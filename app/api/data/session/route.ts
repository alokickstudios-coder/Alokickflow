/**
 * Unified Session API
 * 
 * Returns authenticated user, profile, organization, and subscription info.
 * Creates profile/organization if missing.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    const adminClient = getAdminClient();
    if (!adminClient) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    // Get profile
    let { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    // Create profile if it doesn't exist
    if (!profile) {
      // First, ensure organization exists
      const { data: newOrg } = await adminClient
        .from("organizations")
        .insert({
          name: user.email?.split("@")[0] || "My Organization",
          subscription_tier: "enterprise",
        })
        .select()
        .single();

      if (newOrg) {
        const { data: newProfile } = await adminClient
          .from("profiles")
          .insert({
            id: user.id,
            full_name: user.user_metadata?.full_name || user.email?.split("@")[0] || "User",
            role: "admin",
            organization_id: newOrg.id,
          })
          .select()
          .single();

        profile = newProfile;
      }
    }

    // Get organization
    let organization = null;
    if (profile?.organization_id) {
      const { data: org } = await adminClient
        .from("organizations")
        .select("*")
        .eq("id", profile.organization_id)
        .single();
      organization = org;
    }

    // Get subscription info
    let subscription = null;
    if (profile?.organization_id) {
      const { data: sub } = await adminClient
        .from("organisation_subscriptions")
        .select("*, plan:plans(*)")
        .eq("organisation_id", profile.organization_id)
        .eq("status", "active")
        .maybeSingle();
      subscription = sub;
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
      },
      profile,
      organization,
      subscription,
      organizationId: profile?.organization_id,
    });
  } catch (error: any) {
    console.error("Session API error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
