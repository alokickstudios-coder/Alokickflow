import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getOrganisationSubscription } from "@/lib/services/subscriptionService";
import { getPlanConfig } from "@/config/subscriptionConfig";

export const dynamic = "force-dynamic";

/**
 * GET /api/billing/subscription
 * 
 * Get current subscription, plan, and enabled addons for the authenticated user's organization
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's organization
    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json(
        { error: "No organization found" },
        { status: 400 }
      );
    }

    // Get subscription
    const subscription = await getOrganisationSubscription(
      profile.organization_id
    );

    if (!subscription) {
      return NextResponse.json(
        { error: "No subscription found" },
        { status: 404 }
      );
    }

    // Get plan config for limits
    const planConfig = getPlanConfig(subscription.plan_slug);

    return NextResponse.json({
      subscription: {
        id: subscription.id,
        plan: subscription.plan,
        status: subscription.status,
        current_period_start: subscription.current_period_start,
        current_period_end: subscription.current_period_end,
        billing_cycle: subscription.billing_cycle,
      },
      limits: {
        maxVendors: planConfig.maxVendors,
        maxTeamMembers: planConfig.maxTeamMembers,
        includedSeriesPerBillingCycle: planConfig.includedSeriesPerBillingCycle,
        qcLevel: planConfig.qcLevel,
      },
      enabledAddons: subscription.enabled_addons,
    });
  } catch (error: any) {
    console.error("Error fetching subscription:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch subscription" },
      { status: 500 }
    );
  }
}



