import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

/**
 * POST /api/billing/createPortalSession
 * 
 * Create Stripe customer portal session for managing subscription
 * For now, returns a placeholder. Will integrate with Stripe when keys are added.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase: SupabaseClient = await createClient();
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

    // Get subscription to check if Stripe customer exists
    const { data: subscription } = await supabase
      .from("organisation_subscriptions")
      .select("external_customer_id")
      .eq("organisation_id", profile.organization_id)
      .single();

    // For now, return a placeholder message
    // When Stripe keys are added, integrate with Stripe billing portal
    if (!subscription?.external_customer_id) {
      return NextResponse.json(
        {
          error: "Stripe integration not configured yet. Please contact support to manage your subscription.",
        },
        { status: 400 }
      );
    }

    // TODO: When Stripe keys are added, uncomment this:
    /*
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: subscription.external_customer_id,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings`,
    });
    return NextResponse.json({ url: portalSession.url });
    */

    return NextResponse.json(
      {
        error: "Stripe integration not configured yet. Please contact support.",
      },
      { status: 400 }
    );
  } catch (error: any) {
    console.error("Error creating portal session:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create portal session" },
      { status: 500 }
    );
  }
}

