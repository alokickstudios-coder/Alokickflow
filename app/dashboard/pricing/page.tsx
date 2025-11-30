"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Zap, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface PricingTier {
  name: string;
  price: string;
  priceId: string;
  description: string;
  features: string[];
  highlighted?: boolean;
  icon: React.ReactNode;
}

const tiers: PricingTier[] = [
  {
    name: "Free",
    price: "$0",
    priceId: "free",
    description: "Perfect for trying out AlokickFlow",
    icon: <Zap className="h-5 w-5" />,
    features: [
      "1 project",
      "3 vendors",
      "10 GB storage",
      "100 deliveries/month",
      "Basic QC checks",
      "Community support",
    ],
  },
  {
    name: "Pro",
    price: "$49",
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_PRO || "price_pro",
    description: "For growing post-production teams",
    icon: <Crown className="h-5 w-5" />,
    highlighted: true,
    features: [
      "Unlimited projects",
      "Unlimited vendors",
      "100 GB storage",
      "1,000 deliveries/month",
      "Advanced QC checks",
      "Bulk QC processing",
      "Priority support",
      "Custom branding",
    ],
  },
  {
    name: "Enterprise",
    price: "$199",
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_ENTERPRISE || "price_enterprise",
    description: "For large-scale operations",
    icon: <Crown className="h-5 w-5" />,
    features: [
      "Everything in Pro",
      "Unlimited storage",
      "Unlimited deliveries",
      "Custom QC templates",
      "API access",
      "White-label option",
      "Dedicated support",
      "SLA guarantee",
    ],
  },
];

export default function PricingPage() {
  const [loading, setLoading] = useState<string | null>(null);
  const { toast } = useToast();

  const handleSubscribe = async (priceId: string) => {
    if (priceId === "free") {
      toast({
        title: "Already on Free Plan",
        description: "You're currently on the free plan.",
        variant: "default",
      });
      return;
    }

    setLoading(priceId);

    try {
      const response = await fetch("/api/stripe/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create checkout session");
      }

      // Redirect to Stripe Checkout
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
                  onClick={() => handleSubscribe(tier.priceId)}
                  disabled={loading === tier.priceId}
                  variant={tier.highlighted ? "default" : "outline"}
                  className="w-full"
                >
                  {loading === tier.priceId
                    ? "Loading..."
                    : tier.name === "Free"
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

