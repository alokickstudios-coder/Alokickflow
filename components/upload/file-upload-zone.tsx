"use client";

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Upload, X, FileVideo, FileAudio, CheckCircle2, AlertCircle, Loader2, Sparkles, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { runMockQC, type MockQCResult, formatQCErrors, getSeverityBadgeClass } from "@/lib/qc/mock-processor";

interface UploadFile {
  file: File;
  id: string;
  progress: number;
  status: "pending" | "uploading" | "processing" | "success" | "failed" | "error";
  error?: string;
  qcResult?: MockQCResult;
  deliveryId?: string;
}

interface FileUploadZoneProps {
  onUploadComplete?: () => void;
}

// Filename validation regex
const FILENAME_REGEX = /^([A-Z0-9_]+)[-]?EP[-]?(\d{1,4})[-]?([A-Za-z]+)[-]?(.+)$/i;

function validateFilename(filename: string): { valid: boolean; error?: string } {
  if (!FILENAME_REGEX.test(filename)) {
    return {
      valid: false,
      error: "Filename does not match required format: PROJECTCODE-EP###-TYPE-NAME.ext (e.g., PRT-EP001-MIX-Final.mov)",
    };
  }
  return { valid: true };
}

export function FileUploadZone({ onUploadComplete }: FileUploadZoneProps) {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [dragActive, setDragActive] = useState(false);
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

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const newFiles = Array.from(e.dataTransfer.files);
      handleFiles(newFiles);
    }
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      handleFiles(newFiles);
    }
  };

  const handleFiles = async (fileList: File[]) => {
    const validFiles: UploadFile[] = [];
    const invalidFiles: { file: File; error: string }[] = [];

    // Validate all files first
    for (const file of fileList) {
      const validation = validateFilename(file.name);
      if (validation.valid) {
        validFiles.push({
          file,
          id: `${Date.now()}-${Math.random()}`,
          progress: 0,
          status: "pending",
        });
      } else {
        invalidFiles.push({ file, error: validation.error || "Invalid filename" });
      }
    }

    // Show errors for invalid files
    if (invalidFiles.length > 0) {
      invalidFiles.forEach(({ file, error }) => {
        toast({
          title: "Invalid Filename",
          description: `${file.name}: ${error}`,
          variant: "destructive",
        });
      });
    }

    // Add valid files to state
    if (validFiles.length > 0) {
      setFiles((prev) => [...prev, ...validFiles]);
      // Start uploading valid files
      validFiles.forEach((uploadFile) => {
        uploadAndProcessFile(uploadFile);
      });
    }
  };

  const uploadAndProcessFile = async (uploadFile: UploadFile) => {
    try {
      // Update status to uploading
      setFiles((prev) =>
        prev.map((f) =>
          f.id === uploadFile.id ? { ...f, status: "uploading", progress: 0 } : f
        )
      );

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("Not authenticated");
      }

      // Get user's organization and project
      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", user.id)
        .single();

      if (!profile?.organization_id) {
        throw new Error("No organization found");
      }

      // Get first project (or you can let user select)
      const { data: projects } = await supabase
        .from("projects")
        .select("id")
        .eq("organization_id", profile.organization_id)
        .limit(1);

      if (!projects || projects.length === 0) {
        throw new Error("No project found. Please create a project first.");
      }

      const projectId = projects[0].id;

      // Create storage path
      const timestamp = Date.now();
      const storagePath = `${profile.organization_id}/${projectId}/${timestamp}-${uploadFile.file.name}`;

      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setFiles((prev) =>
          prev.map((f) => {
            if (f.id === uploadFile.id && f.progress < 90 && f.status === "uploading") {
              return { ...f, progress: Math.min(f.progress + 15, 90) };
            }
            return f;
          })
        );
      }, 200);

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("deliveries")
        .upload(storagePath, uploadFile.file, {
          cacheControl: "3600",
          upsert: false,
        });

      clearInterval(progressInterval);

      if (uploadError) throw uploadError;

      // Update progress to 100% and change status to processing
      setFiles((prev) =>
        prev.map((f) =>
          f.id === uploadFile.id ? { ...f, progress: 100, status: "processing" } : f
        )
      );

      // Create delivery record with initial status
      const { data: delivery, error: deliveryError } = await supabase
        .from("deliveries")
        .insert({
          organization_id: profile.organization_id,
          project_id: projectId,
          vendor_id: user.id,
          file_name: uploadFile.file.name,
          original_file_name: uploadFile.file.name,
          status: "processing",
          storage_path: storagePath,
          file_size: uploadFile.file.size,
          file_type: uploadFile.file.type.startsWith("video/") ? "video" : "audio",
        })
        .select()
        .single();

      if (deliveryError || !delivery) {
        console.error("Error creating delivery record:", deliveryError);
        throw new Error("Failed to create delivery record");
      }

      // Update file state with delivery ID
      setFiles((prev) =>
        prev.map((f) =>
          f.id === uploadFile.id ? { ...f, deliveryId: delivery.id } : f
        )
      );

      // Run Mock QC Analysis (simulates 3 second delay)
      toast({
        title: "QC Processing Started",
        description: `Analyzing ${uploadFile.file.name}...`,
      });

      const qcResult = await runMockQC(uploadFile.file.name);

      // Update delivery record with QC results
      if (delivery) {
        const { error: updateError } = await supabase
          .from("deliveries")
          .update({
            status: qcResult.status === "passed" ? "qc_passed" : "qc_failed",
            qc_report: qcResult,
            qc_errors: qcResult.errors,
          })
          .eq("id", delivery.id);

        if (updateError) {
          console.error("Error updating delivery with QC results:", updateError);
        }
      }

      // Update file state with QC result
      setFiles((prev) =>
        prev.map((f) =>
          f.id === uploadFile.id
            ? {
                ...f,
                status: qcResult.status === "passed" ? "success" : "failed",
                qcResult,
              }
            : f
        )
      );

      // Show QC completion toast
      if (qcResult.status === "passed") {
        toast({
          title: "QC Complete: Pass ✓",
          description: `${uploadFile.file.name} passed all quality checks.`,
          variant: "success",
        });
      } else {
        const errorSummary = qcResult.errors.slice(0, 2).map(e => e.type).join(", ");
        toast({
          title: "QC Complete: Fail ✗",
          description: `${uploadFile.file.name} - ${qcResult.errors.length} issue(s) found: ${errorSummary}`,
          variant: "destructive",
        });
      }

      onUploadComplete?.();
    } catch (error: any) {
      console.error("Upload error:", error);
      setFiles((prev) =>
        prev.map((f) =>
          f.id === uploadFile.id
            ? { ...f, status: "error", error: error.message }
            : f
        )
      );
      toast({
        title: "Upload Failed",
        description: error.message || `Failed to upload ${uploadFile.file.name}`,
        variant: "destructive",
      });
    }
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const getFileIcon = (fileName: string) => {
    const extension = fileName.split(".").pop()?.toLowerCase();
    const isVideo = ["mov", "mp4", "avi", "mkv", "mxf"].includes(extension || "");
    const isAudio = ["wav", "aiff", "mp3", "flac", "m4a"].includes(extension || "");

    if (isVideo) {
      return <FileVideo className="h-5 w-5 text-purple-400" />;
    }
    if (isAudio) {
      return <FileAudio className="h-5 w-5 text-blue-400" />;
    }
    return <FileVideo className="h-5 w-5 text-zinc-400" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  const handleClick = () => {
    document.getElementById("file-upload")?.click();
  };

  const getStatusIcon = (status: UploadFile["status"]) => {
    switch (status) {
      case "pending":
        return <Clock className="h-5 w-5 text-zinc-400" />;
      case "success":
        return <CheckCircle2 className="h-5 w-5 text-green-400" />;
      case "failed":
        return <AlertCircle className="h-5 w-5 text-orange-400" />;
      case "error":
        return <AlertCircle className="h-5 w-5 text-red-400" />;
      case "processing":
        return <Sparkles className="h-5 w-5 text-purple-400 animate-pulse" />;
      case "uploading":
        return <Loader2 className="h-5 w-5 text-blue-400 animate-spin" />;
    }
  };

  const getStatusText = (status: UploadFile["status"]) => {
    switch (status) {
      case "pending":
        return "Waiting...";
      case "uploading":
        return "Uploading...";
      case "processing":
        return "Running QC Analysis...";
      case "success":
        return "QC Passed";
      case "failed":
        return "QC Failed";
      case "error":
        return "Upload Error";
      default:
        return "";
    }
  };

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={cn(
          "relative border-2 border-dashed rounded-lg p-6 sm:p-12 text-center transition-colors cursor-pointer",
          dragActive
            ? "border-purple-500/50 bg-purple-500/5"
            : "border-zinc-800/50 bg-zinc-900/30 hover:border-zinc-700/50 active:bg-zinc-800/30"
        )}
        onClick={handleClick}
      >
        <input
          type="file"
          id="file-upload"
          multiple
          accept="video/*,audio/*"
          onChange={handleFileInput}
          className="hidden"
        />
        <Upload className="h-10 w-10 sm:h-16 sm:w-16 text-zinc-500 mx-auto mb-3 sm:mb-4" />
        <p className="text-white font-medium mb-2 text-base sm:text-lg">
          <span className="hidden sm:inline">Drag and drop files here, or click to select</span>
          <span className="sm:hidden">Tap to select files</span>
        </p>
        <p className="text-xs sm:text-sm text-zinc-400 mb-3 sm:mb-4 px-2">
          <span className="hidden sm:inline">Supports video and audio files. Filename must match: PROJECTCODE-EP###-TYPE-NAME.ext</span>
          <span className="sm:hidden">Video & audio files supported</span>
        </p>
        <Button variant="outline" type="button" size="sm" className="sm:size-default" onClick={(e) => { e.stopPropagation(); handleClick(); }}>
          Select Files
        </Button>
      </div>

      {/* File List with Progress */}
      {files.length > 0 && (
        <Card className="glass border-zinc-800/50">
          <CardContent className="p-4">
            <div className="space-y-3">
              {files.map((uploadFile) => (
                <motion.div
                  key={uploadFile.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "p-4 rounded-lg border transition-colors",
                    uploadFile.status === "success"
                      ? "bg-green-500/5 border-green-500/20"
                      : uploadFile.status === "failed"
                      ? "bg-orange-500/5 border-orange-500/20"
                      : uploadFile.status === "error"
                      ? "bg-red-500/5 border-red-500/20"
                      : uploadFile.status === "processing"
                      ? "bg-purple-500/5 border-purple-500/20"
                      : "bg-zinc-900/50 border-zinc-800/50"
                  )}
                >
                  <div className="flex items-center gap-3 mb-3">
                    {getFileIcon(uploadFile.file.name)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">
                        {uploadFile.file.name}
                      </p>
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-zinc-400">
                          {formatFileSize(uploadFile.file.size)}
                        </p>
                        <span className="text-xs text-zinc-500">•</span>
                        <p className={cn(
                          "text-xs",
                          uploadFile.status === "success" ? "text-green-400" :
                          uploadFile.status === "failed" ? "text-orange-400" :
                          uploadFile.status === "error" ? "text-red-400" :
                          uploadFile.status === "processing" ? "text-purple-400" :
                          "text-zinc-400"
                        )}>
                          {getStatusText(uploadFile.status)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusIcon(uploadFile.status)}
                      {uploadFile.status !== "uploading" && uploadFile.status !== "processing" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeFile(uploadFile.id)}
                          className="h-8 w-8 p-0 text-zinc-400 hover:text-red-400"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Upload Progress */}
                  {uploadFile.status === "uploading" && (
                    <div className="space-y-1">
                      <Progress value={uploadFile.progress} className="h-2" />
                      <p className="text-xs text-zinc-400 text-right">
                        {uploadFile.progress}%
                      </p>
                    </div>
                  )}

                  {/* Processing Animation */}
                  {uploadFile.status === "processing" && (
                    <div className="flex items-center gap-2 p-2 rounded bg-purple-500/10">
                      <Sparkles className="h-4 w-4 text-purple-400 animate-pulse" />
                      <p className="text-xs text-purple-300">
                        Running AI Quality Control analysis...
                      </p>
                    </div>
                  )}

                  {/* QC Result Details */}
                  {uploadFile.qcResult && (uploadFile.status === "success" || uploadFile.status === "failed") && (
                    <div className="mt-3 space-y-2">
                      {/* Confidence Score */}
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-zinc-400">Confidence Score</span>
                        <span className={cn(
                          "font-medium",
                          uploadFile.qcResult.confidence >= 90 ? "text-green-400" :
                          uploadFile.qcResult.confidence >= 75 ? "text-yellow-400" :
                          "text-orange-400"
                        )}>
                          {uploadFile.qcResult.confidence}%
                        </span>
                      </div>

                      {/* Errors */}
                      {uploadFile.qcResult.errors.length > 0 && (
                        <div className="space-y-1.5">
                          <p className="text-xs font-medium text-zinc-300">Issues Found:</p>
                          {uploadFile.qcResult.errors.map((error, idx) => (
                            <div
                              key={idx}
                              className="flex items-start gap-2 p-2 rounded bg-zinc-900/50"
                            >
                              <span className={cn(
                                "text-xs px-1.5 py-0.5 rounded border shrink-0",
                                getSeverityBadgeClass(error.severity)
                              )}>
                                {error.severity.toUpperCase()}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-white">
                                  {error.type}
                                </p>
                                <p className="text-xs text-zinc-400 truncate">
                                  {error.description}
                                  {error.timecode && ` at ${error.timecode}`}
                                </p>
                                {error.expectedValue && error.actualValue && (
                                  <p className="text-xs text-zinc-500">
                                    Expected: {error.expectedValue}, Got: {error.actualValue}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Warnings */}
                      {uploadFile.qcResult.warnings.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-zinc-400">Warnings:</p>
                          {uploadFile.qcResult.warnings.map((warning, idx) => (
                            <p key={idx} className="text-xs text-yellow-400/70">
                              ⚠ {warning.type}: {warning.description}
                            </p>
                          ))}
                        </div>
                      )}

                      {/* Success Message */}
                      {uploadFile.qcResult.status === "passed" && uploadFile.qcResult.errors.length === 0 && (
                        <div className="flex items-center gap-2 p-2 rounded bg-green-500/10">
                          <CheckCircle2 className="h-4 w-4 text-green-400" />
                          <p className="text-xs text-green-300">
                            All quality checks passed. File is ready for delivery.
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Upload Error */}
                  {uploadFile.status === "error" && uploadFile.error && (
                    <p className="text-xs text-red-400 mt-2">{uploadFile.error}</p>
                  )}
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
