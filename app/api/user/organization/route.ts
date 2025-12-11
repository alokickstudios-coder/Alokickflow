/**
 * GET /api/user/organization
 * 
 * Get current user's organization info using admin client
 * This bypasses RLS issues with direct client calls
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
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminClient = getAdminClient();
    if (!adminClient) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    // Get profile with organization using admin client
    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("*, organization:organizations(*)")
      .eq("id", user.id)
      .single();

    if (profileError) {
      console.error("Profile fetch error:", profileError);
      
      // Profile doesn't exist - try to create one
      if (profileError.code === "PGRST116") {
        // First, check if there's an organization for this user
        const { data: existingOrg } = await adminClient
          .from("organizations")
          .select("*")
          .eq("owner_id", user.id)
          .single();

        let organizationId = existingOrg?.id;

        if (!organizationId) {
          // Create a new organization
          const { data: newOrg, error: orgError } = await adminClient
            .from("organizations")
            .insert({
              name: user.email?.split("@")[0] + "'s Organization",
              owner_id: user.id,
              subscription_tier: "enterprise", // Default to enterprise for now
            })
            .select()
            .single();

          if (orgError) {
            console.error("Org create error:", orgError);
            return NextResponse.json(
              { error: "Failed to create organization" },
              { status: 500 }
            );
          }
          organizationId = newOrg.id;
        }

        // Create profile
        const { data: newProfile, error: createError } = await adminClient
          .from("profiles")
          .insert({
            id: user.id,
            organization_id: organizationId,
            full_name: user.user_metadata?.full_name || user.email?.split("@")[0],
            role: "admin",
          })
          .select("*, organization:organizations(*)")
          .single();

        if (createError) {
          console.error("Profile create error:", createError);
          return NextResponse.json(
            { error: "Failed to create profile" },
            { status: 500 }
          );
        }

        return NextResponse.json({
          profile: {
            id: newProfile.id,
            full_name: newProfile.full_name,
            role: newProfile.role,
          },
          organization: newProfile.organization,
        });
      }

      return NextResponse.json(
        { error: "Profile not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      profile: {
        id: profile.id,
        full_name: profile.full_name,
        role: profile.role,
        organization_id: profile.organization_id,
      },
      organization: profile.organization,
    });
  } catch (error: any) {
    console.error("GET /api/user/organization error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to get user organization" },
      { status: 500 }
    );
  }
}
