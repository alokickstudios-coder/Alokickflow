"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
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
  RefreshCw,
  FileSpreadsheet,
  ChevronDown,
  ChevronUp,
  Search,
  FileVideo,
  MoreVertical,
  Eye,
  Pause,
  Trash2,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  AlertTriangle,
  Copy,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { CreativeQCToggle } from "@/components/qc/creative-qc-toggle";
import { CreativeQCScoreBadge, CreativeQCStatus } from "@/components/qc/creative-qc-results";

interface QCJob {
  id: string;
  delivery_id?: string;
  file_name: string | null;
  status: string;
  error_message: string | null;
  result_json: any;
  result?: any;
  drive_link?: string;
  drive_file_id?: string;
  created_at: string;
  updated_at: string;
  progress?: number;
  project?: { id: string; code: string; name: string };
  creative_qc_status?: string;
  creative_qc_overall_score?: number;
  creative_qc_overall_risk_score?: number;
  creative_qc_overall_brand_fit_score?: number;
  creative_qc_summary?: string;
  creative_qc_parameters?: Record<string, any>;
  creative_qc_recommendations?: string[];
  creative_qc_error?: string;
}

type SortField = "file_name" | "status" | "created_at" | "score";
type SortDirection = "asc" | "desc";

export default function QCResultsPage() {
  const { toast } = useToast();
  const [jobs, setJobs] = useState<QCJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedJob, setSelectedJob] = useState<QCJob | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [exporting, setExporting] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const [actionLoading, setActionLoading] = useState<Set<string>>(new Set());

  const fetchQCJobs = useCallback(async () => {
    try {
      setRefreshing(true);
      
      // Use API route instead of direct Supabase calls
      const response = await fetch("/api/data/qc-jobs");
      if (!response.ok) {
        throw new Error("Failed to fetch QC jobs");
      }

      const data = await response.json();
      setJobs(data.jobs || []);
    } catch (error: any) {
      console.error("Error fetching QC jobs:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchQCJobs();
    const interval = setInterval(fetchQCJobs, 5000);
    return () => clearInterval(interval);
  }, [fetchQCJobs]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const getStatusInfo = (status: string, result: any) => {
    if (status === "completed") {
      const qcStatus = result?.status;
      if (qcStatus === "passed") return { label: "Passed", className: "bg-green-500/20 text-green-400 border-green-500/50", icon: CheckCircle2, color: "text-green-400" };
      if (qcStatus === "failed") return { label: "Failed", className: "bg-red-500/20 text-red-400 border-red-500/50", icon: XCircle, color: "text-red-400" };
      return { label: "Needs Review", className: "bg-yellow-500/20 text-yellow-400 border-yellow-500/50", icon: AlertTriangle, color: "text-yellow-400" };
    }
    if (status === "failed") return { label: "Error", className: "bg-red-500/20 text-red-400 border-red-500/50", icon: XCircle, color: "text-red-400" };
    if (status === "running" || status === "processing") return { label: "Processing", className: "bg-blue-500/20 text-blue-400 border-blue-500/50", icon: Loader2, color: "text-blue-400" };
    if (status === "queued") return { label: "Queued", className: "bg-zinc-500/20 text-zinc-400 border-zinc-500/50", icon: Clock, color: "text-zinc-400" };
    return { label: status, className: "bg-zinc-500/20 text-zinc-400 border-zinc-500/50", icon: Clock, color: "text-zinc-400" };
  };

  const getScore = (job: QCJob): number | undefined => {
    return job.result_json?.summary?.score || job.result?.summary?.score || job.result_json?.score || job.result?.score;
  };

  const getQCValue = (job: QCJob, field: string): string | number => {
    const result = job.result_json || job.result || {};
    switch (field) {
      case "audioMissing": return result.basicQC?.audioMissing?.detected ? "Yes" : "No";
      case "loudness": {
        const lufs = result.basicQC?.loudness?.lufs;
        return (lufs !== undefined && lufs !== null) ? `${lufs.toFixed(1)} LUFS` : "N/A";
      }
      case "lipSync": {
        if (result.lipSync?.skipped) return "Skipped";
        const score = result.lipSync?.syncScore;
        return (score !== undefined && score !== null) ? `${(score * 100).toFixed(0)}%` : "N/A";
      }
      case "subtitleTiming": return result.basicQC?.subtitleTiming?.status === "failed" ? "Failed" : "OK";
      case "bgm": return result.bgm?.bgmDetected ? "Detected" : "Missing";
      case "glitches": return result.videoGlitch?.glitchCount || 0;
      case "visualQuality": return result.basicQC?.visualQuality?.status === "failed" ? "Failed" : "OK";
      default: return "N/A";
    }
  };

  const isProcessing = (status: string) => ["queued", "running", "processing"].includes(status);

  const filteredAndSorted = jobs
    .filter((job) => {
      if (filterStatus !== "all") {
        const result = job.result_json || job.result || {};
        if (filterStatus === "passed" && result.status !== "passed") return false;
        if (filterStatus === "failed" && result.status !== "failed" && job.status !== "failed") return false;
        if (filterStatus === "needs_review" && result.status !== "needs_review") return false;
        if (filterStatus === "processing" && !isProcessing(job.status)) return false;
      }
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return job.file_name?.toLowerCase().includes(query) || job.project?.name?.toLowerCase().includes(query) || job.project?.code?.toLowerCase().includes(query);
      }
      return true;
    })
    .sort((a, b) => {
      let aVal: any, bVal: any;
      if (sortField === "score") { aVal = getScore(a) || 0; bVal = getScore(b) || 0; }
      else if (sortField === "file_name") { aVal = a.file_name || ""; bVal = b.file_name || ""; }
      else if (sortField === "status") { aVal = a.status; bVal = b.status; }
      else { aVal = new Date(a.created_at).getTime(); bVal = new Date(b.created_at).getTime(); }
      return sortDirection === "asc" ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
    });

  const handleExportToSheets = async (projectId?: string, projectName?: string) => {
    const targetProjectId = projectId || filteredAndSorted[0]?.project?.id;
    if (!targetProjectId) {
      toast({ title: "Export failed", description: "No project found.", variant: "destructive" });
      return;
    }

    setExporting(true);
    try {
      const response = await fetch("/api/qc/export-to-sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: targetProjectId, projectName: projectName || filteredAndSorted[0]?.project?.name }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to export");
      if (data.sheetUrl) window.open(data.sheetUrl, "_blank");
      toast({ title: "Export successful", description: `Exported ${data.rowCount} result(s) to Google Sheets!` });
    } catch (error: any) {
      toast({ title: "Export failed", description: error.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const handleDownload = async (job: QCJob) => {
    try {
      if (job.drive_link || job.drive_file_id) {
        const fileId = job.drive_file_id || job.drive_link?.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1];
        if (fileId) window.open(`https://drive.google.com/uc?export=download&id=${fileId}`, "_blank");
      }
      toast({ title: "Download started" });
    } catch {
      toast({ title: "Download failed", variant: "destructive" });
    }
  };

  const handleOpenInDrive = (job: QCJob) => {
    if (job.drive_link) window.open(job.drive_link, "_blank");
    else if (job.drive_file_id) window.open(`https://drive.google.com/file/d/${job.drive_file_id}/view`, "_blank");
  };

  const handlePause = async (job: QCJob) => {
    try {
      setActionLoading((prev) => new Set(prev).add(job.id));
      await fetch("/api/qc/cancel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobIds: [job.id] }) });
      toast({ title: "Job paused" });
      fetchQCJobs();
    } catch {
      toast({ title: "Failed to pause", variant: "destructive" });
    } finally {
      setActionLoading((prev) => { const next = new Set(prev); next.delete(job.id); return next; });
    }
  };

  const handleDelete = async (job: QCJob) => {
    if (!confirm(`Delete "${job.file_name}"?`)) return;
    try {
      setActionLoading((prev) => new Set(prev).add(job.id));
      if (isProcessing(job.status)) {
        await fetch("/api/qc/cancel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobIds: [job.id] }) });
      }
      await fetch(`/api/data/qc-jobs?id=${job.id}`, { method: "DELETE" });
      toast({ title: "Job deleted" });
      fetchQCJobs();
    } catch {
      toast({ title: "Failed to delete", variant: "destructive" });
    } finally {
      setActionLoading((prev) => { const next = new Set(prev); next.delete(job.id); return next; });
    }
  };

  const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  const stats = {
    total: jobs.length,
    passed: jobs.filter((j) => (j.result_json?.status || j.result?.status) === "passed").length,
    failed: jobs.filter((j) => j.status === "failed" || (j.result_json?.status || j.result?.status) === "failed").length,
    processing: jobs.filter((j) => isProcessing(j.status)).length,
    needsReprocess: jobs.filter((j) => {
      if (j.status === "failed") return true;
      const result = j.result_json || j.result;
      if (!result) return false;
      return (
        result.basicQC?.audioMissing?.error?.includes("FFmpeg") ||
        result.basicQC?.loudness?.message?.includes("FFmpeg") ||
        result.basicQC?.loudness?.lufs === null
      );
    }).length,
  };

  const handleReprocessAll = async () => {
    setReprocessing(true);
    try {
      const response = await fetch("/api/qc/reprocess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to reprocess");
      toast({
        title: "Reprocessing started",
        description: `${data.requeued} job(s) queued for reprocessing`,
      });
      setTimeout(fetchQCJobs, 2000); // Refresh after delay
    } catch (error: any) {
      toast({
        title: "Reprocess failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setReprocessing(false);
    }
  };

  const uniqueProjects = [...new Map(filteredAndSorted.filter((j) => j.project?.id).map((j) => [j.project!.id, j.project!])).values()];

  return (
    <div className="space-y-6 p-6">
      {/* Header with Stats */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">QC Results</h1>
          <p className="text-zinc-400 mt-1">View and manage quality control results</p>
        </div>
        <div className="flex items-center gap-3">
          {stats.processing > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20">
              <Loader2 className="h-3.5 w-3.5 text-blue-400 animate-spin" />
              <span className="text-xs text-blue-400 font-medium">{stats.processing} processing</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-green-400">{stats.passed} passed</span>
            <span className="text-zinc-600">•</span>
            <span className="text-red-400">{stats.failed} failed</span>
            <span className="text-zinc-600">•</span>
            <span className="text-zinc-400">{stats.total} total</span>
          </div>
          {stats.needsReprocess > 0 && (
            <Button variant="outline" onClick={handleReprocessAll} disabled={reprocessing} className="border-orange-500/50 text-orange-400 hover:bg-orange-500/10">
              <RefreshCw className={cn("h-4 w-4 mr-2", reprocessing && "animate-spin")} />
              {reprocessing ? "Reprocessing..." : `Reprocess (${stats.needsReprocess})`}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button disabled={exporting || uniqueProjects.length === 0} className="bg-purple-600 hover:bg-purple-700">
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                {exporting ? "Exporting..." : "Export"}
                <ChevronDown className="h-4 w-4 ml-2" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="bg-zinc-900 border-zinc-700">
              {uniqueProjects.map((project) => (
                <DropdownMenuItem key={project.id} onClick={() => handleExportToSheets(project.id, project.name)}>
                  {project.code} - {project.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" onClick={fetchQCJobs} disabled={refreshing} className="border-zinc-700 text-zinc-300 hover:bg-zinc-800">
            <RefreshCw className={cn("h-4 w-4 mr-2", refreshing && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Creative QC Toggle - Enterprise Only */}
      <CreativeQCToggle onSettingsChange={() => fetchQCJobs()} />

      {/* Filters */}
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <Input placeholder="Search files or projects..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10 border-zinc-700 bg-zinc-800 text-white" />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[180px] border-zinc-700 bg-zinc-800 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-700">
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="passed">Passed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="needs_review">Needs Review</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Results Table */}
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full bg-zinc-800" />)}</div>
          ) : filteredAndSorted.length === 0 ? (
            <div className="p-12 text-center">
              <FileVideo className="h-12 w-12 text-zinc-600 mx-auto mb-3" />
              <p className="text-zinc-400">No QC results found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800 hover:bg-zinc-800/50">
                    <TableHead className="text-zinc-300 w-[30%]">
                      <button onClick={() => handleSort("file_name")} className="flex items-center gap-1 hover:text-white">
                        File Name
                        {sortField === "file_name" && (sortDirection === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                      </button>
                    </TableHead>
                    <TableHead className="text-zinc-300">Project</TableHead>
                    <TableHead className="text-zinc-300">
                      <button onClick={() => handleSort("status")} className="flex items-center gap-1 hover:text-white">
                        Status
                        {sortField === "status" && (sortDirection === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                      </button>
                    </TableHead>
                    <TableHead className="text-zinc-300">
                      <button onClick={() => handleSort("score")} className="flex items-center gap-1 hover:text-white">
                        Score
                        {sortField === "score" && (sortDirection === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                      </button>
                    </TableHead>
                    <TableHead className="text-zinc-300">Audio</TableHead>
                    <TableHead className="text-zinc-300">Loudness</TableHead>
                    <TableHead className="text-zinc-300">Lip-Sync</TableHead>
                    <TableHead className="text-zinc-300">
                      <div className="flex items-center gap-1">
                        <Sparkles className="h-3 w-3 text-purple-400" />
                        Creative QC
                      </div>
                    </TableHead>
                    <TableHead className="text-zinc-300">
                      <button onClick={() => handleSort("created_at")} className="flex items-center gap-1 hover:text-white">
                        Date
                        {sortField === "created_at" && (sortDirection === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                      </button>
                    </TableHead>
                    <TableHead className="text-zinc-300 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAndSorted.map((job, index) => {
                    const result = job.result_json || job.result || {};
                    const statusInfo = getStatusInfo(job.status, result);
                    const StatusIcon = statusInfo.icon;
                    const score = getScore(job);
                    const processing = isProcessing(job.status);
                    const hasDriveLink = !!(job.drive_link || job.drive_file_id);
                    const isLoading = actionLoading.has(job.id);

                    return (
                      <motion.tr
                        key={job.id}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.15, delay: index * 0.02 }}
                        className="border-zinc-800 hover:bg-zinc-800/50 group"
                      >
                        <TableCell className="py-3">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-lg bg-zinc-800/50 flex items-center justify-center flex-shrink-0">
                              <FileVideo className="h-5 w-5 text-zinc-400" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <button
                                onClick={() => { setSelectedJob(job); setDetailModalOpen(true); }}
                                className="text-sm font-medium text-white hover:text-purple-400 transition-colors text-left truncate block max-w-full"
                              >
                                {job.file_name || "Unknown"}
                              </button>
                              <div className="flex items-center gap-2 mt-0.5">
                                {hasDriveLink && <Badge variant="outline" className="text-[10px] border-blue-500/30 text-blue-400 px-1 py-0">Drive</Badge>}
                              </div>
                              {processing && (
                                <div className="mt-2 max-w-xs">
                                  <div className="flex items-center justify-between text-[10px] mb-1">
                                    <span className="text-zinc-500">Processing...</span>
                                    <span className="text-zinc-400 font-mono">{job.progress || 0}%</span>
                                  </div>
                                  <Progress value={job.progress || 0} className="h-1" />
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-3">
                          {job.project ? (
                            <button onClick={() => handleExportToSheets(job.project?.id, job.project?.name)} className="text-left hover:opacity-80">
                              <span className="text-sm font-mono text-zinc-300 hover:text-purple-400">{job.project.code}</span>
                              <p className="text-xs text-zinc-500 truncate max-w-[100px]">{job.project.name}</p>
                            </button>
                          ) : (
                            <span className="text-sm text-zinc-500">—</span>
                          )}
                        </TableCell>
                        <TableCell className="py-3">
                          <div className="flex items-center gap-2">
                            <StatusIcon className={cn("h-4 w-4", statusInfo.color, processing && "animate-spin")} />
                            <Badge className={statusInfo.className}>{statusInfo.label}</Badge>
                          </div>
                        </TableCell>
                        <TableCell className="py-3">
                          {score !== undefined ? (
                            <span className={cn("text-sm font-medium", score >= 80 ? "text-green-400" : score >= 60 ? "text-yellow-400" : "text-red-400")}>
                              {score}/100
                            </span>
                          ) : processing ? (
                            <span className="text-xs text-zinc-500">Analyzing...</span>
                          ) : (
                            <span className="text-xs text-zinc-500">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-zinc-400 text-sm">{getQCValue(job, "audioMissing")}</TableCell>
                        <TableCell className="text-zinc-400 text-sm">{getQCValue(job, "loudness")}</TableCell>
                        <TableCell className="text-zinc-400 text-sm">{getQCValue(job, "lipSync")}</TableCell>
                        <TableCell className="py-3">
                          {job.creative_qc_status === "completed" ? (
                            <CreativeQCScoreBadge score={job.creative_qc_overall_score} size="small" />
                          ) : (
                            <CreativeQCStatus status={job.creative_qc_status} error={job.creative_qc_error} />
                          )}
                        </TableCell>
                        <TableCell className="text-zinc-400 text-xs">{formatDate(job.created_at)}</TableCell>
                        <TableCell className="py-3 text-right">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {processing && (
                              <Button variant="ghost" size="sm" onClick={() => handlePause(job)} disabled={isLoading} className="h-8 w-8 p-0 text-zinc-400 hover:text-orange-400">
                                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />}
                              </Button>
                            )}
                            {hasDriveLink && (
                              <Button variant="ghost" size="sm" onClick={() => handleOpenInDrive(job)} className="h-8 w-8 p-0 text-zinc-400 hover:text-blue-400">
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            )}
                            <Button variant="ghost" size="sm" onClick={() => handleDownload(job)} className="h-8 w-8 p-0 text-zinc-400 hover:text-white">
                              <Download className="h-4 w-4" />
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-zinc-400 hover:text-white">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48 bg-zinc-900 border-zinc-700">
                                <DropdownMenuItem onClick={() => { setSelectedJob(job); setDetailModalOpen(true); }}>
                                  <Eye className="h-4 w-4 mr-2" />View Details
                                </DropdownMenuItem>
                                {hasDriveLink && (
                                  <DropdownMenuItem onClick={() => handleOpenInDrive(job)}>
                                    <ExternalLink className="h-4 w-4 mr-2" />Open in Drive
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={() => handleDownload(job)}>
                                  <Download className="h-4 w-4 mr-2" />Download
                                </DropdownMenuItem>
                                {job.project && (
                                  <DropdownMenuItem onClick={() => handleExportToSheets(job.project?.id, job.project?.name)}>
                                    <FileSpreadsheet className="h-4 w-4 mr-2" />Export to Sheets
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator className="bg-zinc-700" />
                                {processing && (
                                  <DropdownMenuItem onClick={() => handlePause(job)} className="text-orange-400">
                                    <Pause className="h-4 w-4 mr-2" />Pause
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={() => handleDelete(job)} className="text-red-400">
                                  <Trash2 className="h-4 w-4 mr-2" />Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </motion.tr>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Modal */}
      <Dialog open={detailModalOpen} onOpenChange={setDetailModalOpen}>
        <DialogContent className="max-w-3xl bg-zinc-900 border-zinc-700 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-3">
              <FileVideo className="h-5 w-5 text-zinc-400" />
              {selectedJob?.file_name || "QC Report Details"}
            </DialogTitle>
          </DialogHeader>
          
          {selectedJob && (
            <div className="space-y-6 mt-4">
              {/* Status and Score */}
              <div className="flex items-center justify-between p-4 rounded-lg bg-zinc-800/50">
                <div className="flex items-center gap-3">
                  {(() => {
                    const result = selectedJob.result_json || selectedJob.result || {};
                    const statusInfo = getStatusInfo(selectedJob.status, result);
                    const StatusIcon = statusInfo.icon;
                    return (
                      <>
                        <StatusIcon className={cn("h-6 w-6", statusInfo.color, isProcessing(selectedJob.status) && "animate-spin")} />
                        <div>
                          <p className={cn("font-medium", statusInfo.color)}>{statusInfo.label}</p>
                          <p className="text-xs text-zinc-500">Status</p>
                        </div>
                      </>
                    );
                  })()}
                </div>
                {getScore(selectedJob) !== undefined && (
                  <div className="text-right">
                    <p className={cn(
                      "text-2xl font-bold",
                      (getScore(selectedJob) || 0) >= 80 ? "text-green-400" : (getScore(selectedJob) || 0) >= 60 ? "text-yellow-400" : "text-red-400"
                    )}>
                      {getScore(selectedJob)}/100
                    </p>
                    <p className="text-xs text-zinc-500">QC Score</p>
                  </div>
                )}
              </div>

              {/* Progress */}
              {isProcessing(selectedJob.status) && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-zinc-400">Processing Progress</span>
                    <span className="text-zinc-300 font-mono">{selectedJob.progress || 0}%</span>
                  </div>
                  <Progress value={selectedJob.progress || 0} className="h-2" />
                </div>
              )}

              {/* QC Metrics */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Audio Missing", value: getQCValue(selectedJob, "audioMissing") },
                  { label: "Loudness", value: getQCValue(selectedJob, "loudness") },
                  { label: "Lip-Sync", value: getQCValue(selectedJob, "lipSync") },
                  { label: "Subtitle Timing", value: getQCValue(selectedJob, "subtitleTiming") },
                  { label: "BGM", value: getQCValue(selectedJob, "bgm") },
                  { label: "Glitches", value: getQCValue(selectedJob, "glitches") },
                ].map((metric) => (
                  <div key={metric.label} className="p-3 rounded-lg bg-zinc-800/50">
                    <p className="text-xs text-zinc-500">{metric.label}</p>
                    <p className="text-sm text-zinc-300 mt-1">{metric.value}</p>
                  </div>
                ))}
              </div>

              {/* File Info */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-zinc-500">Created</p>
                  <p className="text-zinc-300">{formatDate(selectedJob.created_at)}</p>
                </div>
                {selectedJob.project && (
                  <div>
                    <p className="text-zinc-500">Project</p>
                    <p className="text-zinc-300">{selectedJob.project.code} - {selectedJob.project.name}</p>
                  </div>
                )}
                {selectedJob.drive_link && (
                  <div className="col-span-2">
                    <p className="text-zinc-500">Google Drive Link</p>
                    <div className="flex items-center gap-2 mt-1">
                      <a href={selectedJob.drive_link} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline truncate">{selectedJob.drive_link}</a>
                      <Button variant="ghost" size="sm" onClick={() => copyToClipboard(selectedJob.drive_link || "")} className="h-6 w-6 p-0"><Copy className="h-3 w-3" /></Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Error Message */}
              {selectedJob.error_message && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                  <p className="text-sm text-red-400"><strong>Error:</strong> {selectedJob.error_message}</p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center gap-3 pt-4 border-t border-zinc-800">
                {(selectedJob.drive_link || selectedJob.drive_file_id) && (
                  <Button onClick={() => handleOpenInDrive(selectedJob)} variant="outline" className="border-zinc-700">
                    <ExternalLink className="h-4 w-4 mr-2" />Open in Drive
                  </Button>
                )}
                <Button onClick={() => handleDownload(selectedJob)} variant="outline" className="border-zinc-700">
                  <Download className="h-4 w-4 mr-2" />Download
                </Button>
                {selectedJob.project && (
                  <Button onClick={() => handleExportToSheets(selectedJob.project?.id, selectedJob.project?.name)} variant="outline" className="border-zinc-700">
                    <FileSpreadsheet className="h-4 w-4 mr-2" />Export to Sheets
                  </Button>
                )}
                {isProcessing(selectedJob.status) && (
                  <Button onClick={() => handlePause(selectedJob)} variant="outline" className="border-orange-500/30 text-orange-400">
                    <Pause className="h-4 w-4 mr-2" />Pause
                  </Button>
                )}
                <Button onClick={() => { handleDelete(selectedJob); setDetailModalOpen(false); }} variant="outline" className="border-red-500/30 text-red-400 ml-auto">
                  <Trash2 className="h-4 w-4 mr-2" />Delete
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
