import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { getOrganisationSubscription } from "@/lib/services/subscriptionService";
import { getPlanConfig, PLANS, ADDONS, AddonSlug } from "@/config/subscriptionConfig";

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

/**
 * GET /api/billing/subscription
 * 
 * Get current subscription, plan, and enabled addons for the authenticated user's organization
 * Will auto-create profile and organization if they don't exist
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

    const adminClient = getAdminClient();
    if (!adminClient) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    // Get user's profile using admin client to bypass RLS
    let { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    // Auto-create profile and organization if they don't exist
    if (profileError || !profile?.organization_id) {
      console.log("Profile not found, creating...");
      
      // Check if organization exists for this user
      let { data: existingOrg } = await adminClient
        .from("organizations")
        .select("id, subscription_tier")
        .eq("owner_id", user.id)
        .single();

      let organizationId = existingOrg?.id;

      if (!organizationId) {
        // Create new organization with enterprise tier
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
          console.error("Failed to create organization:", orgError);
          return NextResponse.json(
            { error: "Failed to create organization" },
            { status: 500 }
          );
        }
        organizationId = newOrg.id;
      }

      // Create or update profile
      const { error: upsertError } = await adminClient
        .from("profiles")
        .upsert({
          id: user.id,
          organization_id: organizationId,
          full_name: user.user_metadata?.full_name || user.email?.split("@")[0],
          role: "admin",
        });

      if (upsertError) {
        console.error("Failed to create profile:", upsertError);
        return NextResponse.json(
          { error: "Failed to create profile" },
          { status: 500 }
        );
      }

      profile = { organization_id: organizationId };
    }

    // Get subscription (this will auto-create if needed)
    const subscription = await getOrganisationSubscription(
      profile.organization_id
    );

    if (!subscription) {
      // Return a default enterprise subscription
      const enterpriseConfig = getPlanConfig("enterprise");
      return NextResponse.json({
        subscription: {
          id: "default",
          plan: {
            slug: "enterprise",
            name: "Enterprise",
            description: "Full access to all features",
            qcLevel: "full",
          },
          status: "active",
          current_period_start: new Date().toISOString(),
          current_period_end: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          billing_cycle: "yearly",
        },
        limits: {
          maxVendors: enterpriseConfig.maxVendors,
          maxTeamMembers: enterpriseConfig.maxTeamMembers,
          includedSeriesPerBillingCycle: enterpriseConfig.includedSeriesPerBillingCycle,
          qcLevel: enterpriseConfig.qcLevel,
        },
        enabledAddons: Object.keys(ADDONS) as AddonSlug[],
      });
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

