"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
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
import {
  Download,
  ExternalLink,
  Pause,
  Play,
  Trash2,
  MoreVertical,
  Eye,
  FileSpreadsheet,
  Copy,
  FileVideo,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/lib/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export interface FileData {
  id: string;
  file_name?: string;
  original_file_name?: string;
  status: string;
  storage_path?: string;
  drive_link?: string;
  drive_file_id?: string;
  qc_report?: any;
  qc_errors?: any[];
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

interface FileActionsProps {
  file: FileData;
  onRefresh?: () => void;
  showQuickActions?: boolean;
  variant?: "default" | "compact";
}

export function FileActions({ file, onRefresh, showQuickActions = true, variant = "default" }: FileActionsProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const isProcessing = ["queued", "running", "processing", "uploading"].includes(file.status);
  const hasDriveLink = !!(file.drive_link || file.drive_file_id);

  const extractDriveFileId = (url: string): string | null => {
    const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || 
                  url.match(/id=([a-zA-Z0-9_-]+)/) ||
                  url.match(/([a-zA-Z0-9_-]{25,})/);
    return match ? match[1] : null;
  };

  const handleDownload = async () => {
    try {
      if (file.drive_link || file.drive_file_id) {
        const fileId = file.drive_file_id || extractDriveFileId(file.drive_link || "");
        if (fileId) {
          window.open(`https://drive.google.com/uc?export=download&id=${fileId}`, "_blank");
          toast({ title: "Download started", description: "Opening Google Drive download..." });
        }
      } else if (file.storage_path) {
        const { data, error } = await supabase.storage
          .from("deliveries")
          .createSignedUrl(file.storage_path, 3600);

        if (error) throw error;
        if (data?.signedUrl) {
          const a = document.createElement("a");
          a.href = data.signedUrl;
          a.download = file.original_file_name || file.file_name || "download";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          toast({ title: "Download started", description: "File is downloading..." });
        }
      }
    } catch (error: any) {
      toast({ title: "Download failed", description: error.message, variant: "destructive" });
    }
  };

  const handleOpenInDrive = () => {
    if (file.drive_link) {
      window.open(file.drive_link, "_blank");
    } else if (file.drive_file_id) {
      window.open(`https://drive.google.com/file/d/${file.drive_file_id}/view`, "_blank");
    }
  };

  const handlePause = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/qc/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobIds: [file.id] }),
      });

      if (response.ok) {
        toast({ title: "Job paused", description: `${file.original_file_name || file.file_name} has been paused.` });
        onRefresh?.();
      } else {
        throw new Error("Failed to pause job");
      }
    } catch (error: any) {
      toast({ title: "Pause failed", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete "${file.original_file_name || file.file_name}"?`)) {
      return;
    }

    try {
      setLoading(true);
      
      if (isProcessing) {
        await fetch("/api/qc/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobIds: [file.id] }),
        });
      }

      await supabase.from("deliveries").delete().eq("id", file.id);
      await supabase.from("qc_jobs").delete().eq("delivery_id", file.id);

      toast({ title: "File deleted", description: `${file.original_file_name || file.file_name} has been removed.` });
      onRefresh?.();
    } catch (error: any) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleExportToSheets = async () => {
    if (!file.project?.id) {
      toast({ title: "Export failed", description: "No project associated with this file.", variant: "destructive" });
      return;
    }

    try {
      setLoading(true);
      const response = await fetch("/api/qc/export-to-sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: file.project.id,
          projectName: file.project.name,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      if (data.sheetUrl) {
        window.open(data.sheetUrl, "_blank");
      }
      toast({ title: "Export successful", description: `Exported to Google Sheets!`, variant: "success" });
    } catch (error: any) {
      toast({ title: "Export failed", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (variant === "compact") {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-zinc-400 hover:text-white">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48 bg-zinc-900 border-zinc-700">
          {hasDriveLink && (
            <DropdownMenuItem onClick={handleOpenInDrive}>
              <ExternalLink className="h-4 w-4 mr-2" />
              Open in Drive
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={handleDownload}>
            <Download className="h-4 w-4 mr-2" />
            Download
          </DropdownMenuItem>
          {file.project && (
            <DropdownMenuItem onClick={handleExportToSheets}>
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Export to Sheets
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator className="bg-zinc-700" />
          {isProcessing && (
            <DropdownMenuItem onClick={handlePause} className="text-orange-400">
              <Pause className="h-4 w-4 mr-2" />
              Pause
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={handleDelete} className="text-red-400">
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {showQuickActions && (
        <>
          {isProcessing && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePause}
              disabled={loading}
              className="h-8 w-8 p-0 text-zinc-400 hover:text-orange-400"
              title="Pause"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />}
            </Button>
          )}
          {hasDriveLink && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleOpenInDrive}
              className="h-8 w-8 p-0 text-zinc-400 hover:text-blue-400"
              title="Open in Drive"
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDownload}
            className="h-8 w-8 p-0 text-zinc-400 hover:text-white"
            title="Download"
          >
            <Download className="h-4 w-4" />
          </Button>
        </>
      )}
      
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-zinc-400 hover:text-white">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48 bg-zinc-900 border-zinc-700">
          {hasDriveLink && (
            <DropdownMenuItem onClick={handleOpenInDrive}>
              <ExternalLink className="h-4 w-4 mr-2" />
              Open in Drive
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={handleDownload}>
            <Download className="h-4 w-4 mr-2" />
            Download
          </DropdownMenuItem>
          {file.project && (
            <DropdownMenuItem onClick={handleExportToSheets}>
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Export to Sheets
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator className="bg-zinc-700" />
          {isProcessing && (
            <DropdownMenuItem onClick={handlePause} className="text-orange-400">
              <Pause className="h-4 w-4 mr-2" />
              Pause Processing
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={handleDelete} className="text-red-400">
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// File Detail Modal Component
interface FileDetailModalProps {
  file: FileData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRefresh?: () => void;
}

export function FileDetailModal({ file, open, onOpenChange, onRefresh }: FileDetailModalProps) {
  const { toast } = useToast();

  if (!file) return null;

  const isProcessing = ["queued", "running", "processing", "uploading"].includes(file.status);
  const hasDriveLink = !!(file.drive_link || file.drive_file_id);

  const getStatusInfo = (status: string) => {
    switch (status) {
      case "qc_passed":
      case "completed":
        return { label: "Passed", color: "text-green-400", icon: CheckCircle2 };
      case "qc_failed":
      case "failed":
        return { label: "Failed", color: "text-red-400", icon: XCircle };
      case "queued":
        return { label: "Queued", color: "text-zinc-400", icon: Clock };
      case "running":
      case "processing":
        return { label: "Processing", color: "text-blue-400", icon: Loader2 };
      default:
        return { label: status, color: "text-zinc-400", icon: Clock };
    }
  };

  const statusInfo = getStatusInfo(file.status);
  const StatusIcon = statusInfo.icon;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getErrorCount = () => {
    if (file.qc_errors && Array.isArray(file.qc_errors)) return file.qc_errors.length;
    if (file.qc_report?.errors && Array.isArray(file.qc_report.errors)) return file.qc_report.errors.length;
    return 0;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: "Copied to clipboard" });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-zinc-900 border-zinc-700">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-3">
            <FileVideo className="h-5 w-5 text-zinc-400" />
            {file.original_file_name || file.file_name || "File Details"}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 mt-4">
          {/* Status and Score */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-zinc-800/50">
            <div className="flex items-center gap-3">
              <StatusIcon className={cn("h-6 w-6", statusInfo.color, isProcessing && "animate-spin")} />
              <div>
                <p className={cn("font-medium", statusInfo.color)}>{statusInfo.label}</p>
                <p className="text-xs text-zinc-500">Status</p>
              </div>
            </div>
            {file.score !== undefined && (
              <div className="text-right">
                <p className={cn(
                  "text-2xl font-bold",
                  file.score >= 80 ? "text-green-400" :
                  file.score >= 60 ? "text-yellow-400" : "text-red-400"
                )}>
                  {file.score}/100
                </p>
                <p className="text-xs text-zinc-500">QC Score</p>
              </div>
            )}
          </div>

          {/* Progress for processing files */}
          {isProcessing && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-400">Processing Progress</span>
                <span className="text-zinc-300 font-mono">{file.progress || 0}%</span>
              </div>
              <Progress value={file.progress || 0} className="h-2" />
            </div>
          )}

          {/* File Info */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-zinc-500">Created</p>
              <p className="text-zinc-300">{formatDate(file.created_at)}</p>
            </div>
            {file.project && (
              <div>
                <p className="text-zinc-500">Project</p>
                <p className="text-zinc-300">{file.project.code} - {file.project.name}</p>
              </div>
            )}
            {file.drive_link && (
              <div className="col-span-2">
                <p className="text-zinc-500">Google Drive Link</p>
                <div className="flex items-center gap-2 mt-1">
                  <a 
                    href={file.drive_link} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:underline truncate"
                  >
                    {file.drive_link}
                  </a>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(file.drive_link || "")}
                    className="h-6 w-6 p-0"
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Errors */}
          {getErrorCount() > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-zinc-500">QC Errors ({getErrorCount()})</p>
              <div className="max-h-40 overflow-y-auto space-y-2">
                {(file.qc_errors || file.qc_report?.errors || []).map((error: any, idx: number) => (
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
            <FileActions file={file} onRefresh={onRefresh} showQuickActions={false} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Status Badge Component
export function StatusBadge({ status, score }: { status: string; score?: number }) {
  const getStatusInfo = (status: string) => {
    switch (status) {
      case "qc_passed":
      case "completed":
        return { label: "Passed", className: "border-green-500/30 text-green-400 bg-green-500/10" };
      case "qc_failed":
      case "failed":
        return { label: "Failed", className: "border-red-500/30 text-red-400 bg-red-500/10" };
      case "queued":
        return { label: "Queued", className: "border-zinc-500/30 text-zinc-400 bg-zinc-500/10" };
      case "running":
      case "processing":
        return { label: "Processing", className: "border-blue-500/30 text-blue-400 bg-blue-500/10" };
      case "uploading":
        return { label: "Uploading", className: "border-purple-500/30 text-purple-400 bg-purple-500/10" };
      case "cancelled":
        return { label: "Cancelled", className: "border-orange-500/30 text-orange-400 bg-orange-500/10" };
      default:
        return { label: status, className: "border-zinc-500/30 text-zinc-400 bg-zinc-500/10" };
    }
  };

  const statusInfo = getStatusInfo(status);

  return (
    <div className="flex items-center gap-2">
      <Badge variant="outline" className={statusInfo.className}>
        {statusInfo.label}
      </Badge>
      {score !== undefined && (
        <span className={cn(
          "text-xs font-medium",
          score >= 80 ? "text-green-400" :
          score >= 60 ? "text-yellow-400" : "text-red-400"
        )}>
          {score}/100
        </span>
      )}
    </div>
  );
}

// Clickable File Name Component
interface ClickableFileNameProps {
  file: FileData;
  onClick: () => void;
  showProject?: boolean;
  showDate?: boolean;
}

export function ClickableFileName({ file, onClick, showProject = false, showDate = false }: ClickableFileNameProps) {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const hasDriveLink = !!(file.drive_link || file.drive_file_id);

  return (
    <div className="flex items-center gap-3">
      <div className="flex-shrink-0">
        <FileVideo className="h-8 w-8 text-zinc-600" />
      </div>
      <div className="min-w-0 flex-1">
        <button
          onClick={onClick}
          className="text-sm font-medium text-white hover:text-purple-400 transition-colors text-left truncate block max-w-full"
        >
          {file.original_file_name || file.file_name || "Unknown file"}
        </button>
        <div className="flex items-center gap-2 mt-0.5">
          {showProject && file.project && (
            <span className="text-xs text-zinc-500">{file.project.code}</span>
          )}
          {showDate && (
            <span className="text-xs text-zinc-500">{formatDate(file.created_at)}</span>
          )}
          {hasDriveLink && (
            <Badge variant="outline" className="text-[10px] border-blue-500/30 text-blue-400 px-1 py-0">
              Drive
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}

// Score Display Component
export function ScoreDisplay({ score }: { score?: number }) {
  if (score === undefined) {
    return <span className="text-xs text-zinc-500">—</span>;
  }

  return (
    <span className={cn(
      "text-sm font-medium",
      score >= 80 ? "text-green-400" :
      score >= 60 ? "text-yellow-400" : "text-red-400"
    )}>
      {score}/100
    </span>
  );
}

