"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Check, Sparkles, Zap, Crown, CreditCard, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Organization {
  id: string;
  name: string;
  subscription_tier: "free" | "pro" | "enterprise";
  stripe_customer_id: string | null;
}

const plans = [
  {
    name: "Free",
    tier: "free",
    price: 0,
    icon: Sparkles,
    description: "Perfect for getting started",
    features: [
      "1 project",
      "2 vendors",
      "1GB storage",
      "50 deliveries/month",
      "Basic QC checks",
    ],
  },
  {
    name: "Pro",
    tier: "pro",
    price: 49,
    icon: Zap,
    description: "For growing production teams",
    features: [
      "10 projects",
      "Unlimited vendors",
      "50GB storage",
      "500 deliveries/month",
      "Advanced QC checks",
      "Email support",
      "Custom QC rules",
    ],
    popular: true,
  },
  {
    name: "Enterprise",
    tier: "enterprise",
    price: 199,
    icon: Crown,
    description: "For large-scale operations",
    features: [
      "Unlimited projects",
      "Unlimited vendors",
      "500GB storage",
      "Unlimited deliveries",
      "All QC features",
      "Priority support",
      "API access",
      "Custom integrations",
      "SSO support",
    ],
  },
];

export default function BillingPage() {
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchOrganization();
  }, []);

  const fetchOrganization = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", user.id)
        .single();

      if (!profile?.organization_id) return;

      const { data: org } = await supabase
        .from("organizations")
        .select("*")
        .eq("id", profile.organization_id)
        .single();

      setOrganization(org);
    } catch (error) {
      console.error("Error fetching organization:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpgrade = async (tier: string) => {
    setProcessing(true);

    try {
      const response = await fetch("/api/stripe/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.error);

      // Redirect to Stripe checkout
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to start checkout",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleManageSubscription = async () => {
    setProcessing(true);

    try {
      const response = await fetch("/api/stripe/customer-portal", {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.error);

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to open customer portal",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold text-white mb-2">
          Billing & Subscription
        </h1>
        <p className="text-zinc-400">
          Manage your subscription and billing information
        </p>
      </div>

      {/* Current Plan */}
      {loading ? (
        <Card className="glass border-zinc-800/50">
          <CardHeader>
            <Skeleton className="h-6 w-32 mb-2" />
            <Skeleton className="h-4 w-48" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-10 w-40" />
          </CardContent>
        </Card>
      ) : organization && (
        <Card className="glass border-zinc-800/50">
          <CardHeader>
            <CardTitle className="text-white">Current Plan</CardTitle>
            <CardDescription>
              You are currently on the{" "}
              <span className="font-semibold text-white">
                {organization.subscription_tier.charAt(0).toUpperCase() +
                  organization.subscription_tier.slice(1)}
              </span>{" "}
              plan
            </CardDescription>
          </CardHeader>
          <CardContent>
            {organization.stripe_customer_id && (
              <Button
                onClick={handleManageSubscription}
                disabled={processing}
                variant="outline"
              >
                <CreditCard className="h-4 w-4 mr-2" />
                {processing ? "Loading..." : "Manage Subscription"}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Pricing Plans */}
      <div>
        <h2 className="text-2xl font-semibold text-white mb-6">
          Choose Your Plan
        </h2>
        <div className="grid gap-6 md:grid-cols-3">
          {plans.map((plan, index) => {
            const Icon = plan.icon;
            const isCurrentPlan =
              organization?.subscription_tier === plan.tier;

            return (
              <motion.div
                key={plan.tier}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
              >
                <Card
                  className={cn(
                    "glass relative overflow-hidden",
                    plan.popular
                      ? "border-blue-500/50 shadow-lg shadow-blue-500/20"
                      : "border-zinc-800/50",
                    isCurrentPlan && "border-green-500/50"
                  )}
                >
                  {plan.popular && (
                    <div className="absolute top-0 right-0 bg-blue-500 text-white text-xs font-bold px-3 py-1">
                      POPULAR
                    </div>
                  )}
                  <CardHeader>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 rounded-lg bg-zinc-800/50">
                        <Icon className="h-6 w-6 text-zinc-400" />
                      </div>
                      <div>
                        <CardTitle className="text-white text-2xl">
                          {plan.name}
                        </CardTitle>
                      </div>
                    </div>
                    <div className="mb-4">
                      <span className="text-4xl font-bold text-white">
                        ${plan.price}
                      </span>
                      <span className="text-zinc-400 ml-2">/month</span>
                    </div>
                    <CardDescription className="text-zinc-400">
                      {plan.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <ul className="space-y-3">
                      {plan.features.map((feature, idx) => (
                        <li key={idx} className="flex items-start gap-3">
                          <Check className="h-5 w-5 text-green-400 shrink-0 mt-0.5" />
                          <span className="text-sm text-zinc-300">{feature}</span>
                        </li>
                      ))}
                    </ul>
                    {isCurrentPlan ? (
                      <Button className="w-full" disabled variant="outline">
                        Current Plan
                      </Button>
                    ) : plan.tier === "free" ? (
                      <Button
                        className="w-full"
                        variant="outline"
                        disabled={organization?.subscription_tier === "free"}
                      >
                        Current Plan
                      </Button>
                    ) : (
                      <Button
                        className="w-full"
                        onClick={() => handleUpgrade(plan.tier)}
                        disabled={processing}
                      >
                        {processing ? "Loading..." : "Upgrade Now"}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

