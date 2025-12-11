/**
 * Team API
 * 
 * GET - List team members for the current user's organization
 * POST - Update team member (role change, etc.)
 * DELETE - Remove team member
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedSession, getAdminClient } from "@/lib/api/auth-helpers";

export const dynamic = "force-dynamic";

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

    // Fetch team members (excluding vendors)
    const { data: members, error: membersError } = await adminClient
      .from("profiles")
      .select("id, full_name, role, created_at")
      .eq("organization_id", organizationId)
      .neq("role", "vendor")
      .order("created_at", { ascending: false });

    if (membersError) {
      console.error("Error fetching members:", membersError);
    }

    // Fetch pending invitations
    const { data: invitations, error: invitationsError } = await adminClient
      .from("invitations")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (invitationsError) {
      console.error("Error fetching invitations:", invitationsError);
    }

    return NextResponse.json({
      members: members || [],
      invitations: invitations || [],
      organizationId,
    });
  } catch (error: any) {
    console.error("Team API error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthenticatedSession();
    if (!session.success) {
      return NextResponse.json({ error: session.error || "Unauthorized" }, { status: 401 });
    }

    const adminClient = getAdminClient();
    if (!adminClient) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const body = await request.json();
    const { memberId, role } = body;

    if (!memberId || !role) {
      return NextResponse.json({ error: "memberId and role are required" }, { status: 400 });
    }

    // Update member role
    const { data, error } = await adminClient
      .from("profiles")
      .update({ role })
      .eq("id", memberId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, member: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getAuthenticatedSession();
    if (!session.success) {
      return NextResponse.json({ error: session.error || "Unauthorized" }, { status: 401 });
    }

    const adminClient = getAdminClient();
    if (!adminClient) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const memberId = searchParams.get("memberId");
    const invitationId = searchParams.get("invitationId");

    if (invitationId) {
      // Delete invitation
      const { error } = await adminClient
        .from("invitations")
        .delete()
        .eq("id", invitationId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, deleted: "invitation" });
    }

    if (memberId) {
      // Delete member
      const { error } = await adminClient
        .from("profiles")
        .delete()
        .eq("id", memberId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, deleted: "member" });
    }

    return NextResponse.json({ error: "memberId or invitationId required" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
