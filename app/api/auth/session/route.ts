/**
 * GET /api/auth/session
 * 
 * Returns the current user's session, profile, and organization.
 * This is the primary way for client components to get auth data
 * when direct Supabase client calls may not work (e.g., Docker deployments).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ 
        authenticated: false,
        user: null,
        profile: null,
        organization: null,
      });
    }

    const adminClient = getAdminClient();
    if (!adminClient) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    // Get profile with organization
    let { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("*, organization:organizations(*)")
      .eq("id", user.id)
      .single();

    // Auto-create profile and organization if missing
    if (profileError || !profile) {
      // Check for existing org
      let { data: existingOrg } = await adminClient
        .from("organizations")
        .select("*")
        .eq("owner_id", user.id)
        .single();

      let organizationId = existingOrg?.id;

      if (!organizationId) {
        // Create organization
        const { data: newOrg, error: orgError } = await adminClient
          .from("organizations")
          .insert({
            name: (user.user_metadata?.full_name || user.email?.split("@")[0] || "User") + "'s Organization",
            owner_id: user.id,
            subscription_tier: "enterprise",
          })
          .select()
          .single();

        if (orgError) {
          console.error("Failed to create org:", orgError);
          return NextResponse.json({
            authenticated: true,
            user: {
              id: user.id,
              email: user.email,
            },
            profile: null,
            organization: null,
            error: "Failed to create organization",
          });
        }
        existingOrg = newOrg;
        organizationId = newOrg.id;
      }

      // Create profile
      const { data: newProfile, error: profileCreateError } = await adminClient
        .from("profiles")
        .upsert({
          id: user.id,
          organization_id: organizationId,
          full_name: user.user_metadata?.full_name || user.email?.split("@")[0],
          role: "admin",
        })
        .select("*, organization:organizations(*)")
        .single();

      if (profileCreateError) {
        console.error("Failed to create profile:", profileCreateError);
        return NextResponse.json({
          authenticated: true,
          user: {
            id: user.id,
            email: user.email,
          },
          profile: null,
          organization: existingOrg,
          error: "Failed to create profile",
        });
      }

      profile = newProfile;
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        user_metadata: user.user_metadata,
      },
      profile: {
        id: profile.id,
        full_name: profile.full_name,
        role: profile.role,
        organization_id: profile.organization_id,
      },
      organization: profile.organization,
    });
  } catch (error: any) {
    console.error("Session API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to get session" },
      { status: 500 }
    );
  }
}
