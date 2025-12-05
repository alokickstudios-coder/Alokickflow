"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Check, Zap, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { PLANS, ADDONS, PlanSlug, getAvailableAddonsForPlan } from "@/config/subscriptionConfig";

interface PricingTier {
  name: string;
  price: string;
  priceId: string;
  description: string;
  features: string[];
  highlighted?: boolean;
  icon: React.ReactNode;
  slug: PlanSlug;
}

export default function PricingPage() {
  const [loading, setLoading] = useState<string | null>(null);
  const [availableAddons, setAvailableAddons] = useState<Record<PlanSlug, string[]>>({
    free: [],
    mid: [],
    enterprise: [],
  });
  const { toast } = useToast();

  useEffect(() => {
    // Get available addons for each plan
    const addons: Record<PlanSlug, string[]> = {
      free: [],
      mid: [],
      enterprise: [],
    };
    
    (['free', 'mid', 'enterprise'] as PlanSlug[]).forEach((slug) => {
      addons[slug] = getAvailableAddonsForPlan(slug);
    });
    
    setAvailableAddons(addons);
  }, []);

  // Build tiers from config
  const tiers: PricingTier[] = [
    {
      name: PLANS.free.name,
      price: `₹${PLANS.free.pricing.monthly}`,
      priceId: "free",
      description: PLANS.free.description,
      icon: <Zap className="h-5 w-5" />,
      slug: 'free',
      features: [
        `${PLANS.free.maxVendors === null ? 'Unlimited' : PLANS.free.maxVendors} vendors`,
        `${PLANS.free.maxTeamMembers === null ? 'Unlimited' : PLANS.free.maxTeamMembers} team members`,
        `${PLANS.free.includedSeriesPerBillingCycle === null ? 'Unlimited' : PLANS.free.includedSeriesPerBillingCycle} series per billing cycle`,
        `QC Level: ${PLANS.free.qcLevel}`,
        "Community support",
      ],
    },
    {
      name: PLANS.mid.name,
      price: `₹${PLANS.mid.pricing.monthly}`,
      priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_MID || "price_mid",
      description: PLANS.mid.description,
      icon: <Crown className="h-5 w-5" />,
      highlighted: true,
      slug: 'mid',
      features: [
        `${PLANS.mid.maxVendors === null ? 'Unlimited' : PLANS.mid.maxVendors} vendors`,
        `${PLANS.mid.maxTeamMembers === null ? 'Unlimited' : PLANS.mid.maxTeamMembers} team members`,
        `${PLANS.mid.includedSeriesPerBillingCycle === null ? 'Unlimited' : PLANS.mid.includedSeriesPerBillingCycle} series per billing cycle`,
        `QC Level: ${PLANS.mid.qcLevel}`,
        `${PLANS.mid.perSeriesOverageFee ? `₹${PLANS.mid.perSeriesOverageFee} per series overage` : 'No overage fees'}`,
        `${availableAddons.mid.length} premium add-ons available`,
        "Priority support",
      ],
    },
    {
      name: PLANS.enterprise.name,
      price: `₹${PLANS.enterprise.pricing.monthly}`,
      priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_ENTERPRISE || "price_enterprise",
      description: PLANS.enterprise.description,
      icon: <Crown className="h-5 w-5" />,
      slug: 'enterprise',
      features: [
        "Unlimited vendors",
        "Unlimited team members",
        "Unlimited series",
        `QC Level: ${PLANS.enterprise.qcLevel}`,
        "All premium add-ons included",
        "API access",
        "Dedicated support",
        "SLA guarantee",
      ],
    },
  ];

  const handleSubscribe = async (planSlug: PlanSlug) => {
    if (planSlug === "free") {
      toast({
        title: "Already on Free Plan",
        description: "You're currently on the free plan.",
        variant: "default",
      });
      return;
    }

    setLoading(planSlug);

    try {
      // For now, use the plan change API (without Stripe)
      // When Stripe keys are added, this will redirect to Stripe checkout
      const response = await fetch("/api/billing/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planSlug, billingCycle: "monthly" }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to change plan");
      }

      toast({
        title: "Plan Updated",
        description: `Successfully switched to ${data.subscription.plan.name} plan`,
        variant: "success",
      });

      // Refresh the page to show updated plan
      window.location.reload();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to change plan",
        variant: "destructive",
      });
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h1 className="text-4xl font-semibold text-white mb-4">
          Choose Your Plan
        </h1>
        <p className="text-zinc-400 max-w-2xl mx-auto">
          Select the plan that best fits your post-production workflow.
          All plans include a 14-day free trial.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3 max-w-6xl mx-auto">
        {tiers.map((tier, index) => (
          <motion.div
            key={tier.name}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.1 }}
          >
            <Card
              className={cn(
                "glass border-zinc-800/50 relative",
                tier.highlighted && "border-zinc-700 ring-2 ring-zinc-700/50"
              )}
            >
              {tier.highlighted && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <span className="bg-zinc-700 text-white text-xs font-medium px-3 py-1 rounded-full">
                    Most Popular
                  </span>
                </div>
              )}
              <CardHeader className="text-center pb-8">
                <div className="flex justify-center mb-4 text-zinc-400">
                  {tier.icon}
                </div>
                <CardTitle className="text-2xl text-white mb-2">
                  {tier.name}
                </CardTitle>
                <div className="text-4xl font-semibold text-white mb-2">
                  {tier.price}
                  {tier.price !== "$0" && (
                    <span className="text-lg font-normal text-zinc-400">/month</span>
                  )}
                </div>
                <p className="text-sm text-zinc-400">{tier.description}</p>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3 mb-6">
                  {tier.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                      <Check className="h-5 w-5 text-green-400 shrink-0 mt-0.5" />
                      <span className="text-sm text-zinc-300">{feature}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  onClick={() => handleSubscribe(tier.slug)}
                  disabled={loading === tier.slug}
                  variant={tier.highlighted ? "default" : "outline"}
                  className="w-full"
                >
                  {loading === tier.slug
                    ? "Loading..."
                    : tier.slug === "free"
                    ? "Current Plan"
                    : "Subscribe"}
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

