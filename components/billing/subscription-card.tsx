"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface SubscriptionCardProps {
  plan: {
    slug?: string;
    name: string;
    status: string;
    current_period_end: string;
  };
  limits: {
    maxVendors: number | null;
    maxTeamMembers: number | null;
    includedSeriesPerBillingCycle: number | null;
    qcLevel: string;
  };
  usage?: {
    series_count: number;
    episode_count: number;
    qc_minutes: number;
    remainingSeries: number | null;
    percentageUsed: number | null;
  };
  enabledAddons: string[];
}

export function SubscriptionCard({
  plan,
  limits,
  usage,
  enabledAddons,
}: SubscriptionCardProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-500/10 text-green-400 border-green-500/20";
      case "trialing":
        return "bg-blue-500/10 text-blue-400 border-blue-500/20";
      case "past_due":
        return "bg-yellow-500/10 text-yellow-400 border-yellow-500/20";
      default:
        return "bg-zinc-500/10 text-zinc-400 border-zinc-500/20";
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <Card className="glass border-zinc-800/50">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-white">{plan.name} Plan</CardTitle>
            <CardDescription className="text-zinc-400 mt-1">
              Current subscription details
            </CardDescription>
          </div>
          <Badge className={cn("border", getStatusColor(plan.status))}>
            {plan.status.charAt(0).toUpperCase() + plan.status.slice(1)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Period Info */}
        <div>
          <p className="text-sm text-zinc-400 mb-1">Billing Period</p>
          <p className="text-white">
            Renews on {formatDate(plan.current_period_end)}
          </p>
        </div>

        {/* Limits */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-white">Plan Limits</h4>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Vendors</span>
              <span className="text-white">
                {limits.maxVendors === null ? "Unlimited" : `Up to ${limits.maxVendors}`}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Team Members</span>
              <span className="text-white">
                {limits.maxTeamMembers === null
                  ? "Unlimited"
                  : `Up to ${limits.maxTeamMembers}`}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Series per Period</span>
              <span className="text-white">
                {limits.includedSeriesPerBillingCycle === null
                  ? "Unlimited"
                  : `${limits.includedSeriesPerBillingCycle}`}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">QC Level</span>
              <span className="text-white capitalize">{limits.qcLevel}</span>
            </div>
          </div>
        </div>

        {/* Usage */}
        {usage && limits.includedSeriesPerBillingCycle !== null && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-white">Series Usage</h4>
              <span className="text-sm text-zinc-400">
                {usage.series_count} / {limits.includedSeriesPerBillingCycle}
              </span>
            </div>
            <Progress
              value={usage.percentageUsed || 0}
              className="h-2"
            />
            {usage.remainingSeries !== null && (
              <p className="text-xs text-zinc-500">
                {usage.remainingSeries} series remaining this period
              </p>
            )}
            {usage.percentageUsed && usage.percentageUsed > 80 && (
              <div className="flex items-center gap-2 text-yellow-400 text-xs">
                <AlertCircle className="h-4 w-4" />
                <span>Approaching limit</span>
              </div>
            )}
          </div>
        )}

        {/* Enabled Addons */}
        {enabledAddons.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-white">Enabled Add-ons</h4>
            <div className="flex flex-wrap gap-2">
              {enabledAddons.map((addon) => (
                <Badge
                  key={addon}
                  variant="outline"
                  className="border-green-500/20 text-green-400 bg-green-500/10"
                >
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  {addon.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <Button
          variant="outline"
          className="w-full"
          onClick={async () => {
            try {
              const res = await fetch("/api/billing/createPortalSession", {
                method: "POST",
              });
              const data = await res.json();
              if (res.ok && data.url) {
                window.location.href = data.url;
              }
            } catch (error) {
              console.error("Failed to open portal:", error);
            }
          }}
        >
          Manage Subscription
        </Button>
      </CardContent>
    </Card>
  );
}

