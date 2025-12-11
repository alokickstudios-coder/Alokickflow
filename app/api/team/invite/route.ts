import { NextResponse } from "next/server";
import crypto from "crypto";
import { getAuthenticatedSession, getAdminClient } from "@/lib/api/auth-helpers";

export async function POST(request: Request) {
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
    const { email, role } = body;

    if (!email || !role) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const { organizationId, profile } = session.data!;

    if (!["super_admin", "admin", "manager"].includes(profile?.role || "")) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    // Get organization name
    const { data: org } = await adminClient
      .from("organizations")
      .select("name")
      .eq("id", organizationId)
      .single();
    
    const organizationName = org?.name || "AlokickFlow Team";

    // Check for existing pending invitation (don't use .single() - might not exist)
    const { data: existingInvites } = await adminClient
      .from("invitations")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("email", email)
      .eq("status", "pending")
      .limit(1);

    if (existingInvites && existingInvites.length > 0) {
      return NextResponse.json({ error: "Invitation already sent to this email" }, { status: 409 });
    }

    // Generate token
    const token = crypto.randomBytes(32).toString("hex");

    // Create invitation
    const { error: insertError } = await adminClient.from("invitations").insert({
      organization_id: organizationId,
      email,
      role,
      token,
    });

    if (insertError) {
      console.error("Error creating invitation:", insertError);
      // If table doesn't exist, provide helpful message
      if (insertError.message.includes("does not exist")) {
        return NextResponse.json({ 
          error: "Invitations table not found. Please run the database migrations." 
        }, { status: 500 });
      }
      return NextResponse.json({ error: "Failed to create invitation" }, { status: 500 });
    }

    // Send email invitation (non-blocking)
    const inviteLink = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/invite/${token}`;
    
    try {
      const { emailService } = await import("@/lib/email/service");
      await emailService.sendInvitation(email, inviteLink, organizationName);
    } catch (emailError) {
      console.error("Failed to send email:", emailError);
      // Don't fail the request if email fails
    }

    console.log(`Invitation created for ${email}`);
    console.log(`Invite Link: ${inviteLink}`);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[TEAM_INVITE_POST]", error);
    return NextResponse.json({ error: error.message || "Internal Error" }, { status: 500 });
  }
}
