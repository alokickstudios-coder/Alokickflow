"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { PlayCircle, Lock, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface QCStartButtonProps {
  episodeId: string;
  seriesId: string;
  deliveryId?: string;
  fileUrl?: string;
  onQCComplete?: () => void;
}

export function QCStartButton({
  episodeId,
  seriesId,
  deliveryId,
  fileUrl,
  onQCComplete,
}: QCStartButtonProps) {
  const [loading, setLoading] = useState(false);
  const [canStartQC, setCanStartQC] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upgradeRequired, setUpgradeRequired] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    checkQCAvailability();
  }, [seriesId]);

  const checkQCAvailability = async () => {
    try {
      // Check subscription and usage
      const [subscriptionRes, usageRes] = await Promise.all([
        fetch("/api/billing/subscription"),
        fetch("/api/billing/usage"),
      ]);

      if (!subscriptionRes.ok || !usageRes.ok) {
        setCanStartQC(false);
        return;
      }

      const subscription = await subscriptionRes.json();
      const usage = await usageRes.json();

      // Check if QC is available
      if (subscription.limits.qcLevel === "none") {
        setUpgradeRequired(true);
        setCanStartQC(false);
        return;
      }

      // Check if limit is reached
      if (
        usage.limits.includedSeriesPerBillingCycle !== null &&
        usage.limits.remainingSeries === 0
      ) {
        setLimitReached(true);
        setCanStartQC(false);
        return;
      }

      setCanStartQC(true);
      setUpgradeRequired(false);
      setLimitReached(false);
    } catch (err) {
      console.error("Error checking QC availability:", err);
      setCanStartQC(false);
    }
  };

  const handleStartQC = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/qc/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          episodeId,
          seriesId,
          deliveryId,
          fileUrl,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 403 && data.upgradeRequired) {
          setUpgradeRequired(true);
          toast({
            title: "QC Not Available",
            description: data.message || "Upgrade to enable automated QC",
            variant: "destructive",
          });
        } else if (response.status === 402 && data.requiresOverage) {
          setLimitReached(true);
          toast({
            title: "Limit Reached",
            description:
              data.message ||
              "You have reached your series limit for this billing period",
            variant: "destructive",
          });
        } else {
          throw new Error(data.error || "Failed to start QC");
        }
        return;
      }

      toast({
        title: "QC Started",
        description: "Quality control processing has begun",
        variant: "success",
      });

      onQCComplete?.();
    } catch (err: any) {
      setError(err.message || "Failed to start QC");
      toast({
        title: "Error",
        description: err.message || "Failed to start QC",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (upgradeRequired) {
    return (
      <Button
        variant="outline"
        disabled
        className="border-yellow-500/40 text-yellow-300"
      >
        <Lock className="h-4 w-4 mr-2" />
        Upgrade Required
      </Button>
    );
  }

  if (limitReached) {
    return (
      <Button
        variant="outline"
        disabled
        className="border-red-500/40 text-red-300"
      >
        <AlertCircle className="h-4 w-4 mr-2" />
        Limit Reached
      </Button>
    );
  }

  return (
    <Button
      onClick={handleStartQC}
      disabled={loading || !canStartQC}
      className={cn(
        "border-purple-500/40 text-purple-300 hover:bg-purple-500/10",
        !canStartQC && "opacity-50 cursor-not-allowed"
      )}
    >
      <PlayCircle className="h-4 w-4 mr-2" />
      {loading ? "Starting QC..." : "Start QC"}
    </Button>
  );
}

