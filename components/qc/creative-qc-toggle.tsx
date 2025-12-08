"use client";

import { useState, useEffect } from "react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sparkles,
  Shield,
  Brain,
  AlertTriangle,
  ChevronRight,
  Loader2,
  Info,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface CreativeQCSettings {
  enabled: boolean;
  betaAccepted: boolean;
  customParameters?: string[];
  targetAudience?: string;
  brandGuidelines?: string;
  platformType?: string;
}

interface CreativeQCToggleProps {
  className?: string;
  onSettingsChange?: (settings: CreativeQCSettings) => void;
}

export function CreativeQCToggle({ className, onSettingsChange }: CreativeQCToggleProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [available, setAvailable] = useState(false);
  const [availabilityReason, setAvailabilityReason] = useState<string | null>(null);
  const [settings, setSettings] = useState<CreativeQCSettings | null>(null);
  const [showBetaDialog, setShowBetaDialog] = useState(false);
  const [showInfoDialog, setShowInfoDialog] = useState(false);
  const [categories, setCategories] = useState<any>(null);
  const [totalParameters, setTotalParameters] = useState(0);

  // Fetch settings on mount
  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/qc/creative/settings");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch settings");
      }

      setAvailable(data.available);
      setAvailabilityReason(data.availabilityReason || null);
      setSettings(data.settings);
      setCategories(data.categories);
      setTotalParameters(data.totalParameters || 0);
    } catch (error: any) {
      console.error("Error fetching Creative QC settings:", error);
      setAvailable(false);
      setAvailabilityReason(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (enabled: boolean) => {
    if (!settings) return;

    // If trying to enable and beta not accepted, show dialog
    if (enabled && !settings.betaAccepted) {
      setShowBetaDialog(true);
      return;
    }

    await updateSettings({ enabled });
  };

  const handleAcceptBeta = async () => {
    setShowBetaDialog(false);
    await updateSettings({ enabled: true, betaAccepted: true });
  };

  const updateSettings = async (updates: Partial<CreativeQCSettings>) => {
    try {
      setUpdating(true);
      const response = await fetch("/api/qc/creative/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to update settings");
      }

      setSettings(data.settings);
      onSettingsChange?.(data.settings);

      toast({
        title: data.message || "Settings updated",
        description: updates.enabled
          ? "Creative QC will now run on new QC jobs"
          : "Creative QC has been disabled",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUpdating(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <Card className={cn("border-zinc-800 bg-zinc-900/50", className)}>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
            <span className="text-sm text-zinc-400">Loading Creative QC settings...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Not available (not enterprise or beta not enabled)
  if (!available) {
    return (
      <Card className={cn("border-zinc-800 bg-zinc-900/50 opacity-60", className)}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-zinc-800 flex items-center justify-center">
                <Lock className="h-5 w-5 text-zinc-500" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-zinc-300">Creative QC (SPI)</span>
                  <Badge variant="outline" className="text-[10px] border-zinc-700 text-zinc-500">
                    Enterprise
                  </Badge>
                </div>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {availabilityReason || "Upgrade to Enterprise to access Creative QC"}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className={cn("border-zinc-800 bg-zinc-900/50", className)}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn(
                "h-10 w-10 rounded-lg flex items-center justify-center transition-colors",
                settings?.enabled 
                  ? "bg-gradient-to-br from-purple-600 to-indigo-600"
                  : "bg-zinc-800"
              )}>
                <Sparkles className={cn(
                  "h-5 w-5",
                  settings?.enabled ? "text-white" : "text-zinc-400"
                )} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-white">Creative QC (SPI)</span>
                  <Badge 
                    variant="outline" 
                    className="text-[10px] border-amber-500/30 text-amber-400 bg-amber-500/10"
                  >
                    Beta
                  </Badge>
                </div>
                <p className="text-xs text-zinc-400 mt-0.5">
                  AI-powered creative quality analysis
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowInfoDialog(true)}
                className="h-8 w-8 p-0 text-zinc-400 hover:text-white"
              >
                <Info className="h-4 w-4" />
              </Button>
              <Switch
                checked={settings?.enabled || false}
                onCheckedChange={handleToggle}
                disabled={updating}
              />
            </div>
          </div>

          {settings?.enabled && (
            <div className="mt-4 pt-4 border-t border-zinc-800">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="flex items-center justify-center gap-1 text-purple-400">
                    <Brain className="h-4 w-4" />
                    <span className="text-lg font-semibold">{totalParameters}</span>
                  </div>
                  <p className="text-[10px] text-zinc-500 mt-0.5">Parameters</p>
                </div>
                <div>
                  <div className="flex items-center justify-center gap-1 text-blue-400">
                    <Sparkles className="h-4 w-4" />
                    <span className="text-lg font-semibold">{Object.keys(categories || {}).length - 1}</span>
                  </div>
                  <p className="text-[10px] text-zinc-500 mt-0.5">Categories</p>
                </div>
                <div>
                  <div className="flex items-center justify-center gap-1 text-green-400">
                    <Shield className="h-4 w-4" />
                    <span className="text-lg font-semibold">4</span>
                  </div>
                  <p className="text-[10px] text-zinc-500 mt-0.5">Risk Checks</p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Beta Acceptance Dialog */}
      <Dialog open={showBetaDialog} onOpenChange={setShowBetaDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-700">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Sparkles className="h-5 w-5 text-purple-400" />
              Enable Creative QC (SPI) Beta
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              Creative QC uses AI to analyze the emotional, narrative, and creative quality of your content.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
              <Brain className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-purple-300">What Creative QC Analyzes</p>
                <ul className="text-xs text-zinc-400 mt-1 space-y-1">
                  <li>• Story structure and narrative arc</li>
                  <li>• Emotional impact and engagement</li>
                  <li>• Brand voice and message clarity</li>
                  <li>• Risk and safety assessment</li>
                  <li>• Perceived craft quality</li>
                </ul>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle className="h-5 w-5 text-amber-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-300">Beta Notice</p>
                <p className="text-xs text-zinc-400 mt-1">
                  This feature is in beta. Results are AI-generated and should be reviewed by humans. 
                  Creative QC does not affect your technical QC results.
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBetaDialog(false)} className="border-zinc-700">
              Cancel
            </Button>
            <Button 
              onClick={handleAcceptBeta}
              disabled={updating}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {updating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              Enable Creative QC
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Info Dialog */}
      <Dialog open={showInfoDialog} onOpenChange={setShowInfoDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-700 max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Sparkles className="h-5 w-5 text-purple-400" />
              About Creative QC (SPI)
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <p className="text-zinc-400 text-sm">
              Semantic Provenance Intelligence (SPI) analyzes your content beyond technical quality, 
              examining the creative and emotional aspects that determine viewer engagement and brand alignment.
            </p>

            {categories && (
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(categories).filter(([key]) => key !== 'summary').map(([key, cat]: [string, any]) => (
                  <div 
                    key={key}
                    className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/50"
                  >
                    <p className="text-sm font-medium text-zinc-200">{cat.label}</p>
                    <p className="text-xs text-zinc-500 mt-1">{cat.description}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
              <p className="text-sm font-medium text-zinc-200">How It Works</p>
              <ol className="text-xs text-zinc-400 mt-2 space-y-1">
                <li>1. Enable Creative QC using the toggle above</li>
                <li>2. New QC jobs will automatically include Creative QC analysis</li>
                <li>3. View Creative QC results in the QC results table</li>
                <li>4. Click on any result to see detailed parameter scores</li>
              </ol>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInfoDialog(false)} className="border-zinc-700">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

