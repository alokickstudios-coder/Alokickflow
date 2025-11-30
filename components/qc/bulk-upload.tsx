"use client";

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Upload, X, FileVideo, FileText, Loader2, Sparkles, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface FileWithProgress extends File {
  preview?: string;
  progress?: number;
  status?: "pending" | "uploading" | "analyzing" | "complete" | "error";
  result?: any;
}

interface BulkUploadProps {
  onUploadComplete?: () => void;
  projectId?: string;
}

export function BulkQCUpload({ onUploadComplete, projectId }: BulkUploadProps) {
  const [files, setFiles] = useState<FileWithProgress[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [useAI, setUseAI] = useState(true);
  const [overallProgress, setOverallProgress] = useState(0);
  const { toast } = useToast();

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const validateFile = (file: File): boolean => {
    const validVideoTypes = ["video/mp4", "video/quicktime", "video/x-msvideo", "video/webm", "video/x-matroska"];
    const validExtensions = [".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v", ".srt", ".vtt"];
    
    const extension = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
    return validVideoTypes.includes(file.type) || validExtensions.includes(extension);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const newFiles = Array.from(e.dataTransfer.files).filter(validateFile);
      
      if (newFiles.length < e.dataTransfer.files.length) {
        toast({
          title: "Some files skipped",
          description: "Only video and subtitle files (SRT, VTT) are supported.",
          variant: "destructive",
        });
      }
      
      setFiles((prev) => [
        ...prev,
        ...newFiles.map((f) => Object.assign(f, { status: "pending" as const, progress: 0 })),
      ]);
    }
  }, [toast]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files).filter(validateFile);
      setFiles((prev) => [
        ...prev,
        ...newFiles.map((f) => Object.assign(f, { status: "pending" as const, progress: 0 })),
      ]);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (files.length === 0) {
      toast({
        title: "No files selected",
        description: "Please select at least one video or subtitle file.",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    setOverallProgress(0);

    // Update all files to uploading status
    setFiles((prev) => prev.map((f) => ({ ...f, status: "uploading" as const })));

    try {
      const formData = new FormData();
      files.forEach((file) => {
        formData.append("files", file);
      });
      formData.append("useAI", String(useAI));
      if (projectId) {
        formData.append("projectId", projectId);
      }

      // Use AI endpoint if enabled
      const endpoint = useAI ? "/api/qc/ai-analyze" : "/api/qc/bulk-process";

      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setOverallProgress((prev) => Math.min(prev + 5, 90));
        setFiles((prev) =>
          prev.map((f) => ({
            ...f,
            status: "analyzing" as const,
            progress: Math.min((f.progress || 0) + 10, 90),
          }))
        );
      }, 500);

      const response = await fetch(endpoint, {
        method: "POST",
        body: formData,
      });

      clearInterval(progressInterval);

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to process files");
      }

      // Update files with results
      setFiles((prev) =>
        prev.map((f, index) => ({
          ...f,
          status: "complete" as const,
          progress: 100,
          result: data.results?.[index],
        }))
      );
      setOverallProgress(100);

      // Show summary toast
      const summary = data.summary || {
        total: files.length,
        passed: data.results?.filter((r: any) => r.analysis?.status === "passed").length || 0,
        failed: data.results?.filter((r: any) => r.analysis?.status === "failed").length || 0,
      };

      toast({
        title: useAI ? "AI QC Analysis Complete" : "QC Analysis Complete",
        description: `${summary.passed} passed, ${summary.failed} failed out of ${summary.total} files`,
        variant: summary.failed > 0 ? "destructive" : "success",
      });

      // Clear files after a delay
      setTimeout(() => {
        setFiles([]);
        setOverallProgress(0);
        onUploadComplete?.();
      }, 2000);

    } catch (error: any) {
      setFiles((prev) =>
        prev.map((f) => ({ ...f, status: "error" as const, progress: 0 }))
      );
      setOverallProgress(0);

      toast({
        title: "Analysis Failed",
        description: error.message || "Failed to analyze files",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const getFileIcon = (file: File) => {
    if (file.name.endsWith(".srt") || file.name.endsWith(".vtt")) {
      return <FileText className="h-5 w-5 text-blue-400" />;
    }
    return <FileVideo className="h-5 w-5 text-purple-400" />;
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case "complete":
        return "text-green-400";
      case "error":
        return "text-red-400";
      case "analyzing":
        return "text-yellow-400";
      default:
        return "text-zinc-400";
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  return (
    <div className="space-y-4">
      {/* AI Toggle */}
      <div className="flex items-center justify-between p-4 rounded-lg bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-purple-400" />
          </div>
          <div>
            <p className="font-medium text-white">Gemini AI Analysis</p>
            <p className="text-xs text-zinc-400">
              Advanced QC using Google's Gemini 2.0 Flash
            </p>
          </div>
        </div>
        <button
          onClick={() => setUseAI(!useAI)}
          className={cn(
            "relative h-6 w-11 rounded-full transition-colors",
            useAI ? "bg-purple-500" : "bg-zinc-700"
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform",
              useAI && "translate-x-5"
            )}
          />
        </button>
      </div>

      {/* Drop Zone */}
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={cn(
          "relative border-2 border-dashed rounded-lg p-8 text-center transition-colors",
          dragActive
            ? "border-purple-500/50 bg-purple-500/5"
            : "border-zinc-800/50 bg-zinc-900/30 hover:border-zinc-700/50"
        )}
      >
        <input
          type="file"
          id="bulk-file-upload"
          multiple
          accept="video/*,.srt,.vtt"
          onChange={handleFileInput}
          className="hidden"
        />
        <label htmlFor="bulk-file-upload" className="cursor-pointer">
          <div className="h-16 w-16 rounded-full bg-zinc-800/50 flex items-center justify-center mx-auto mb-4">
            <Upload className="h-8 w-8 text-zinc-500" />
          </div>
          <p className="text-white font-medium mb-2">
            Drag and drop files here, or click to select
          </p>
          <p className="text-sm text-zinc-400 mb-4">
            Supports video files (MP4, MOV, MKV, etc.) and subtitle files (SRT, VTT)
          </p>
          <Button variant="outline" type="button">
            Select Files
          </Button>
        </label>
      </div>

      {/* Overall Progress */}
      {uploading && (
        <Card className="glass border-zinc-800/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-3">
              {useAI ? (
                <Sparkles className="h-5 w-5 text-purple-400 animate-pulse" />
              ) : (
                <Zap className="h-5 w-5 text-yellow-400 animate-pulse" />
              )}
              <span className="text-sm font-medium text-white">
                {useAI ? "AI Analysis in Progress" : "Processing Files"}
              </span>
              <span className="text-sm text-zinc-400 ml-auto">
                {overallProgress}%
              </span>
            </div>
            <Progress value={overallProgress} className="h-2" />
          </CardContent>
        </Card>
      )}

      {/* File List */}
      {files.length > 0 && (
        <Card className="glass border-zinc-800/50">
          <CardContent className="p-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-white">
                  {files.length} file{files.length > 1 ? "s" : ""} selected
                </h3>
                {!uploading && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFiles([])}
                    className="text-zinc-400 hover:text-white"
                  >
                    Clear All
                  </Button>
                )}
              </div>
              <div className="max-h-[300px] overflow-y-auto space-y-2">
                {files.map((file, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-3 p-3 rounded-lg bg-zinc-900/50 border border-zinc-800/50"
                  >
                    {getFileIcon(file)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">
                        {file.name}
                      </p>
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-zinc-400">
                          {formatFileSize(file.size)}
                        </p>
                        {file.status && file.status !== "pending" && (
                          <span className={cn("text-xs", getStatusColor(file.status))}>
                            • {file.status === "analyzing" ? "Analyzing..." : file.status}
                          </span>
                        )}
                      </div>
                      {file.status === "analyzing" && (
                        <Progress value={file.progress || 0} className="h-1 mt-2" />
                      )}
                    </div>
                    {file.result?.analysis?.status && (
                      <span
                        className={cn(
                          "text-xs font-medium px-2 py-1 rounded",
                          file.result.analysis.status === "passed"
                            ? "bg-green-500/20 text-green-400"
                            : file.result.analysis.status === "failed"
                            ? "bg-red-500/20 text-red-400"
                            : "bg-yellow-500/20 text-yellow-400"
                        )}
                      >
                        {file.result.analysis.status.toUpperCase()}
                      </span>
                    )}
                    {!uploading && !file.status?.match(/complete|error/) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFile(index)}
                        className="h-8 w-8 p-0 text-zinc-400 hover:text-red-400"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </motion.div>
                ))}
              </div>
            </div>
            {!uploading && files.some((f) => f.status === "pending" || !f.status) && (
              <Button
                onClick={handleUpload}
                disabled={uploading}
                className={cn(
                  "w-full mt-4",
                  useAI && "bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
                )}
              >
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    {useAI ? (
                      <Sparkles className="h-4 w-4 mr-2" />
                    ) : (
                      <Upload className="h-4 w-4 mr-2" />
                    )}
                    {useAI ? "Start AI QC Analysis" : "Start QC Analysis"}
                  </>
                )}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* QC Criteria Info */}
      <Card className="glass border-zinc-800/50">
        <CardContent className="p-4">
          <h4 className="text-sm font-medium text-white mb-3">QC Checks Performed</h4>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {[
              "Audio Missing",
              "Missing Dialogue",
              "Lip-Sync Errors",
              "Loudness Compliance (EBU R128)",
              "Subtitle Timing",
              "Video Glitches",
              "Missing BGM",
              "Visual Quality",
            ].map((check) => (
              <div key={check} className="flex items-center gap-2 text-zinc-400">
                <div className="h-1.5 w-1.5 rounded-full bg-purple-400" />
                {check}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
