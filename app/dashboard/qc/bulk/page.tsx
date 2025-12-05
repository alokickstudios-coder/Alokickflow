"use client";

import { useState, useEffect } from "react";
import { BulkQCUpload } from "@/components/qc/bulk-upload";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, ExternalLink, CheckCircle2, XCircle, RefreshCw, FileSpreadsheet } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface BulkQCResult {
  id: string;
  file_name: string;
  original_file_name: string;
  status: "uploading" | "processing" | "qc_passed" | "qc_failed" | "rejected";
  storage_path: string;
  qc_report: any;
  qc_errors: any[];
  created_at: string;
  project?: {
    code: string;
    name: string;
  };
}

export default function BulkQCPage() {
  const [results, setResults] = useState<BulkQCResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [subscriptionTier, setSubscriptionTier] = useState<"free" | "mid" | "enterprise" | null>(null);
  const [qcCount, setQcCount] = useState(0);
  const [usageLoading, setUsageLoading] = useState(true);
  const [seriesLimit, setSeriesLimit] = useState<number | null>(null);
  const [seriesRemaining, setSeriesRemaining] = useState<number | null>(null);
  const [upgradeRequired, setUpgradeRequired] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const [qcLevel, setQcLevel] = useState<string>("none");
  const [exporting, setExporting] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);

  const fetchResults = async () => {
    try {
      setRefreshing(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", user.id)
        .single();

      if (!profile?.organization_id) return;

      const { data: deliveries, error } = await supabase
        .from("deliveries")
        .select("*")
        .eq("organization_id", profile.organization_id)
        .in("status", ["qc_passed", "qc_failed", "processing"])
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;

      setQcCount(deliveries?.length || 0);

      const projectIds = [...new Set(deliveries?.map((d) => d.project_id) || [])];
      const { data: projects } = await supabase
        .from("projects")
        .select("id, code, name")
        .in("id", projectIds);

      const enrichedResults = (deliveries || []).map((delivery) => ({
        ...delivery,
        project: projects?.find((p) => p.id === delivery.project_id),
      }));

      setResults(enrichedResults);
      
      // Set current project ID if all results belong to same project
      if (enrichedResults.length > 0) {
        const projectIds = [...new Set(enrichedResults.map((r) => r.project_id).filter(Boolean))];
        if (projectIds.length === 1) {
          setCurrentProjectId(projectIds[0]);
        } else if (projectIds.length > 1) {
          // Multiple projects - clear current project ID
          setCurrentProjectId(null);
        }
      }
    } catch (error) {
      console.error("Error fetching QC results:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchResults();
    const interval = setInterval(fetchResults, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const fetchUsage = async () => {
      try {
        setUsageLoading(true);
        const [subRes, usageRes] = await Promise.all([
          fetch("/api/billing/subscription"),
          fetch("/api/billing/usage"),
        ]);

        if (subRes.ok) {
          const data = await subRes.json();
          const planSlug = data?.subscription?.plan?.slug || null;
          const qcLevelValue = data?.limits?.qcLevel || "none";
          setQcLevel(qcLevelValue);
          setSubscriptionTier(planSlug as "free" | "mid" | "enterprise" | null);
          if (qcLevelValue === "none") {
            setUpgradeRequired(true);
          }
        }

        if (usageRes.ok) {
          const usageData = await usageRes.json();
          const limit = usageData?.limits?.includedSeriesPerBillingCycle ?? null;
          const remaining = usageData?.limits?.remainingSeries ?? null;
          setSeriesLimit(limit);
          setSeriesRemaining(remaining);
          if (limit !== null && remaining !== null && remaining <= 0) {
            setLimitReached(true);
          }
        }
      } catch (err) {
        console.error("Error loading usage/subscription", err);
      } finally {
        setUsageLoading(false);
      }
    };
    fetchUsage();
  }, []);

  const handleDownload = async (result: BulkQCResult) => {
    try {
      const { data, error } = await supabase.storage
        .from("deliveries")
        .createSignedUrl(result.storage_path, 3600);

      if (error) throw error;
      if (data?.signedUrl) {
        window.open(data.signedUrl, "_blank");
      }
    } catch (error) {
      console.error("Error downloading file:", error);
      alert("Failed to download file");
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleExportToSheets = async () => {
    if (!currentProjectId && results.length > 0) {
      const projectIds = [...new Set(results.map((r) => r.project?.code).filter(Boolean))];
      if (projectIds.length === 0) {
        alert("No project found. Please ensure QC results are linked to a project.");
        return;
      }
      if (projectIds.length > 1) {
        alert("Multiple projects found. Please filter to a single project first.");
        return;
      }
      setCurrentProjectId(projectIds[0] || null);
    }

    const projectId = currentProjectId || results[0]?.project?.code;
    if (!projectId) {
      alert("No project found for export.");
      return;
    }

    setExporting(true);
    try {
      const project = results[0]?.project;
      const response = await fetch("/api/qc/export-to-sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          projectName: project?.name || project?.code,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to export to Google Sheets");
      }

      // Open the sheet in a new tab
      if (data.sheetUrl) {
        window.open(data.sheetUrl, "_blank");
      }
      
      const message = data.isNewSheet 
        ? `Created new QC sheet and exported ${data.rowCount} result(s)!`
        : `Updated QC sheet with ${data.rowCount} result(s)!`;
      
      alert(message);
    } catch (error: any) {
      alert(`Export failed: ${error.message}`);
    } finally {
      setExporting(false);
    }
  };

  const getErrorCount = (result: BulkQCResult) => {
    if (result.qc_errors && Array.isArray(result.qc_errors)) {
      return result.qc_errors.length;
    }
    if (result.qc_report?.errors && Array.isArray(result.qc_report.errors)) {
      return result.qc_report.errors.length;
    }
    return 0;
  };

  const isFree = subscriptionTier === "free" || qcLevel === "none";
  const isMid = subscriptionTier === "mid";
  const isEnterprise = subscriptionTier === "enterprise";
  const midLimitReached = isMid && seriesLimit !== null && seriesRemaining !== null && seriesRemaining <= 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Header Section - Apple-like minimalism */}
        <div className="space-y-2">
          <h1 className="text-4xl font-light tracking-tight text-white">
            Bulk QC Analysis
          </h1>
          <p className="text-zinc-400 text-lg font-light">
            Upload multiple video and subtitle files for automated quality control
          </p>
        </div>

        {/* Plan Status - Minimal badge */}
        {!usageLoading && subscriptionTier && (
          <div className="flex items-center gap-3">
            <Badge
              variant="outline"
              className={cn(
                "border px-3 py-1 text-xs font-normal",
                subscriptionTier === "enterprise"
                  ? "border-purple-500/30 text-purple-400 bg-purple-500/10"
                  : subscriptionTier === "mid"
                  ? "border-blue-500/30 text-blue-400 bg-blue-500/10"
                  : "border-zinc-700/50 text-zinc-500 bg-zinc-800/30"
              )}
            >
              {subscriptionTier.charAt(0).toUpperCase() + subscriptionTier.slice(1)} Plan
            </Badge>
            {seriesLimit !== null && (
              <span className="text-sm text-zinc-500">
                {seriesLimit - (seriesRemaining ?? 0)}/{seriesLimit} series used
              </span>
            )}
          </div>
        )}

        {/* Upload Section - Clean, spacious design */}
        <div className="space-y-6">
          {isFree ? (
            <Card className="border-zinc-800/50 bg-zinc-900/20 backdrop-blur-xl">
              <CardContent className="p-12 text-center">
                <div className="max-w-md mx-auto space-y-4">
                  <p className="text-zinc-300 text-lg">
                    Bulk QC is available on paid plans
                  </p>
                  <p className="text-zinc-500 text-sm">
                    Upgrade to Mid or Enterprise to enable automated quality control
                  </p>
                  <Button
                    onClick={() => (window.location.href = "/dashboard/settings")}
                    className="mt-4"
                  >
                    View Plans
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : midLimitReached || limitReached ? (
            <Card className="border-yellow-500/30 bg-yellow-500/5 backdrop-blur-xl">
              <CardContent className="p-12 text-center">
                <div className="max-w-md mx-auto space-y-4">
                  <p className="text-yellow-400 text-lg">
                    Series limit reached
                  </p>
                  <p className="text-zinc-400 text-sm">
                    Upgrade to Enterprise for unlimited QC or wait for the next billing cycle
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => (window.location.href = "/dashboard/settings")}
                    className="mt-4"
                  >
                    Manage Subscription
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : upgradeRequired ? (
            <Card className="border-zinc-800/50 bg-zinc-900/20 backdrop-blur-xl">
              <CardContent className="p-12 text-center">
                <div className="max-w-md mx-auto space-y-4">
                  <p className="text-zinc-300 text-lg">
                    QC not available on your plan
                  </p>
                  <p className="text-zinc-500 text-sm">
                    Upgrade to enable automated QC
                  </p>
                  <Button
                    onClick={() => (window.location.href = "/dashboard/settings")}
                    className="mt-4"
                  >
                    Upgrade Plan
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <BulkQCUpload onUploadComplete={fetchResults} />
          )}
        </div>

        {/* Results Section - Clean table */}
        {results.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-light text-white">Recent Results</h2>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportToSheets}
                  disabled={exporting || !currentProjectId}
                  className="text-zinc-400 hover:text-white border-zinc-700"
                >
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  {exporting ? "Exporting..." : "Export to Sheets"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={fetchResults}
                  disabled={refreshing}
                  className="text-zinc-400 hover:text-white"
                >
                  <RefreshCw className={cn("h-4 w-4 mr-2", refreshing && "animate-spin")} />
                  Refresh
                </Button>
              </div>
            </div>

            <Card className="border-zinc-800/50 bg-zinc-900/20 backdrop-blur-xl overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-zinc-800/50 hover:bg-transparent">
                      <TableHead className="text-zinc-500 font-normal text-xs uppercase tracking-wider">
                        File
                      </TableHead>
                      <TableHead className="text-zinc-500 font-normal text-xs uppercase tracking-wider">
                        Project
                      </TableHead>
                      <TableHead className="text-zinc-500 font-normal text-xs uppercase tracking-wider">
                        Status
                      </TableHead>
                      <TableHead className="text-zinc-500 font-normal text-xs uppercase tracking-wider">
                        Errors
                      </TableHead>
                      <TableHead className="text-zinc-500 font-normal text-xs uppercase tracking-wider text-right">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.map((result) => {
                      const errorCount = getErrorCount(result);
                      const isPassed = result.status === "qc_passed";

                      return (
                        <TableRow
                          key={result.id}
                          className="border-zinc-800/30 hover:bg-zinc-800/20 transition-colors"
                        >
                          <TableCell className="py-4">
                            <p className="text-sm font-medium text-white">
                              {result.original_file_name || result.file_name}
                            </p>
                            <p className="text-xs text-zinc-500 mt-1">
                              {formatDate(result.created_at)}
                            </p>
                          </TableCell>
                          <TableCell className="py-4">
                            {result.project ? (
                              <div>
                                <span className="text-sm font-mono text-zinc-300">
                                  {result.project.code}
                                </span>
                                <p className="text-xs text-zinc-500 truncate">
                                  {result.project.name}
                                </p>
                              </div>
                            ) : (
                              <span className="text-sm text-zinc-500">—</span>
                            )}
                          </TableCell>
                          <TableCell className="py-4">
                            <div className="flex items-center gap-2">
                              {isPassed ? (
                                <CheckCircle2 className="h-4 w-4 text-green-400" />
                              ) : (
                                <XCircle className="h-4 w-4 text-red-400" />
                              )}
                              <span
                                className={cn(
                                  "text-xs font-medium",
                                  isPassed ? "text-green-400" : "text-red-400"
                                )}
                              >
                                {result.status === "qc_passed"
                                  ? "Passed"
                                  : result.status === "qc_failed"
                                  ? "Failed"
                                  : "Processing"}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="py-4">
                            {errorCount > 0 ? (
                              <Badge
                                variant="outline"
                                className="border-red-500/30 text-red-400 bg-red-500/10"
                              >
                                {errorCount} error{errorCount > 1 ? "s" : ""}
                              </Badge>
                            ) : (
                              <span className="text-sm text-green-400">No errors</span>
                            )}
                          </TableCell>
                          <TableCell className="py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDownload(result)}
                                className="h-8 w-8 p-0 text-zinc-400 hover:text-white"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDownload(result)}
                                className="h-8 w-8 p-0 text-zinc-400 hover:text-white"
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </div>
        )}

        {loading && results.length === 0 && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        )}

        {!loading && results.length === 0 && !isFree && !upgradeRequired && (
          <Card className="border-zinc-800/50 bg-zinc-900/20 backdrop-blur-xl">
            <CardContent className="p-12 text-center">
              <p className="text-zinc-400">No QC results yet. Upload files to get started.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
