"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Download,
  FileVideo,
  FileAudio,
  Filter,
  ChevronDown,
  ExternalLink,
  MoreVertical,
  Pause,
  Trash2,
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  FileSpreadsheet,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface Delivery {
  id: string;
  file_name: string;
  original_file_name: string;
  status: string;
  storage_path: string;
  drive_link?: string;
  drive_file_id?: string;
  project_id: string;
  vendor_id: string;
  created_at: string;
  progress?: number;
  score?: number;
  qc_report?: any;
  qc_errors?: any[];
  project?: { code: string; name: string; id: string };
  vendor?: { full_name: string | null };
}

function FileTypeIcon({ fileName, className }: { fileName: string; className?: string }) {
  const extension = fileName.split(".").pop()?.toLowerCase();
  const isVideo = ["mov", "mp4", "avi", "mkv", "mxf"].includes(extension || "");
  const isAudio = ["wav", "aiff", "mp3", "flac", "m4a"].includes(extension || "");

  if (isVideo) return <FileVideo className={cn("h-4 w-4 text-purple-400", className)} />;
  if (isAudio) return <FileAudio className={cn("h-4 w-4 text-blue-400", className)} />;
  return <FileVideo className={cn("h-4 w-4 text-zinc-400", className)} />;
}

export default function DeliveriesPage() {
  const { toast } = useToast();
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [filteredDeliveries, setFilteredDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedFile, setSelectedFile] = useState<Delivery | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState<Set<string>>(new Set());

  const fetchDeliveries = useCallback(async () => {
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

      // Fetch deliveries
      const { data: deliveriesData, error: deliveriesError } = await supabase
        .from("deliveries")
        .select("*")
        .eq("organization_id", profile.organization_id)
        .order("created_at", { ascending: false })
        .limit(200);

      if (deliveriesError) throw deliveriesError;

      // Fetch QC jobs for additional data
      const { data: qcJobs } = await supabase
        .from("qc_jobs")
        .select("*")
        .eq("organisation_id", profile.organization_id)
        .order("created_at", { ascending: false })
        .limit(200);

      // Merge QC job data into deliveries
      const deliveriesMap = new Map<string, Delivery>();
      (deliveriesData || []).forEach((d) => {
        deliveriesMap.set(d.id, {
          ...d,
          progress: d.status === "qc_passed" || d.status === "qc_failed" ? 100 : (d.progress || 0),
        });
      });

      (qcJobs || []).forEach((job) => {
        const existing = deliveriesMap.get(job.delivery_id);
        if (existing) {
          deliveriesMap.set(job.delivery_id, {
            ...existing,
            drive_link: job.drive_link || existing.drive_link,
            drive_file_id: job.drive_file_id || existing.drive_file_id,
            score: job.result?.summary?.score,
            qc_report: job.result,
            progress: job.progress !== undefined && job.progress !== null 
              ? job.progress 
              : (job.status === "completed" || job.status === "failed" ? 100 : 
                 job.status === "queued" ? 0 : existing.progress || 5),
          });
        }
      });

      const allDeliveries = Array.from(deliveriesMap.values());

      // Fetch projects and vendors
      const projectIds = [...new Set(allDeliveries.map((d) => d.project_id).filter(Boolean))];
      const vendorIds = [...new Set(allDeliveries.map((d) => d.vendor_id).filter(Boolean))];

      const [projectsRes, vendorsRes] = await Promise.all([
        projectIds.length > 0 ? supabase.from("projects").select("id, code, name").in("id", projectIds) : { data: [] },
        vendorIds.length > 0 ? supabase.from("profiles").select("id, full_name").in("id", vendorIds) : { data: [] },
      ]);

      const enrichedDeliveries = allDeliveries.map((delivery) => ({
        ...delivery,
        project: projectsRes.data?.find((p) => p.id === delivery.project_id),
        vendor: vendorsRes.data?.find((v) => v.id === delivery.vendor_id),
      }));

      setDeliveries(enrichedDeliveries);
      setFilteredDeliveries(enrichedDeliveries);
    } catch (error) {
      console.error("Error fetching deliveries:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDeliveries();
    const interval = setInterval(fetchDeliveries, 5000);
    return () => clearInterval(interval);
  }, [fetchDeliveries]);

  useEffect(() => {
    let filtered = deliveries;

    if (searchQuery) {
      filtered = filtered.filter(
        (d) =>
          d.file_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          d.original_file_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          d.project?.code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          d.vendor?.full_name?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter((d) => d.status === statusFilter);
    }

    setFilteredDeliveries(filtered);
  }, [searchQuery, statusFilter, deliveries]);

  const getStatusInfo = (status: string) => {
    switch (status) {
      case "qc_passed":
        return { label: "Passed", className: "border-green-500/20 bg-green-500/10 text-green-400", icon: CheckCircle2, color: "text-green-400" };
      case "qc_failed":
        return { label: "Failed", className: "border-red-500/20 bg-red-500/10 text-red-400", icon: XCircle, color: "text-red-400" };
      case "processing":
        return { label: "Processing", className: "border-blue-500/20 bg-blue-500/10 text-blue-400", icon: Loader2, color: "text-blue-400" };
      case "uploading":
        return { label: "Uploading", className: "border-purple-500/20 bg-purple-500/10 text-purple-400", icon: Loader2, color: "text-purple-400" };
      case "rejected":
        return { label: "Rejected", className: "border-red-500/20 bg-red-500/10 text-red-400", icon: XCircle, color: "text-red-400" };
      default:
        return { label: status || "Pending", className: "border-zinc-500/20 bg-zinc-500/10 text-zinc-400", icon: Clock, color: "text-zinc-400" };
    }
  };

  const isProcessing = (status: string) => ["processing", "uploading", "queued", "running"].includes(status);

  const handleDownload = async (delivery: Delivery) => {
    try {
      if (delivery.drive_link || delivery.drive_file_id) {
        const fileId = delivery.drive_file_id || delivery.drive_link?.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1];
        if (fileId) {
          window.open(`https://drive.google.com/uc?export=download&id=${fileId}`, "_blank");
          toast({ title: "Download started", description: "Opening Google Drive download..." });
          return;
        }
      }

      if (delivery.storage_path) {
        const { data, error } = await supabase.storage.from("deliveries").createSignedUrl(delivery.storage_path, 3600);
        if (error) throw error;
        if (data?.signedUrl) {
          const a = document.createElement("a");
          a.href = data.signedUrl;
          a.download = delivery.original_file_name || delivery.file_name || "download";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          toast({ title: "Download started" });
        }
      }
    } catch (error: any) {
      toast({ title: "Download failed", description: error.message, variant: "destructive" });
    }
  };

  const handleOpenInDrive = (delivery: Delivery) => {
    if (delivery.drive_link) window.open(delivery.drive_link, "_blank");
    else if (delivery.drive_file_id) window.open(`https://drive.google.com/file/d/${delivery.drive_file_id}/view`, "_blank");
  };

  const handlePause = async (delivery: Delivery) => {
    try {
      setActionLoading((prev) => new Set(prev).add(delivery.id));
      await fetch("/api/qc/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobIds: [delivery.id] }),
      });
      toast({ title: "Job paused" });
      fetchDeliveries();
    } catch {
      toast({ title: "Failed to pause", variant: "destructive" });
    } finally {
      setActionLoading((prev) => { const next = new Set(prev); next.delete(delivery.id); return next; });
    }
  };

  const handleDelete = async (delivery: Delivery) => {
    if (!confirm(`Delete "${delivery.original_file_name || delivery.file_name}"?`)) return;
    try {
      setActionLoading((prev) => new Set(prev).add(delivery.id));
      if (isProcessing(delivery.status)) {
        await fetch("/api/qc/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobIds: [delivery.id] }),
        });
      }
      await supabase.from("deliveries").delete().eq("id", delivery.id);
      await supabase.from("qc_jobs").delete().eq("delivery_id", delivery.id);
      toast({ title: "File deleted" });
      fetchDeliveries();
    } catch {
      toast({ title: "Failed to delete", variant: "destructive" });
    } finally {
      setActionLoading((prev) => { const next = new Set(prev); next.delete(delivery.id); return next; });
    }
  };

  const handleExportToSheets = async (delivery: Delivery) => {
    if (!delivery.project?.id) {
      toast({ title: "Export failed", description: "No project associated", variant: "destructive" });
      return;
    }
    try {
      const response = await fetch("/api/qc/export-to-sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: delivery.project.id, projectName: delivery.project.name }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (data.sheetUrl) window.open(data.sheetUrl, "_blank");
      toast({ title: "Export successful" });
    } catch (error: any) {
      toast({ title: "Export failed", description: error.message, variant: "destructive" });
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  };

  const stats = {
    total: deliveries.length,
    passed: deliveries.filter((d) => d.status === "qc_passed").length,
    failed: deliveries.filter((d) => d.status === "qc_failed").length,
    processing: deliveries.filter((d) => isProcessing(d.status)).length,
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header with Stats */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-white mb-1 sm:mb-2">Deliveries</h1>
          <p className="text-sm sm:text-base text-zinc-400">Manage and track all file uploads and QC results</p>
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
          <Button variant="ghost" size="sm" onClick={fetchDeliveries} disabled={refreshing} className="h-8 w-8 p-0">
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Deliveries Card */}
      <Card className="glass border-zinc-800/50">
        <CardHeader className="pb-3 px-4 sm:px-6 pt-4 sm:pt-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-white text-base sm:text-lg">
              All Deliveries
              <span className="text-zinc-500 font-normal text-sm ml-2">({filteredDeliveries.length})</span>
            </CardTitle>
            
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <Input
                  placeholder="Search files..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 w-48 lg:w-64 bg-zinc-900/50 border-zinc-800/50"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-32 lg:w-40 bg-zinc-900/50 border-zinc-800/50">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-700">
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="qc_passed">Passed</SelectItem>
                  <SelectItem value="qc_failed">Failed</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem>
                  <SelectItem value="uploading">Uploading</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 sm:p-6 space-y-3">
              {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-20 sm:h-12 w-full" />)}
            </div>
          ) : filteredDeliveries.length === 0 ? (
            <div className="text-center py-12 px-4 sm:px-6">
              <FileVideo className="h-12 w-12 text-zinc-600 mx-auto mb-3" />
              <p className="text-zinc-400">{searchQuery || statusFilter !== "all" ? "No deliveries match your filters" : "No deliveries yet"}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800/50 hover:bg-zinc-900/30">
                    <TableHead className="text-zinc-400 font-medium text-xs uppercase tracking-wider py-2.5 w-[35%]">File</TableHead>
                    <TableHead className="text-zinc-400 font-medium text-xs uppercase tracking-wider py-2.5 w-[15%]">Project</TableHead>
                    <TableHead className="text-zinc-400 font-medium text-xs uppercase tracking-wider py-2.5 w-[15%]">Vendor</TableHead>
                    <TableHead className="text-zinc-400 font-medium text-xs uppercase tracking-wider py-2.5 w-[10%]">Status</TableHead>
                    <TableHead className="text-zinc-400 font-medium text-xs uppercase tracking-wider py-2.5 w-[10%]">Score</TableHead>
                    <TableHead className="text-zinc-400 font-medium text-xs uppercase tracking-wider py-2.5 w-[10%] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDeliveries.map((delivery, index) => {
                    const statusInfo = getStatusInfo(delivery.status);
                    const StatusIcon = statusInfo.icon;
                    const processing = isProcessing(delivery.status);
                    const hasDriveLink = !!(delivery.drive_link || delivery.drive_file_id);
                    const isLoading = actionLoading.has(delivery.id);

                    return (
                      <motion.tr
                        key={delivery.id}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.15, delay: index * 0.02 }}
                        className="border-zinc-800/50 hover:bg-zinc-900/30 transition-colors group"
                      >
                        <TableCell className="py-3">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-lg bg-zinc-800/50 flex items-center justify-center flex-shrink-0">
                              <FileTypeIcon fileName={delivery.file_name} className="h-5 w-5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <button
                                onClick={() => { setSelectedFile(delivery); setDetailModalOpen(true); }}
                                className="text-sm font-medium text-white truncate hover:text-purple-400 transition-colors text-left block max-w-full"
                              >
                                {delivery.original_file_name || delivery.file_name}
                              </button>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-xs text-zinc-500">{formatDate(delivery.created_at)}</span>
                                {hasDriveLink && (
                                  <Badge variant="outline" className="text-[10px] border-blue-500/30 text-blue-400 px-1 py-0">Drive</Badge>
                                )}
                              </div>
                              {processing && (
                                <div className="mt-2 max-w-xs">
                                  <div className="flex items-center justify-between text-[10px] mb-1">
                                    <span className="text-zinc-500">{delivery.status === "uploading" ? "Uploading..." : "Processing..."}</span>
                                    <span className="text-zinc-400 font-mono">{delivery.progress || 0}%</span>
                                  </div>
                                  <Progress value={delivery.progress || 0} className="h-1" />
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-3">
                          {delivery.project ? (
                            <button
                              onClick={() => handleExportToSheets(delivery)}
                              className="text-left hover:opacity-80 transition-opacity"
                            >
                              <span className="text-sm font-mono font-semibold text-zinc-300 hover:text-purple-400">{delivery.project.code}</span>
                              {delivery.project.name && <p className="text-xs text-zinc-500 truncate max-w-[100px]">{delivery.project.name}</p>}
                            </button>
                          ) : (
                            <span className="text-sm text-zinc-500">—</span>
                          )}
                        </TableCell>
                        <TableCell className="py-3">
                          <span className="text-sm text-zinc-300">{delivery.vendor?.full_name || "Unknown"}</span>
                        </TableCell>
                        <TableCell className="py-3">
                          <div className="flex items-center gap-2">
                            <StatusIcon className={cn("h-4 w-4", statusInfo.color, processing && "animate-spin")} />
                            <Badge variant="outline" className={statusInfo.className}>{statusInfo.label}</Badge>
                          </div>
                        </TableCell>
                        <TableCell className="py-3">
                          {delivery.score !== undefined ? (
                            <span className={cn(
                              "text-sm font-medium",
                              delivery.score >= 80 ? "text-green-400" : delivery.score >= 60 ? "text-yellow-400" : "text-red-400"
                            )}>
                              {delivery.score}/100
                            </span>
                          ) : processing ? (
                            <span className="text-xs text-zinc-500">Analyzing...</span>
                          ) : (
                            <span className="text-xs text-zinc-500">—</span>
                          )}
                        </TableCell>
                        <TableCell className="py-3 text-right">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {processing && (
                              <Button variant="ghost" size="sm" onClick={() => handlePause(delivery)} disabled={isLoading} className="h-8 w-8 p-0 text-zinc-400 hover:text-orange-400">
                                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />}
                              </Button>
                            )}
                            {hasDriveLink && (
                              <Button variant="ghost" size="sm" onClick={() => handleOpenInDrive(delivery)} className="h-8 w-8 p-0 text-zinc-400 hover:text-blue-400">
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            )}
                            <Button variant="ghost" size="sm" onClick={() => handleDownload(delivery)} className="h-8 w-8 p-0 text-zinc-400 hover:text-white">
                              <Download className="h-4 w-4" />
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-zinc-400 hover:text-white">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48 bg-zinc-900 border-zinc-700">
                                <DropdownMenuItem onClick={() => { setSelectedFile(delivery); setDetailModalOpen(true); }}>
                                  <Eye className="h-4 w-4 mr-2" />View Details
                                </DropdownMenuItem>
                                {hasDriveLink && (
                                  <DropdownMenuItem onClick={() => handleOpenInDrive(delivery)}>
                                    <ExternalLink className="h-4 w-4 mr-2" />Open in Drive
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={() => handleDownload(delivery)}>
                                  <Download className="h-4 w-4 mr-2" />Download
                                </DropdownMenuItem>
                                {delivery.project && (
                                  <DropdownMenuItem onClick={() => handleExportToSheets(delivery)}>
                                    <FileSpreadsheet className="h-4 w-4 mr-2" />Export to Sheets
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator className="bg-zinc-700" />
                                {processing && (
                                  <DropdownMenuItem onClick={() => handlePause(delivery)} className="text-orange-400">
                                    <Pause className="h-4 w-4 mr-2" />Pause
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={() => handleDelete(delivery)} className="text-red-400">
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
                      selectedFile.score >= 80 ? "text-green-400" : selectedFile.score >= 60 ? "text-yellow-400" : "text-red-400"
                    )}>
                      {selectedFile.score}/100
                    </p>
                    <p className="text-xs text-zinc-500">QC Score</p>
                  </div>
                )}
              </div>

              {isProcessing(selectedFile.status) && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-zinc-400">Processing Progress</span>
                    <span className="text-zinc-300 font-mono">{selectedFile.progress || 0}%</span>
                  </div>
                  <Progress value={selectedFile.progress || 0} className="h-2" />
                </div>
              )}

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
                {selectedFile.vendor && (
                  <div>
                    <p className="text-zinc-500">Vendor</p>
                    <p className="text-zinc-300">{selectedFile.vendor.full_name || "Unknown"}</p>
                  </div>
                )}
                {selectedFile.drive_link && (
                  <div className="col-span-2">
                    <p className="text-zinc-500">Google Drive Link</p>
                    <a href={selectedFile.drive_link} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline truncate block">
                      {selectedFile.drive_link}
                    </a>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 pt-4 border-t border-zinc-800">
                {(selectedFile.drive_link || selectedFile.drive_file_id) && (
                  <Button onClick={() => handleOpenInDrive(selectedFile)} variant="outline" className="border-zinc-700">
                    <ExternalLink className="h-4 w-4 mr-2" />Open in Drive
                  </Button>
                )}
                <Button onClick={() => handleDownload(selectedFile)} variant="outline" className="border-zinc-700">
                  <Download className="h-4 w-4 mr-2" />Download
                </Button>
                {selectedFile.project && (
                  <Button onClick={() => handleExportToSheets(selectedFile)} variant="outline" className="border-zinc-700">
                    <FileSpreadsheet className="h-4 w-4 mr-2" />Export to Sheets
                  </Button>
                )}
                {isProcessing(selectedFile.status) && (
                  <Button onClick={() => handlePause(selectedFile)} variant="outline" className="border-orange-500/30 text-orange-400">
                    <Pause className="h-4 w-4 mr-2" />Pause
                  </Button>
                )}
                <Button onClick={() => { handleDelete(selectedFile); setDetailModalOpen(false); }} variant="outline" className="border-red-500/30 text-red-400 ml-auto">
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
