import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getCurrentUsage, getOrganisationSubscription } from "@/lib/services/subscriptionService";
import { getPlanConfig } from "@/config/subscriptionConfig";

export const dynamic = "force-dynamic";

/**
 * GET /api/billing/usage
 * 
 * Get current usage for the authenticated user's organization
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

    // Get usage
    const usage = await getCurrentUsage(profile.organization_id);

    // Get subscription for limits
    const subscription = await getOrganisationSubscription(
      profile.organization_id
    );
    const planConfig = subscription
      ? getPlanConfig(subscription.plan_slug)
      : null;

    const limit = planConfig?.includedSeriesPerBillingCycle ?? null;
    const remaining =
      limit !== null ? Math.max(0, limit - usage.series_count) : null;
    const percentageUsed =
      limit !== null ? Math.min(100, (usage.series_count / limit) * 100) : null;

    return NextResponse.json({
      usage: {
        series_count: usage.series_count,
        episode_count: usage.episode_count,
        qc_minutes: usage.qc_minutes,
        period_start: usage.period_start,
        period_end: usage.period_end,
      },
      limits: {
        includedSeriesPerBillingCycle: limit,
        remainingSeries: remaining,
        percentageUsed: percentageUsed,
      },
    });
  } catch (error: any) {
    console.error("Error fetching usage:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch usage" },
      { status: 500 }
    );
  }
}



