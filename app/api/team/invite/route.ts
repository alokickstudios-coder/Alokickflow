import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import crypto from "crypto";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { email, role } = body;

    if (!email || !role) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Get user's organization and check permissions
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("organization_id, role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile || !profile.organization_id) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    if (!["super_admin", "admin", "manager"].includes(profile.role)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    // Get organization name
    const { data: org } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", profile.organization_id)
      .single();
    
    const organizationName = org?.name || "AlokickFlow Team";

    // Check for existing pending invitation (don't use .single() - might not exist)
    const { data: existingInvites } = await supabase
      .from("invitations")
      .select("id")
      .eq("organization_id", profile.organization_id)
      .eq("email", email)
      .eq("status", "pending")
      .limit(1);

    if (existingInvites && existingInvites.length > 0) {
      return NextResponse.json({ error: "Invitation already sent to this email" }, { status: 409 });
    }

    // Generate token
    const token = crypto.randomBytes(32).toString("hex");

    // Create invitation
    const { error: insertError } = await supabase.from("invitations").insert({
      organization_id: profile.organization_id,
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
