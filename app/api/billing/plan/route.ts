import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getPlanConfig, PlanSlug, ADDONS, AddonSlug } from "@/config/subscriptionConfig";

export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getAdminClient() {
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = getAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    const body = await request.json();
    const planSlug = body.planSlug as PlanSlug;
    const billingCycle = (body.billingCycle as "monthly" | "yearly") || "monthly";

    if (!planSlug || !["free", "mid", "enterprise"].includes(planSlug)) {
      return NextResponse.json(
        { error: "Invalid planSlug" },
        { status: 400 }
      );
    }

    // Get user's organization
    const { data: profile } = await admin
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

    if (profile.role !== "admin" && profile.role !== "super_admin") {
      return NextResponse.json(
        { error: "Only admins can change plans" },
        { status: 403 }
      );
    }

    // Fetch plan record
    const { data: plan } = await admin
      .from("plans")
      .select("*")
      .eq("slug", planSlug)
      .single();

    if (!plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    // Upsert subscription
    const nowIso = new Date().toISOString();
    const periodEnd = new Date();
    if (billingCycle === "yearly") {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    } else {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    }

    const { data: upsertSub, error: subError } = await admin
      .from("organisation_subscriptions")
      .upsert(
        {
          organisation_id: profile.organization_id,
          plan_id: plan.id,
          status: "active",
          current_period_start: nowIso,
          current_period_end: periodEnd.toISOString(),
          billing_cycle: billingCycle,
        },
        { onConflict: "organisation_id" }
      )
      .select("*, plan:plans(*)")
      .single();

    if (subError || !upsertSub) {
      return NextResponse.json(
        { error: subError?.message || "Failed to update plan" },
        { status: 500 }
      );
    }

    // Update organization subscription_tier for backward compatibility
    await admin
      .from("organizations")
      .update({ subscription_tier: planSlug })
      .eq("id", profile.organization_id);

    // Enable default addons when enterprise
    if (planSlug === "enterprise") {
      const { data: addonRecords } = await admin.from("addons").select("id, slug");
      const rows =
        addonRecords?.map((a) => ({
          organisation_id: profile.organization_id,
          addon_id: a.id,
          status: "active",
          current_period_start: nowIso,
          current_period_end: periodEnd.toISOString(),
          billing_cycle: billingCycle,
        })) || [];
      if (rows.length > 0) {
        await admin
          .from("organisation_addons")
          .upsert(rows, { onConflict: "organisation_id,addon_id" });
      }
    }

    // Respond with updated subscription
    const planConfig = getPlanConfig(planSlug);
    return NextResponse.json({
      subscription: {
        id: upsertSub.id,
        plan: upsertSub.plan,
        status: upsertSub.status,
        current_period_start: upsertSub.current_period_start,
        current_period_end: upsertSub.current_period_end,
        billing_cycle: upsertSub.billing_cycle,
      },
      limits: {
        maxVendors: planConfig.maxVendors,
        maxTeamMembers: planConfig.maxTeamMembers,
        includedSeriesPerBillingCycle: planConfig.includedSeriesPerBillingCycle,
        qcLevel: planConfig.qcLevel,
      },
      enabledAddons:
        planSlug === "enterprise"
          ? (Object.keys(ADDONS) as AddonSlug[])
          : planConfig.defaultAddons,
    });
  } catch (error: any) {
    console.error("Error updating plan:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update plan" },
      { status: 500 }
    );
  }
}



