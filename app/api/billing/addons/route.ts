import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { getOrganisationSubscription } from "@/lib/services/subscriptionService";
import { getAddonConfig, canPlanUseAddon, AddonSlug } from "@/config/subscriptionConfig";

export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getAdminClient() {
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * GET /api/billing/addons
 * 
 * Get available addons and current enabled addons
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

    // Get all addons from database
    const adminClient = getAdminClient();
    if (!adminClient) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    const { data: addons } = await adminClient
      .from("addons")
      .select("*")
      .order("name");

    // Filter addons available for current plan
    const availableAddons = (addons || []).filter((addon) =>
      canPlanUseAddon(subscription.plan_slug, addon.slug as AddonSlug)
    );

    return NextResponse.json({
      availableAddons: availableAddons.map((addon) => ({
        ...addon,
        config: getAddonConfig(addon.slug as AddonSlug),
        enabled: subscription.enabled_addons.includes(addon.slug as AddonSlug),
      })),
      enabledAddons: subscription.enabled_addons,
    });
  } catch (error: any) {
    console.error("Error fetching addons:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch addons" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/billing/addons
 * 
 * Enable or disable an addon
 * For now, just updates the database. Real billing integration comes later.
 */
export async function POST(request: NextRequest) {
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
      .select("organization_id, role")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json(
        { error: "No organization found" },
        { status: 400 }
      );
    }

    // Only admins can manage addons
    if (profile.role !== "admin" && profile.role !== "super_admin") {
      return NextResponse.json(
        { error: "Only admins can manage addons" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { addonSlug, enabled } = body;

    if (!addonSlug || typeof enabled !== "boolean") {
      return NextResponse.json(
        { error: "addonSlug and enabled are required" },
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

    // Check if addon can be used with current plan
    if (!canPlanUseAddon(subscription.plan_slug, addonSlug as AddonSlug)) {
      return NextResponse.json(
        { error: "This addon is not available for your plan" },
        { status: 400 }
      );
    }

    const adminClient = getAdminClient();
    if (!adminClient) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    // Get addon ID
    const { data: addon } = await adminClient
      .from("addons")
      .select("id")
      .eq("slug", addonSlug)
      .single();

    if (!addon) {
      return NextResponse.json({ error: "Addon not found" }, { status: 404 });
    }

    if (enabled) {
      // Enable addon
      const periodEnd = new Date();
      periodEnd.setMonth(periodEnd.getMonth() + 1); // Default to monthly

      const { error: upsertError } = await adminClient
        .from("organisation_addons")
        .upsert(
          {
            organisation_id: profile.organization_id,
            addon_id: addon.id,
            status: "active",
            current_period_start: new Date().toISOString(),
            current_period_end: periodEnd.toISOString(),
            billing_cycle: "monthly",
          },
          { onConflict: "organisation_id,addon_id" }
        );

      if (upsertError) {
        throw upsertError;
      }
    } else {
      // Disable addon
      const { error: deleteError } = await adminClient
        .from("organisation_addons")
        .update({ status: "cancelled" })
        .eq("organisation_id", profile.organization_id)
        .eq("addon_id", addon.id);

      if (deleteError) {
        throw deleteError;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Addon ${enabled ? "enabled" : "disabled"} successfully`,
    });
  } catch (error: any) {
    console.error("Error updating addon:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update addon" },
      { status: 500 }
    );
  }
}



