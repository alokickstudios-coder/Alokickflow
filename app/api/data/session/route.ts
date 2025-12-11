/**
 * Unified Session API
 * 
 * Returns authenticated user, profile, organization, and subscription info.
 * ALWAYS creates profile/organization if missing - no user should ever lack an organization.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedSession, getAdminClient } from "@/lib/api/auth-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthenticatedSession();

    if (!session.success) {
      if (session.error === "Not authenticated") {
        return NextResponse.json({ authenticated: false }, { status: 401 });
      }
      return NextResponse.json({ error: session.error }, { status: 500 });
    }

    const { user, profile, organization, organizationId } = session.data!;

    // Get subscription info
    let subscription = null;
    const adminClient = getAdminClient();
    if (adminClient && organizationId) {
      const { data: sub } = await adminClient
        .from("organisation_subscriptions")
        .select("*, plan:plans(*)")
        .eq("organisation_id", organizationId)
        .eq("status", "active")
        .maybeSingle();
      subscription = sub;
    }

    return NextResponse.json({
      authenticated: true,
      user,
      profile,
      organization,
      subscription,
      organizationId,
    });
  } catch (error: any) {
    console.error("Session API error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
