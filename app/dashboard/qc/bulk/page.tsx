"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback, useMemo } from "react";
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
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Download,
  ExternalLink,
  CheckCircle2,
  XCircle,
  RefreshCw,
  FileSpreadsheet,
  Pause,
  Trash2,
  MoreVertical,
  Eye,
  Search,
  Filter,
  Loader2,
  FileVideo,
  Clock,
  AlertTriangle,
  ChevronDown,
  FolderOpen,
  Copy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { CreativeQCToggle } from "@/components/qc/creative-qc-toggle";

interface QCJobResult {
  id: string;
  file_name: string;
  original_file_name: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled" | "uploading" | "processing" | "qc_passed" | "qc_failed" | "rejected";
  storage_path: string;
  drive_link?: string;
  drive_file_id?: string;
  qc_report: any;
  qc_errors: any[];
  created_at: string;
  updated_at?: string;
  progress?: number;
  score?: number;
  project_id?: string;
  project?: {
    id: string;
    code: string;
    name: string;
  };
}

interface ProjectGroup {
  id: string;
  code: string;
  name: string;
  results: QCJobResult[];
  stats: {
    total: number;
    passed: number;
    failed: number;
    processing: number;
  };
}

export default function BulkQCPage() {
  const { toast } = useToast();
  const [results, setResults] = useState<QCJobResult[]>([]);
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
  const [exporting, setExporting] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedFile, setSelectedFile] = useState<QCJobResult | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [cancellingIds, setCancellingIds] = useState<Set<string>>(new Set());

  // Fetch QC results with real-time updates
  const fetchResults = useCallback(async () => {
    try {
      setRefreshing(true);
      
      // Use API route instead of direct Supabase calls
      const response = await fetch("/api/data/deliveries");
      if (!response.ok) {
        throw new Error("Failed to fetch deliveries");
      }

      const data = await response.json();
      const resultArray = data.results || [];
      setQcCount(resultArray.length);
      setResults(resultArray);
    } catch (error) {
      console.error("Error fetching QC results:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Fast progress polling for active jobs
  const fetchProgress = useCallback(async () => {
    const activeJobs = results.filter(r => 
      r.status === "processing" || r.status === "uploading"
    );
    if (activeJobs.length === 0) return;

    try {
      const res = await fetch("/api/qc/progress");
      if (!res.ok) return;
      const data = await res.json();
      
      if (data.progress && data.progress.length > 0) {
        setResults(prev => prev.map(result => {
          const update = data.progress.find((p: any) => p.id === result.id);
          if (update) {
            return { ...result, progress: update.progress, status: update.status };
          }
          return result;
        }));
      }
    } catch (e) {
      // Ignore progress fetch errors
    }
  }, [results]);

  // Initial fetch and polling
  useEffect(() => {
    fetchResults();
    // Full refresh every 5 seconds
    const interval = setInterval(fetchResults, 5000);
    return () => clearInterval(interval);
  }, [fetchResults]);

  // Fast progress polling when jobs are active (every 1 second)
  useEffect(() => {
    const hasActiveJobs = results.some(r => 
      r.status === "processing" || r.status === "uploading"
    );
    
    if (hasActiveJobs) {
      const progressInterval = setInterval(fetchProgress, 1000);
      return () => clearInterval(progressInterval);
    }
  }, [results, fetchProgress]);

  // Fetch subscription/usage info
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
          if (qcLevelValue === "none" && process.env.NODE_ENV !== "development") {
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

  // Group results by project
  const projectGroups = useMemo((): ProjectGroup[] => {
    const groups = new Map<string, ProjectGroup>();
    
    results.forEach((result) => {
      const projectId = result.project?.id || "unassigned";
      const existing = groups.get(projectId) || {
        id: projectId,
        code: result.project?.code || "Unassigned",
        name: result.project?.name || "Unassigned Files",
        results: [],
        stats: { total: 0, passed: 0, failed: 0, processing: 0 },
      };
      
      existing.results.push(result);
      existing.stats.total++;
      
      if (result.status === "qc_passed" || result.status === "completed") {
        existing.stats.passed++;
      } else if (result.status === "qc_failed" || result.status === "failed") {
        existing.stats.failed++;
      } else if (["queued", "running", "processing", "uploading"].includes(result.status)) {
        existing.stats.processing++;
      }
      
      groups.set(projectId, existing);
    });
    
    return Array.from(groups.values());
  }, [results]);

  // Filtered results based on search and status
  const filteredResults = useMemo(() => {
    return results.filter((result) => {
      const matchesSearch = !searchQuery || 
        (result.original_file_name || result.file_name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (result.project?.code || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (result.project?.name || "").toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesStatus = statusFilter === "all" ||
        (statusFilter === "passed" && (result.status === "qc_passed" || result.status === "completed")) ||
        (statusFilter === "failed" && (result.status === "qc_failed" || result.status === "failed")) ||
        (statusFilter === "processing" && ["queued", "running", "processing", "uploading"].includes(result.status));
      
      return matchesSearch && matchesStatus;
    });
  }, [results, searchQuery, statusFilter]);

  // Action handlers
  const handleDownload = async (result: QCJobResult) => {
    try {
      if (result.drive_link || result.drive_file_id) {
        const fileId = result.drive_file_id || extractDriveFileId(result.drive_link || "");
        if (fileId) {
          window.open(`https://drive.google.com/uc?export=download&id=${fileId}`, "_blank");
          toast({ title: "Download started", description: "Opening Google Drive download..." });
        }
      }
    } catch (error: any) {
      console.error("Error downloading file:", error);
      toast({ title: "Download failed", description: error.message, variant: "destructive" });
    }
  };

  const handleOpenInDrive = (result: QCJobResult) => {
    if (result.drive_link) {
      window.open(result.drive_link, "_blank");
    } else if (result.drive_file_id) {
      window.open(`https://drive.google.com/file/d/${result.drive_file_id}/view`, "_blank");
    } else {
      toast({ title: "Not available", description: "This file is not from Google Drive.", variant: "destructive" });
    }
  };

  const handlePause = async (result: QCJobResult) => {
    try {
      setCancellingIds((prev) => new Set(prev).add(result.id));
      const response = await fetch("/api/qc/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobIds: [result.id], action: "pause" }),
      });

      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        toast({ title: "Job paused", description: `${result.original_file_name || result.file_name} has been paused.` });
        fetchResults();
      } else {
        throw new Error(data.error || "Failed to pause job");
      }
    } catch (error: any) {
      toast({ title: "Pause failed", description: error.message, variant: "destructive" });
    } finally {
      setCancellingIds((prev) => {
        const next = new Set(prev);
        next.delete(result.id);
        return next;
      });
    }
  };

  const handleDelete = async (result: QCJobResult) => {
    if (!confirm(`Are you sure you want to delete "${result.original_file_name || result.file_name}"?`)) {
      return;
    }

    try {
      setCancellingIds((prev) => new Set(prev).add(result.id));
      
      if (["queued", "running", "processing"].includes(result.status)) {
        await fetch("/api/qc/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobIds: [result.id] }),
        });
      }

      // Use qc-jobs API to delete (handles both qc_job and delivery deletion)
      const response = await fetch(`/api/data/qc-jobs?id=${result.id}`, { method: "DELETE" });
      
      if (!response.ok) {
        // Fallback to deliveries API if qc-jobs fails (might be a delivery-only record)
        await fetch(`/api/data/deliveries?id=${result.id}`, { method: "DELETE" });
      }

      toast({ title: "File deleted", description: `${result.original_file_name || result.file_name} has been removed.` });
      fetchResults();
    } catch (error: any) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    } finally {
      setCancellingIds((prev) => {
        const next = new Set(prev);
        next.delete(result.id);
        return next;
      });
    }
  };

  const handleExportToSheets = async (projectId?: string, projectName?: string) => {
    const targetProjectId = projectId || projectGroups[0]?.id;
    const targetProjectName = projectName || projectGroups[0]?.name;
    
    if (!targetProjectId || targetProjectId === "unassigned") {
      toast({ title: "Export failed", description: "Please select a project to export.", variant: "destructive" });
      return;
    }

    setExporting(targetProjectId);
    try {
      const response = await fetch("/api/qc/export-to-sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: targetProjectId,
          projectName: targetProjectName,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to export to Google Sheets");
      }

      if (data.sheetUrl) {
        window.open(data.sheetUrl, "_blank");
      }
      
      toast({
        title: "Export successful",
        description: data.isNewSheet 
          ? `Created new QC sheet with ${data.rowCount} result(s)!`
          : `Updated QC sheet with ${data.rowCount} result(s)!`,
        variant: "success",
      });
    } catch (error: any) {
      toast({ title: "Export failed", description: error.message, variant: "destructive" });
    } finally {
      setExporting(null);
    }
  };

  const handleViewDetails = (result: QCJobResult) => {
    setSelectedFile(result);
    setDetailModalOpen(true);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: "Copied to clipboard" });
  };

  // Helper functions
  const extractDriveFileId = (url: string): string | null => {
    const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || 
                  url.match(/id=([a-zA-Z0-9_-]+)/) ||
                  url.match(/([a-zA-Z0-9_-]{25,})/);
    return match ? match[1] : null;
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

  const getStatusInfo = (status: string) => {
    switch (status) {
      case "qc_passed":
      case "completed":
        return { label: "Passed", color: "text-green-400", bgColor: "bg-green-500/10", icon: CheckCircle2 };
      case "qc_failed":
      case "failed":
        return { label: "Failed", color: "text-red-400", bgColor: "bg-red-500/10", icon: XCircle };
      case "queued":
        return { label: "Queued", color: "text-zinc-400", bgColor: "bg-zinc-500/10", icon: Clock };
      case "running":
      case "processing":
        return { label: "Processing", color: "text-blue-400", bgColor: "bg-blue-500/10", icon: Loader2 };
      case "uploading":
        return { label: "Uploading", color: "text-purple-400", bgColor: "bg-purple-500/10", icon: Loader2 };
      case "cancelled":
        return { label: "Cancelled", color: "text-orange-400", bgColor: "bg-orange-500/10", icon: Pause };
      default:
        return { label: status, color: "text-zinc-400", bgColor: "bg-zinc-500/10", icon: Clock };
    }
  };

  const getErrorCount = (result: QCJobResult) => {
    if (result.qc_errors && Array.isArray(result.qc_errors)) {
      return result.qc_errors.length;
    }
    if (result.qc_report?.errors && Array.isArray(result.qc_report.errors)) {
      return result.qc_report.errors.length;
    }
    return 0;
  };

  const isProcessing = (status: string) => ["queued", "running", "processing", "uploading"].includes(status);

  // Subscription checks
  const DEV_BYPASS_SUBSCRIPTION = process.env.NODE_ENV === "development";
  const isFree = DEV_BYPASS_SUBSCRIPTION ? false : (subscriptionTier === "free" || qcLevel === "none");
  const isMid = subscriptionTier === "mid";
  const isEnterprise = subscriptionTier === "enterprise" || DEV_BYPASS_SUBSCRIPTION;
  const midLimitReached = DEV_BYPASS_SUBSCRIPTION ? false : (isMid && seriesLimit !== null && seriesRemaining !== null && seriesRemaining <= 0);

  // Stats
  const totalProcessing = results.filter((r) => isProcessing(r.status)).length;
  const totalPassed = results.filter((r) => r.status === "qc_passed" || r.status === "completed").length;
  const totalFailed = results.filter((r) => r.status === "qc_failed" || r.status === "failed").length;

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-4xl font-light tracking-tight text-white">
              Bulk QC Analysis
            </h1>
            <p className="text-zinc-400 text-lg font-light">
              Upload multiple video and subtitle files for automated quality control
            </p>
          </div>
          
          {/* Real-time Stats */}
          <div className="flex items-center gap-4">
            {totalProcessing > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />
                <span className="text-sm text-blue-400">{totalProcessing} processing</span>
              </div>
            )}
            <div className="flex items-center gap-3 text-sm">
              <span className="text-green-400">{totalPassed} passed</span>
              <span className="text-zinc-600">•</span>
              <span className="text-red-400">{totalFailed} failed</span>
              <span className="text-zinc-600">•</span>
              <span className="text-zinc-400">{results.length} total</span>
            </div>
          </div>
        </div>

        {/* Plan Status */}
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

        {/* Creative QC Toggle - Enterprise Only */}
        <CreativeQCToggle />

        {/* Upload Section */}
        <div className="space-y-6">
          {isFree ? (
            <Card className="border-zinc-800/50 bg-zinc-900/20 backdrop-blur-xl">
              <CardContent className="p-12 text-center">
                <div className="max-w-md mx-auto space-y-4">
                  <p className="text-zinc-300 text-lg">Bulk QC is available on paid plans</p>
                  <p className="text-zinc-500 text-sm">Upgrade to Mid or Enterprise to enable automated quality control</p>
                  <Button onClick={() => (window.location.href = "/dashboard/settings")} className="mt-4">
                    View Plans
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : midLimitReached || limitReached ? (
            <Card className="border-yellow-500/30 bg-yellow-500/5 backdrop-blur-xl">
              <CardContent className="p-12 text-center">
                <div className="max-w-md mx-auto space-y-4">
                  <p className="text-yellow-400 text-lg">Series limit reached</p>
                  <p className="text-zinc-400 text-sm">Upgrade to Enterprise for unlimited QC or wait for the next billing cycle</p>
                  <Button variant="outline" onClick={() => (window.location.href = "/dashboard/settings")} className="mt-4">
                    Manage Subscription
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : upgradeRequired ? (
            <Card className="border-zinc-800/50 bg-zinc-900/20 backdrop-blur-xl">
              <CardContent className="p-12 text-center">
                <div className="max-w-md mx-auto space-y-4">
                  <p className="text-zinc-300 text-lg">QC not available on your plan</p>
                  <p className="text-zinc-500 text-sm">Upgrade to enable automated QC</p>
                  <Button onClick={() => (window.location.href = "/dashboard/settings")} className="mt-4">
                    Upgrade Plan
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <BulkQCUpload onUploadComplete={fetchResults} />
          )}
        </div>

        {/* Results Section */}
        {results.length > 0 && (
          <div className="space-y-4">
            {/* Header with Search and Filters */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <h2 className="text-xl font-light text-white">Recent Results</h2>
              
              <div className="flex items-center gap-3">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                  <Input
                    placeholder="Search files..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 w-64 bg-zinc-900/50 border-zinc-800/50"
                  />
                </div>
                
                {/* Status Filter */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="border-zinc-700">
                      <Filter className="h-4 w-4 mr-2" />
                      {statusFilter === "all" ? "All Status" : statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)}
                      <ChevronDown className="h-4 w-4 ml-2" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="bg-zinc-900 border-zinc-700">
                    <DropdownMenuItem onClick={() => setStatusFilter("all")}>All Status</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setStatusFilter("passed")}>Passed</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setStatusFilter("failed")}>Failed</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setStatusFilter("processing")}>Processing</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Export All */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="border-zinc-700">
                      <FileSpreadsheet className="h-4 w-4 mr-2" />
                      Export
                      <ChevronDown className="h-4 w-4 ml-2" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="bg-zinc-900 border-zinc-700">
                    {projectGroups.filter(g => g.id !== "unassigned").map((group) => (
                      <DropdownMenuItem
                        key={group.id}
                        onClick={() => handleExportToSheets(group.id, group.name)}
                        disabled={exporting === group.id}
                      >
                        {exporting === group.id ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <FolderOpen className="h-4 w-4 mr-2" />
                        )}
                        {group.code} ({group.stats.total} files)
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                
                {/* Refresh */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={fetchResults}
                  disabled={refreshing}
                  className="text-zinc-400 hover:text-white"
                >
                  <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
                </Button>
              </div>
            </div>

            {/* Results Table */}
            <Card className="border-zinc-800/50 bg-zinc-900/20 backdrop-blur-xl overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-zinc-800/50 hover:bg-transparent">
                      <TableHead className="text-zinc-500 font-normal text-xs uppercase tracking-wider w-[40%]">
                        File
                      </TableHead>
                      <TableHead className="text-zinc-500 font-normal text-xs uppercase tracking-wider">
                        Project
                      </TableHead>
                      <TableHead className="text-zinc-500 font-normal text-xs uppercase tracking-wider">
                        Status
                      </TableHead>
                      <TableHead className="text-zinc-500 font-normal text-xs uppercase tracking-wider">
                        Score
                      </TableHead>
                      <TableHead className="text-zinc-500 font-normal text-xs uppercase tracking-wider text-right">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredResults.map((result) => {
                      const statusInfo = getStatusInfo(result.status);
                      const errorCount = getErrorCount(result);
                      const StatusIcon = statusInfo.icon;
                      const processing = isProcessing(result.status);
                      const hasDriveLink = !!(result.drive_link || result.drive_file_id);
                      const isCancelling = cancellingIds.has(result.id);

                      return (
                        <TableRow
                          key={result.id}
                          className="border-zinc-800/30 hover:bg-zinc-800/20 transition-colors group"
                        >
                          <TableCell className="py-4">
                            <div className="flex items-center gap-3">
                              <div className="flex-shrink-0">
                                <FileVideo className="h-8 w-8 text-zinc-600" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <button
                                  onClick={() => handleViewDetails(result)}
                                  className="text-sm font-medium text-white hover:text-purple-400 transition-colors text-left truncate block max-w-full"
                                >
                                  {result.original_file_name || result.file_name || "Unknown file"}
                                </button>
                                <div className="flex items-center gap-2 mt-1">
                                  <p className="text-xs text-zinc-500">
                                    {formatDate(result.created_at)}
                                  </p>
                                  {hasDriveLink && (
                                    <Badge variant="outline" className="text-[10px] border-blue-500/30 text-blue-400 px-1 py-0">
                                      Drive
                                    </Badge>
                                  )}
                                </div>
                                {processing && (
                                  <div className="mt-2 space-y-1">
                                    <div className="flex items-center justify-between">
                                      <span className="text-[10px] text-zinc-500">
                                        {result.status === "queued" ? "Waiting..." : "Processing..."}
                                      </span>
                                      <span className="text-[10px] text-zinc-400 font-mono">
                                        {result.progress || 0}%
                                      </span>
                                    </div>
                                    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                                      <div 
                                        className={cn(
                                          "h-full transition-all duration-500 ease-out rounded-full",
                                          result.status === "queued" ? "bg-zinc-600" :
                                          "bg-gradient-to-r from-blue-500 to-cyan-500"
                                        )}
                                        style={{ width: `${result.progress || 0}%` }}
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="py-4">
                            {result.project ? (
                              <button
                                onClick={() => handleExportToSheets(result.project?.id, result.project?.name)}
                                className="text-left hover:opacity-80 transition-opacity"
                              >
                                <span className="text-sm font-mono text-zinc-300 hover:text-purple-400">
                                  {result.project.code}
                                </span>
                                <p className="text-xs text-zinc-500 truncate max-w-[120px]">
                                  {result.project.name}
                                </p>
                              </button>
                            ) : (
                              <span className="text-sm text-zinc-500">—</span>
                            )}
                          </TableCell>
                          <TableCell className="py-4">
                            <div className="flex items-center gap-2">
                              <StatusIcon className={cn(
                                "h-4 w-4",
                                statusInfo.color,
                                processing && "animate-spin"
                              )} />
                              <span className={cn("text-xs font-medium", statusInfo.color)}>
                                {statusInfo.label}
                              </span>
                            </div>
                            {errorCount > 0 && (
                              <Badge
                                variant="outline"
                                className="mt-1 border-red-500/30 text-red-400 bg-red-500/10 text-[10px]"
                              >
                                {errorCount} error{errorCount > 1 ? "s" : ""}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="py-4">
                            {result.score !== undefined ? (
                              <div className="flex items-center gap-2">
                                <span className={cn(
                                  "text-sm font-medium",
                                  result.score >= 80 ? "text-green-400" :
                                  result.score >= 60 ? "text-yellow-400" : "text-red-400"
                                )}>
                                  {result.score}/100
                                </span>
                              </div>
                            ) : processing ? (
                              <span className="text-xs text-zinc-500">Analyzing...</span>
                            ) : (
                              <span className="text-xs text-zinc-500">—</span>
                            )}
                          </TableCell>
                          <TableCell className="py-4 text-right">
                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {processing && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handlePause(result)}
                                  disabled={isCancelling}
                                  className="h-8 w-8 p-0 text-zinc-400 hover:text-orange-400"
                                  title="Pause processing"
                                >
                                  {isCancelling ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Pause className="h-4 w-4" />
                                  )}
                                </Button>
                              )}
                              {hasDriveLink && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleOpenInDrive(result)}
                                  className="h-8 w-8 p-0 text-zinc-400 hover:text-blue-400"
                                  title="Open in Google Drive"
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDownload(result)}
                                className="h-8 w-8 p-0 text-zinc-400 hover:text-white"
                                title="Download file"
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 text-zinc-400 hover:text-white"
                                  >
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48 bg-zinc-900 border-zinc-700">
                                  <DropdownMenuItem onClick={() => handleViewDetails(result)}>
                                    <Eye className="h-4 w-4 mr-2" />
                                    View Details
                                  </DropdownMenuItem>
                                  {hasDriveLink && (
                                    <DropdownMenuItem onClick={() => handleOpenInDrive(result)}>
                                      <ExternalLink className="h-4 w-4 mr-2" />
                                      Open in Drive
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem onClick={() => handleDownload(result)}>
                                    <Download className="h-4 w-4 mr-2" />
                                    Download
                                  </DropdownMenuItem>
                                  {result.project && (
                                    <DropdownMenuItem onClick={() => handleExportToSheets(result.project?.id, result.project?.name)}>
                                      <FileSpreadsheet className="h-4 w-4 mr-2" />
                                      Export Project to Sheets
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuSeparator className="bg-zinc-700" />
                                  {processing && (
                                    <DropdownMenuItem 
                                      onClick={() => handlePause(result)}
                                      className="text-orange-400"
                                    >
                                      <Pause className="h-4 w-4 mr-2" />
                                      Pause Processing
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem
                                    onClick={() => handleDelete(result)}
                                    className="text-red-400"
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              
              {filteredResults.length === 0 && results.length > 0 && (
                <div className="p-12 text-center">
                  <p className="text-zinc-400">No results match your search or filter.</p>
                  <Button
                    variant="ghost"
                    onClick={() => { setSearchQuery(""); setStatusFilter("all"); }}
                    className="mt-2"
                  >
                    Clear filters
                  </Button>
                </div>
              )}
            </Card>
          </div>
        )}

        {/* Loading State */}
        {loading && results.length === 0 && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        )}

        {/* Empty State */}
        {!loading && results.length === 0 && !isFree && !upgradeRequired && (
          <Card className="border-zinc-800/50 bg-zinc-900/20 backdrop-blur-xl">
            <CardContent className="p-12 text-center">
              <FileVideo className="h-12 w-12 text-zinc-600 mx-auto mb-4" />
              <p className="text-zinc-400">No QC results yet. Upload files to get started.</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* File Detail Modal */}
      <Dialog open={detailModalOpen} onOpenChange={setDetailModalOpen}>
        <DialogContent className="max-w-2xl bg-zinc-900 border-zinc-700">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-3">
              <FileVideo className="h-5 w-5 text-zinc-400" />
              {selectedFile?.original_file_name || selectedFile?.file_name || "File Details"}
            </DialogTitle>
          </DialogHeader>
          
          {selectedFile && (
            <div className="space-y-6 mt-4">
              {/* Status and Score */}
              <div className="flex items-center justify-between p-4 rounded-lg bg-zinc-800/50">
                <div className="flex items-center gap-3">
                  {(() => {
                    const statusInfo = getStatusInfo(selectedFile.status);
                    const StatusIcon = statusInfo.icon;
                    return (
                      <>
                        <StatusIcon className={cn("h-6 w-6", statusInfo.color, isProcessing(selectedFile.status) && "animate-spin")} />
                        <div>
                          <p className={cn("font-medium", statusInfo.color)}>{statusInfo.label}</p>
                          <p className="text-xs text-zinc-500">Status</p>
                        </div>
                      </>
                    );
                  })()}
                </div>
                {selectedFile.score !== undefined && (
                  <div className="text-right">
                    <p className={cn(
                      "text-2xl font-bold",
                      selectedFile.score >= 80 ? "text-green-400" :
                      selectedFile.score >= 60 ? "text-yellow-400" : "text-red-400"
                    )}>
                      {selectedFile.score}/100
                    </p>
                    <p className="text-xs text-zinc-500">QC Score</p>
                  </div>
                )}
              </div>

              {/* Progress */}
              {isProcessing(selectedFile.status) && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-zinc-400">Processing Progress</span>
                    <span className="text-zinc-300 font-mono">{selectedFile.progress || 0}%</span>
                  </div>
                  <Progress value={selectedFile.progress || 0} className="h-2" />
                </div>
              )}

              {/* File Info */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-zinc-500">Created</p>
                  <p className="text-zinc-300">{formatDate(selectedFile.created_at)}</p>
                </div>
                {selectedFile.project && (
                  <div>
                    <p className="text-zinc-500">Project</p>
                    <p className="text-zinc-300">{selectedFile.project.code} - {selectedFile.project.name}</p>
                  </div>
                )}
                {selectedFile.drive_link && (
                  <div className="col-span-2">
                    <p className="text-zinc-500">Google Drive Link</p>
                    <div className="flex items-center gap-2 mt-1">
                      <a 
                        href={selectedFile.drive_link} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:underline truncate"
                      >
                        {selectedFile.drive_link}
                      </a>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(selectedFile.drive_link || "")}
                        className="h-6 w-6 p-0"
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Errors */}
              {getErrorCount(selectedFile) > 0 && (
                <div className="space-y-2">
                  <p className="text-sm text-zinc-500">QC Errors ({getErrorCount(selectedFile)})</p>
                  <div className="max-h-40 overflow-y-auto space-y-2">
                    {(selectedFile.qc_errors || selectedFile.qc_report?.errors || []).map((error: any, idx: number) => (
                      <div key={idx} className="flex items-start gap-2 p-2 rounded bg-red-500/10 text-sm">
                        <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
                        <span className="text-red-300">{typeof error === "string" ? error : error.message || JSON.stringify(error)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center gap-3 pt-4 border-t border-zinc-800">
                {(selectedFile.drive_link || selectedFile.drive_file_id) && (
                  <Button onClick={() => handleOpenInDrive(selectedFile)} variant="outline" className="border-zinc-700">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Open in Drive
                  </Button>
                )}
                <Button onClick={() => handleDownload(selectedFile)} variant="outline" className="border-zinc-700">
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
                {selectedFile.project && (
                  <Button 
                    onClick={() => {
                      handleExportToSheets(selectedFile.project?.id, selectedFile.project?.name);
                      setDetailModalOpen(false);
                    }}
                    variant="outline" 
                    className="border-zinc-700"
                  >
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Export to Sheets
                  </Button>
                )}
                {isProcessing(selectedFile.status) && (
                  <Button onClick={() => handlePause(selectedFile)} variant="outline" className="border-orange-500/30 text-orange-400">
                    <Pause className="h-4 w-4 mr-2" />
                    Pause
                  </Button>
                )}
                <Button 
                  onClick={() => {
                    handleDelete(selectedFile);
                    setDetailModalOpen(false);
                  }}
                  variant="outline" 
                  className="border-red-500/30 text-red-400 ml-auto"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
