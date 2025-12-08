"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Check, Zap, Crown, CreditCard, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { PLANS, PlanSlug } from "@/config/subscriptionConfig";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

interface SubscriptionData {
  subscription: {
    plan: {
      slug: PlanSlug;
      name: string;
      description: string;
    };
    status: string;
    current_period_start: string;
    current_period_end: string;
    billing_cycle: string;
  };
  limits: {
    maxVendors: number | null;
    maxTeamMembers: number | null;
    includedSeriesPerBillingCycle: number | null;
    qcLevel: string;
  };
  enabledAddons: string[];
}

interface UsageData {
  usage: {
    series_count: number;
    episode_count: number;
    qc_minutes: number;
    period_start: string;
    period_end: string;
  };
  limits: {
    includedSeriesPerBillingCycle: number | null;
    remainingSeries: number | null;
    percentageUsed: number | null;
  };
}

export default function BillingPage() {
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [subRes, usageRes] = await Promise.all([
        fetch("/api/billing/subscription"),
        fetch("/api/billing/usage"),
      ]);

      if (subRes.ok) {
        const subData = await subRes.json();
        setSubscription(subData);
      }

      if (usageRes.ok) {
        const usageData = await usageRes.json();
        setUsage(usageData);
      }
    } catch (error) {
      console.error("Error fetching billing data:", error);
      toast({
        title: "Error",
        description: "Failed to load billing information",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleChangePlan = async (planSlug: PlanSlug) => {
    setProcessing(true);
    try {
      const response = await fetch("/api/billing/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planSlug, billingCycle: "monthly" }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to change plan");

      toast({
        title: "Plan Updated",
        description: `Successfully switched to ${data.subscription.plan.name} plan`,
        variant: "success",
      });
      fetchData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to change plan",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleManageSubscription = async () => {
    setProcessing(true);
    try {
      const response = await fetch("/api/billing/createPortalSession", {
        method: "POST",
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to open portal");

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

  const currentPlanSlug = subscription?.subscription?.plan?.slug || "free";
  const plans = Object.values(PLANS).map((plan) => ({
    ...plan,
    icon: plan.slug === "free" ? Zap : plan.slug === "mid" ? Crown : Crown,
  }));

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
      ) : subscription ? (
        <Card className="glass border-zinc-800/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-white">
                  {subscription.subscription.plan.name} Plan
                </CardTitle>
                <CardDescription className="mt-1">
                  {subscription.subscription.plan.description}
                </CardDescription>
              </div>
              <Badge
                className={cn(
                  "border",
                  subscription.subscription.status === "active"
                    ? "bg-green-500/10 text-green-400 border-green-500/20"
                    : subscription.subscription.status === "past_due"
                    ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
                    : "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"
                )}
              >
                {subscription.subscription.status.charAt(0).toUpperCase() +
                  subscription.subscription.status.slice(1)}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-sm text-zinc-400 mb-1">Vendors</p>
                <p className="text-white font-medium">
                  {subscription.limits.maxVendors === null
                    ? "Unlimited"
                    : `Up to ${subscription.limits.maxVendors}`}
                </p>
              </div>
              <div>
                <p className="text-sm text-zinc-400 mb-1">Team Members</p>
                <p className="text-white font-medium">
                  {subscription.limits.maxTeamMembers === null
                    ? "Unlimited"
                    : `Up to ${subscription.limits.maxTeamMembers}`}
                </p>
              </div>
              <div>
                <p className="text-sm text-zinc-400 mb-1">Series per Period</p>
                <p className="text-white font-medium">
                  {subscription.limits.includedSeriesPerBillingCycle === null
                    ? "Unlimited"
                    : subscription.limits.includedSeriesPerBillingCycle}
                </p>
              </div>
              <div>
                <p className="text-sm text-zinc-400 mb-1">QC Level</p>
                <p className="text-white font-medium capitalize">
                  {subscription.limits.qcLevel}
                </p>
              </div>
            </div>

            {usage && subscription.limits.includedSeriesPerBillingCycle !== null && (
              <div className="space-y-2 pt-4 border-t border-zinc-800">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-400">Series Usage</span>
                  <span className="text-white">
                    {usage.usage.series_count} /{" "}
                    {subscription.limits.includedSeriesPerBillingCycle}
                  </span>
                </div>
                <Progress
                  value={usage.limits.percentageUsed || 0}
                  className="h-2"
                />
                {usage.limits.remainingSeries !== null && (
                  <p className="text-xs text-zinc-500">
                    {usage.limits.remainingSeries} series remaining this period
                  </p>
                )}
              </div>
            )}

            {subscription.enabledAddons.length > 0 && (
              <div className="pt-4 border-t border-zinc-800">
                <p className="text-sm text-zinc-400 mb-2">Enabled Add-ons</p>
                <div className="flex flex-wrap gap-2">
                  {subscription.enabledAddons.map((addon) => (
                    <Badge
                      key={addon}
                      variant="outline"
                      className="border-green-500/20 text-green-400 bg-green-500/10"
                    >
                      {addon.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <Button
              onClick={handleManageSubscription}
              disabled={processing}
              variant="outline"
              className="w-full"
            >
              <CreditCard className="h-4 w-4 mr-2" />
              {processing ? "Loading..." : "Manage Subscription"}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {/* Pricing Plans */}
      <div>
        <h2 className="text-2xl font-semibold text-white mb-6">
          Choose Your Plan
        </h2>
        <div className="grid gap-6 md:grid-cols-3">
          {plans.map((plan, index) => {
            const Icon = plan.icon;
            const isCurrentPlan = currentPlanSlug === plan.slug;

            return (
              <motion.div
                key={plan.slug}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
              >
                <Card
                  className={cn(
                    "glass relative overflow-hidden",
                    plan.slug === "mid"
                      ? "border-blue-500/50 shadow-lg shadow-blue-500/20"
                      : "border-zinc-800/50",
                    isCurrentPlan && "border-green-500/50"
                  )}
                >
                  {plan.slug === "mid" && (
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
                        ₹{plan.pricing.monthly.toLocaleString()}
                      </span>
                      <span className="text-zinc-400 ml-2">/month</span>
                    </div>
                    <CardDescription className="text-zinc-400">
                      {plan.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <ul className="space-y-3">
                      <li className="flex items-start gap-3">
                        <Check className="h-5 w-5 text-green-400 shrink-0 mt-0.5" />
                        <span className="text-sm text-zinc-300">
                          {plan.maxVendors === null
                            ? "Unlimited"
                            : `${plan.maxVendors}`}{" "}
                          vendors
                        </span>
                      </li>
                      <li className="flex items-start gap-3">
                        <Check className="h-5 w-5 text-green-400 shrink-0 mt-0.5" />
                        <span className="text-sm text-zinc-300">
                          {plan.maxTeamMembers === null
                            ? "Unlimited"
                            : `${plan.maxTeamMembers}`}{" "}
                          team members
                        </span>
                      </li>
                      <li className="flex items-start gap-3">
                        <Check className="h-5 w-5 text-green-400 shrink-0 mt-0.5" />
                        <span className="text-sm text-zinc-300">
                          {plan.includedSeriesPerBillingCycle === null
                            ? "Unlimited"
                            : `${plan.includedSeriesPerBillingCycle}`}{" "}
                          series per billing cycle
                        </span>
                      </li>
                      <li className="flex items-start gap-3">
                        <Check className="h-5 w-5 text-green-400 shrink-0 mt-0.5" />
                        <span className="text-sm text-zinc-300">
                          QC Level: {plan.qcLevel}
                        </span>
                      </li>
                      {plan.slug === "mid" && plan.perSeriesOverageFee && (
                        <li className="flex items-start gap-3">
                          <Check className="h-5 w-5 text-green-400 shrink-0 mt-0.5" />
                          <span className="text-sm text-zinc-300">
                            ₹{plan.perSeriesOverageFee} per series overage
                          </span>
                        </li>
                      )}
                    </ul>
                    {isCurrentPlan ? (
                      <Button className="w-full" disabled variant="outline">
                        Current Plan
                      </Button>
                    ) : (
                      <Button
                        className="w-full"
                        onClick={() => handleChangePlan(plan.slug)}
                        disabled={processing}
                      >
                        {processing ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Processing...
                          </>
                        ) : (
                          "Switch Plan"
                        )}
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
