import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedSession, getAdminClient } from "@/lib/api/auth-helpers";

export const dynamic = "force-dynamic";

/**
 * GET /api/settings/organization
 * Get current user's organization (auto-creates if needed)
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

    const { organizationId } = session.data!;

    const { data: organization, error: orgError } = await adminClient
      .from("organizations")
      .select("*")
      .eq("id", organizationId)
      .single();

    if (orgError) {
      console.error("Organization fetch error:", orgError);
      return NextResponse.json({ error: "Failed to fetch organization" }, { status: 500 });
    }

    return NextResponse.json({ organization });
  } catch (error: any) {
    console.error("GET /api/settings/organization error:", error);
    return NextResponse.json({ error: error.message || "Failed to fetch organization" }, { status: 500 });
  }
}

/**
 * PUT /api/settings/organization
 * Update organization details
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await getAuthenticatedSession();
    if (!session.success) {
      return NextResponse.json({ error: session.error || "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name } = body;

    if (!name) {
      return NextResponse.json({ error: "Organization name is required" }, { status: 400 });
    }

    const adminClient = getAdminClient();
    if (!adminClient) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const { organizationId, profile } = session.data!;

    // Check if user is admin
    if (!["admin", "super_admin"].includes(profile?.role || "")) {
      return NextResponse.json({ error: "Only admins can update organization" }, { status: 403 });
    }

    // Update organization
    const { data: updatedOrg, error: updateError } = await adminClient
      .from("organizations")
      .update({ name, updated_at: new Date().toISOString() })
      .eq("id", organizationId)
      .select()
      .single();

    if (updateError) {
      console.error("Organization update error:", updateError);
      return NextResponse.json({ error: "Failed to update organization: " + updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, organization: updatedOrg });
  } catch (error: any) {
    console.error("PUT /api/settings/organization error:", error);
    return NextResponse.json({ error: error.message || "Failed to update organization" }, { status: 500 });
  }
}
