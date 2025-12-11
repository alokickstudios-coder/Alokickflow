import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedSession, getAdminClient } from "@/lib/api/auth-helpers";

export const dynamic = "force-dynamic";

/**
 * GET /api/settings/profile
 * Get current user's profile and organization (auto-creates if needed)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getAuthenticatedSession();
    if (!session.success) {
      return NextResponse.json({ error: session.error || "Unauthorized" }, { status: 401 });
    }

    const adminClient = getAdminClient();
    if (!adminClient) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const { user, organizationId, profile } = session.data!;

    // Fetch organization details
    const { data: organization } = await adminClient
      .from("organizations")
      .select("*")
      .eq("id", organizationId)
      .single();

    return NextResponse.json({
      profile: {
        id: user.id,
        full_name: profile?.full_name,
        avatar_url: profile?.avatar_url,
        role: profile?.role,
      },
      organization,
    });
  } catch (error: any) {
    console.error("GET /api/settings/profile error:", error);
    return NextResponse.json({ error: error.message || "Failed to fetch profile" }, { status: 500 });
  }
}

/**
 * PUT /api/settings/profile
 * Update current user's profile
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await getAuthenticatedSession();
    if (!session.success) {
      return NextResponse.json({ error: session.error || "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { full_name, avatar_url } = body;

    const adminClient = getAdminClient();
    if (!adminClient) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const { user } = session.data!;

    // Update profile
    const { data: updatedProfile, error: updateError } = await adminClient
      .from("profiles")
      .update({ full_name, avatar_url, updated_at: new Date().toISOString() })
      .eq("id", user.id)
      .select()
      .single();

    if (updateError) {
      console.error("Profile update error:", updateError);
      return NextResponse.json({ error: "Failed to update profile: " + updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, profile: updatedProfile });
  } catch (error: any) {
    console.error("PUT /api/settings/profile error:", error);
    return NextResponse.json({ error: error.message || "Failed to update profile" }, { status: 500 });
  }
}
