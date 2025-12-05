import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import Stripe from "stripe";

export const dynamic = "force-dynamic";

/**
 * POST /api/billing/createPortalSession
 * 
 * Create Stripe customer portal session for managing subscription.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient();
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

    if (!subscription?.external_customer_id) {
      return NextResponse.json(
        {
          error: "Stripe customer not found. Please contact support.",
        },
        { status: 400 }
      );
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
        apiVersion: "2024-06-20",
    });

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: subscription.external_customer_id,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings`,
    });
    
    return NextResponse.json({ url: portalSession.url });

  } catch (error: any) {
    console.error("Error creating portal session:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create portal session" },
      { status: 500 }
    );
  }
}
