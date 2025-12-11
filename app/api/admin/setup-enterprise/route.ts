/**
 * Admin API to setup enterprise subscription for an organization
 * 
 * This endpoint ensures all database tables are properly configured
 * for enterprise features to work.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { ADDONS } from "@/config/subscriptionConfig";

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

export async function POST(request: NextRequest) {
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

    // Get user's organization
    const { data: profile } = await adminClient
      .from("profiles")
      .select("organization_id, role")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json(
        { error: "No organization found" },
        { status: 400 }
      );
    }

    const orgId = profile.organization_id;
    const nowIso = new Date().toISOString();
    const periodEnd = new Date();
    periodEnd.setFullYear(periodEnd.getFullYear() + 1); // 1 year subscription

    // Step 1: Ensure plans table has enterprise plan
    const { data: existingPlan } = await adminClient
      .from("plans")
      .select("id")
      .eq("slug", "enterprise")
      .single();

    let enterprisePlanId = existingPlan?.id;

    if (!enterprisePlanId) {
      // Create enterprise plan
      const { data: newPlan, error: planError } = await adminClient
        .from("plans")
        .insert({
          slug: "enterprise",
          name: "Enterprise",
          description: "Full access to all features",
          is_default: false,
          price_monthly: 0,
          price_yearly: 0,
        })
        .select("id")
        .single();

      if (planError) {
        console.error("Error creating plan:", planError);
        // Try to get existing plan
        const { data: fallback } = await adminClient
          .from("plans")
          .select("id")
          .eq("slug", "enterprise")
          .single();
        enterprisePlanId = fallback?.id;
      } else {
        enterprisePlanId = newPlan?.id;
      }
    }

    if (!enterprisePlanId) {
      return NextResponse.json(
        { error: "Could not find or create enterprise plan" },
        { status: 500 }
      );
    }

    // Step 2: Update organization to enterprise tier
    await adminClient
      .from("organizations")
      .update({
        subscription_tier: "enterprise",
        updated_at: nowIso,
      })
      .eq("id", orgId);

    // Step 3: Create/update organization subscription
    const { error: subError } = await adminClient
      .from("organisation_subscriptions")
      .upsert(
        {
          organisation_id: orgId,
          plan_id: enterprisePlanId,
          status: "active",
          current_period_start: nowIso,
          current_period_end: periodEnd.toISOString(),
          billing_cycle: "yearly",
        },
        { onConflict: "organisation_id" }
      );

    if (subError) {
      console.error("Error upserting subscription:", subError);
    }

    // Step 4: Ensure all addons exist and are enabled
    const addonSlugs = Object.keys(ADDONS);
    
    // Get or create addons
    for (const slug of addonSlugs) {
      const addonConfig = ADDONS[slug as keyof typeof ADDONS];
      
      // Check if addon exists
      const { data: existingAddon } = await adminClient
        .from("addons")
        .select("id")
        .eq("slug", slug)
        .single();

      let addonId = existingAddon?.id;

      if (!addonId) {
        // Create addon
        const { data: newAddon, error: addonCreateError } = await adminClient
          .from("addons")
          .insert({
            slug,
            name: addonConfig.name,
            description: addonConfig.description,
          })
          .select("id")
          .single();

        if (!addonCreateError && newAddon) {
          addonId = newAddon.id;
        }
      }

      // Enable addon for organization
      if (addonId) {
        await adminClient
          .from("organisation_addons")
          .upsert(
            {
              organisation_id: orgId,
              addon_id: addonId,
              status: "active",
              current_period_start: nowIso,
              current_period_end: periodEnd.toISOString(),
              billing_cycle: "yearly",
            },
            { onConflict: "organisation_id,addon_id" }
          );
      }
    }

    // Step 5: Enable feature flags for enterprise features
    const enterpriseFeatures = [
      "creative_qc_spi",
      "lip_sync_qc",
      "video_glitch_qc",
      "bgm_detection",
      "premium_qc_report",
      "multi_language_qc",
    ];

    for (const feature of enterpriseFeatures) {
      await adminClient
        .from("feature_flags")
        .upsert(
          {
            organization_id: orgId,
            feature_key: feature,
            enabled: true,
            updated_at: nowIso,
          },
          { onConflict: "organization_id,feature_key" }
        );
    }

    // Step 6: Initialize Creative QC settings if not exists
    const { data: org } = await adminClient
      .from("organizations")
      .select("creative_qc_settings")
      .eq("id", orgId)
      .single();

    if (!org?.creative_qc_settings) {
      await adminClient
        .from("organizations")
        .update({
          creative_qc_settings: {
            enabled: false,
            betaAccepted: false,
          },
        })
        .eq("id", orgId);
    }

    // Fetch final subscription state
    const { data: finalSub } = await adminClient
      .from("organisation_subscriptions")
      .select("*, plan:plans(*)")
      .eq("organisation_id", orgId)
      .single();

    const { data: enabledAddons } = await adminClient
      .from("organisation_addons")
      .select("*, addon:addons(*)")
      .eq("organisation_id", orgId)
      .eq("status", "active");

    const { data: featureFlags } = await adminClient
      .from("feature_flags")
      .select("*")
      .eq("organization_id", orgId);

    return NextResponse.json({
      success: true,
      message: "Enterprise subscription setup complete",
      subscription: {
        plan: finalSub?.plan?.slug || "enterprise",
        status: finalSub?.status || "active",
      },
      enabledAddons: enabledAddons?.map((a: any) => a.addon?.slug).filter(Boolean) || [],
      featureFlags: featureFlags?.map((f: any) => ({ key: f.feature_key, enabled: f.enabled })) || [],
    });
  } catch (error: any) {
    console.error("Error setting up enterprise:", error);
    return NextResponse.json(
      { error: error.message || "Failed to setup enterprise" },
      { status: 500 }
    );
  }
}

// GET endpoint to check current subscription status
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

    // Get user's organization
    const { data: profile } = await adminClient
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

    const orgId = profile.organization_id;

    // Get organization details
    const { data: org } = await adminClient
      .from("organizations")
      .select("*")
      .eq("id", orgId)
      .single();

    // Get subscription
    const { data: subscription } = await adminClient
      .from("organisation_subscriptions")
      .select("*, plan:plans(*)")
      .eq("organisation_id", orgId)
      .single();

    // Get enabled addons
    const { data: addons } = await adminClient
      .from("organisation_addons")
      .select("*, addon:addons(*)")
      .eq("organisation_id", orgId)
      .eq("status", "active");

    // Get feature flags
    const { data: flags } = await adminClient
      .from("feature_flags")
      .select("*")
      .eq("organization_id", orgId);

    // Check plans table
    const { data: plans } = await adminClient
      .from("plans")
      .select("*");

    // Check addons table
    const { data: allAddons } = await adminClient
      .from("addons")
      .select("*");

    return NextResponse.json({
      organization: {
        id: org?.id,
        name: org?.name,
        subscription_tier: org?.subscription_tier,
        creative_qc_settings: org?.creative_qc_settings,
      },
      subscription: subscription ? {
        plan_slug: subscription.plan?.slug,
        plan_name: subscription.plan?.name,
        status: subscription.status,
      } : null,
      enabledAddons: addons?.map((a: any) => ({
        slug: a.addon?.slug,
        name: a.addon?.name,
        status: a.status,
      })) || [],
      featureFlags: flags?.map((f: any) => ({
        key: f.feature_key,
        enabled: f.enabled,
      })) || [],
      database: {
        plansCount: plans?.length || 0,
        plansAvailable: plans?.map((p: any) => p.slug) || [],
        addonsCount: allAddons?.length || 0,
        addonsAvailable: allAddons?.map((a: any) => a.slug) || [],
      },
    });
  } catch (error: any) {
    console.error("Error getting subscription status:", error);
    return NextResponse.json(
      { error: error.message || "Failed to get status" },
      { status: 500 }
    );
  }
}
