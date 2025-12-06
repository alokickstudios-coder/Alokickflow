"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  X,
  FileVideo,
  FileText,
  Loader2,
  Lightbulb,
  Link as LinkIcon,
  CheckCircle2,
  AlertCircle,
  Pause,
  Play,
  ExternalLink,
  Download,
  MoreVertical,
  Trash2,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/lib/supabase/client";

interface FileWithProgress extends File {
  preview?: string;
  progress?: number;
  status?: "pending" | "uploading" | "queued" | "processing" | "analyzing" | "complete" | "needs_review" | "error" | "paused";
  result?: any;
  summary?: any;
  id?: string;
  deliveryId?: string; // Link to delivery record or QC job ID
  jobId?: string; // QC job ID (preferred)
  error?: string; // Error message if failed
  driveLink?: string; // Google Drive link if from Drive
  driveFileId?: string; // Google Drive file ID for direct access
  storagePath?: string; // Supabase storage path for downloads
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
  const [driveUrl, setDriveUrl] = useState("");
  const [processingDriveUrl, setProcessingDriveUrl] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
    const validVideoTypes = [
      "video/mp4",
      "video/quicktime",
      "video/x-msvideo",
      "video/webm",
      "video/x-matroska",
    ];
    const validExtensions = [".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v", ".srt", ".vtt"];

    const extension = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
    return validVideoTypes.includes(file.type) || validExtensions.includes(extension);
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
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
          ...newFiles.map((f, idx) =>
            Object.assign(f, {
              status: "pending" as const,
              progress: 0,
              id: `${Date.now()}-${idx}`,
            })
          ),
        ]);
      }
    },
    [toast]
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files).filter(validateFile);
      // Create wrapper objects - File properties are read-only, so we add metadata
      const filesWithProgress: FileWithProgress[] = newFiles.map((f, idx) => {
        const fileId = `${Date.now()}-${idx}`;
        const fileWithProgress = f as FileWithProgress;
        
        // Add metadata properties
        Object.defineProperty(fileWithProgress, 'status', {
          value: "pending" as const,
          writable: true,
          enumerable: true,
          configurable: true,
        });
        Object.defineProperty(fileWithProgress, 'progress', {
          value: 0,
          writable: true,
          enumerable: true,
          configurable: true,
        });
        Object.defineProperty(fileWithProgress, 'id', {
          value: fileId,
          writable: true,
          enumerable: true,
          configurable: true,
        });
        
        return fileWithProgress;
      });

      setFiles((prev) => [...prev, ...filesWithProgress]);
    }
    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleDriveUrl = async () => {
    if (!driveUrl.trim()) {
      toast({
        title: "URL required",
        description: "Please enter a Google Drive link",
        variant: "destructive",
      });
      return;
    }

    setProcessingDriveUrl(true);

    try {
      // Extract file ID from Drive URL (supports multiple formats)
      const driveIdMatch = driveUrl.match(/\/d\/([a-zA-Z0-9_-]+)/) || 
                          driveUrl.match(/id=([a-zA-Z0-9_-]+)/) ||
                          driveUrl.match(/([a-zA-Z0-9_-]{25,})/); // Direct file ID
      
      if (!driveIdMatch) {
        throw new Error("Invalid Google Drive link format. Please use a shareable Google Drive link.");
      }

      const fileId = driveIdMatch[1];
      const fullDriveUrl = `https://drive.google.com/file/d/${fileId}/view`;

      // Get file metadata from Drive (optional - just for display)
      // If this fails, we'll still add the link and let the backend handle it
      let fileName = `Drive File ${fileId}`;
      let fileSize = 0;
      
      try {
        // Fetch access token from our API endpoint (client-safe)
        const tokenResponse = await fetch("/api/google/auth");
        let accessToken: string | null = null;
        
        if (tokenResponse.ok) {
          const tokenData = await tokenResponse.json();
          accessToken = tokenData.accessToken;
        }

        if (accessToken) {
          // Fetch file metadata from Google Drive API
          const metaResponse = await fetch(
            `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,mimeType,size`,
            {
              headers: { Authorization: `Bearer ${accessToken}` },
            }
          );

          if (metaResponse.ok) {
            const metadata = await metaResponse.json();
            fileName = metadata.name || fileName;
            fileSize = parseInt(metadata.size || "0", 10);
          }
        }
      } catch (metaError) {
        // Metadata fetch failed - that's OK, we'll still process the link
        console.warn("[BulkQCUpload] Could not fetch Drive file metadata:", metaError);
      }

      // Create a File-like object for the UI (NO ACTUAL DOWNLOAD!)
      // This is just for display - the backend will access Drive directly
      const file = new File([], fileName, {
        type: "video/mp4", // Default type, will be detected by backend
      });
      
      // Set file size if we got it
      if (fileSize > 0) {
        Object.defineProperty(file, 'size', {
          value: fileSize,
          writable: false,
          enumerable: true,
          configurable: true,
        });
      }

      if (!validateFile(file)) {
        throw new Error("File type not supported. Only video and subtitle files are allowed.");
      }

      // Create a wrapper object - File properties are read-only, so we need to preserve the File
      // and add metadata as non-enumerable properties
      const fileProgressId = `${Date.now()}-drive`;
      const fileWithProgress = file as FileWithProgress;
      
      // Add metadata properties (these will be on the object but File methods still work)
      Object.defineProperty(fileWithProgress, 'status', {
        value: "pending" as const,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      Object.defineProperty(fileWithProgress, 'progress', {
        value: 0,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      Object.defineProperty(fileWithProgress, 'id', {
        value: fileProgressId,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      Object.defineProperty(fileWithProgress, 'driveLink', {
        value: fullDriveUrl, // Store full Drive link (standardized format)
        writable: true,
        enumerable: true,
        configurable: true,
      });
      Object.defineProperty(fileWithProgress, 'driveFileId', {
        value: fileId, // Store the extracted file ID for direct access
        writable: true,
        enumerable: true,
        configurable: true,
      });

      setFiles((prev) => [...prev, fileWithProgress]);

      setDriveUrl("");
      toast({
        title: "File added",
        description: `${fileName} added from Google Drive. No upload needed - QC will process directly from Drive!`,
        variant: "success",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load file from Google Drive",
        variant: "destructive",
      });
    } finally {
      setProcessingDriveUrl(false);
    }
  };

  const removeFile = async (id: string) => {
    const file = files.find((f) => f.id === id);
    
    if (!file) {
      return;
    }

    // If file has a job ID and is queued/running/analyzing, cancel it first
    if (file.jobId && (file.status === "queued" || file.status === "processing" || file.status === "analyzing" || file.status === "uploading")) {
      try {
        const response = await fetch("/api/qc/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobIds: [file.jobId] }),
        });

        if (response.ok) {
          const data = await response.json();
          toast({
            title: "Job cancelled",
            description: `${file.name} processing has been cancelled.`,
            variant: "default",
          });
        } else {
          const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
          console.warn("[BulkQCUpload] Failed to cancel job:", errorData);
          // Still remove from UI even if cancel fails
        }
      } catch (error) {
        console.error("[BulkQCUpload] Error cancelling job:", error);
        // Continue to remove from UI even if cancel fails
      }
    }

    // Remove from UI immediately
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const cancelAllFiles = async () => {
    const filesToCancel = files.filter(
      (f) => f.jobId && (f.status === "queued" || f.status === "processing" || f.status === "analyzing")
    );

    if (filesToCancel.length === 0) {
      // No active jobs, just clear all files
      setFiles([]);
      return;
    }

    try {
      const jobIds = filesToCancel.map((f) => f.jobId!).filter(Boolean);
      const response = await fetch("/api/qc/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobIds }),
      });

      if (response.ok) {
        toast({
          title: "All jobs cancelled",
          description: `${jobIds.length} processing job(s) have been cancelled.`,
          variant: "default",
        });
      } else {
        const errorData = await response.json();
        toast({
          title: "Cancellation failed",
          description: errorData.error || "Failed to cancel some jobs",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("[BulkQCUpload] Error cancelling all jobs:", error);
      toast({
        title: "Error",
        description: "Failed to cancel jobs",
        variant: "destructive",
      });
    }

    // Clear all files from UI
    setFiles([]);
  };

  // Pause a job (mark as paused in UI, cancel on backend)
  const pauseFile = async (id: string) => {
    const file = files.find((f) => f.id === id);
    if (!file) return;

    // If job is queued or processing, cancel it on the backend
    if (file.jobId && (file.status === "queued" || file.status === "processing" || file.status === "analyzing")) {
      try {
        await fetch("/api/qc/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobIds: [file.jobId] }),
        });
      } catch (error) {
        console.error("[BulkQCUpload] Error pausing job:", error);
      }
    }

    // Mark as paused in UI
    setFiles((prev) =>
      prev.map((f) =>
        f.id === id ? { ...f, status: "paused" as const } : f
      )
    );

    toast({
      title: "Job paused",
      description: `${file.name} has been paused.`,
      variant: "default",
    });
  };

  // Resume a paused job (re-queue it)
  const resumeFile = async (id: string) => {
    const file = files.find((f) => f.id === id);
    if (!file || file.status !== "paused") return;

    // Mark as pending to re-queue
    setFiles((prev) =>
      prev.map((f) =>
        f.id === id ? { ...f, status: "pending" as const, jobId: undefined, deliveryId: undefined } : f
      )
    );

    toast({
      title: "Job resumed",
      description: `${file.name} has been queued for processing. Click "Start QC Analysis" to begin.`,
      variant: "default",
    });
  };

  // Open file in Google Drive
  const openInDrive = (file: FileWithProgress) => {
    if (file.driveLink) {
      window.open(file.driveLink, "_blank");
    } else if (file.driveFileId) {
      window.open(`https://drive.google.com/file/d/${file.driveFileId}/view`, "_blank");
    } else {
      toast({
        title: "Cannot open in Drive",
        description: "This file is not from Google Drive.",
        variant: "destructive",
      });
    }
  };

  // Download file (from Supabase Storage or Google Drive)
  const downloadFile = async (file: FileWithProgress) => {
    try {
      if (file.driveLink || file.driveFileId) {
        // For Google Drive files, open the download link
        const fileId = file.driveFileId || extractDriveFileId(file.driveLink || "");
        if (fileId) {
          // Try to get direct download link
          window.open(`https://drive.google.com/uc?export=download&id=${fileId}`, "_blank");
        } else {
          toast({
            title: "Download failed",
            description: "Could not extract file ID from Drive link.",
            variant: "destructive",
          });
        }
      } else if (file.storagePath) {
        // For Supabase Storage files
        const { data, error } = await supabase.storage
          .from("deliveries")
          .createSignedUrl(file.storagePath, 3600); // 1 hour expiry

        if (error) throw error;
        if (data?.signedUrl) {
          // Create a download link
          const a = document.createElement("a");
          a.href = data.signedUrl;
          a.download = file.name || "download";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }
      } else {
        // For local files that haven't been uploaded yet
        if (file.size > 0) {
          const url = URL.createObjectURL(file);
          const a = document.createElement("a");
          a.href = url;
          a.download = file.name || "download";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        } else {
          toast({
            title: "Download not available",
            description: "This file cannot be downloaded.",
            variant: "destructive",
          });
        }
      }
    } catch (error: any) {
      console.error("[BulkQCUpload] Download error:", error);
      toast({
        title: "Download failed",
        description: error.message || "Failed to download file.",
        variant: "destructive",
      });
    }
  };

  // Extract Drive file ID from URL
  const extractDriveFileId = (url: string): string | null => {
    const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || 
                  url.match(/id=([a-zA-Z0-9_-]+)/) ||
                  url.match(/([a-zA-Z0-9_-]{25,})/);
    return match ? match[1] : null;
  };

  // View QC results for a completed file
  const viewResults = (file: FileWithProgress) => {
    if (file.result || file.summary) {
      // Show results in a modal or navigate to results page
      toast({
        title: "QC Results",
        description: `Score: ${file.summary?.score || 0}/100. ${file.summary?.passed ? "Passed" : "Needs Review"}`,
        variant: file.summary?.passed ? "success" : "default",
      });
    } else {
      toast({
        title: "No results",
        description: "QC results are not available yet.",
        variant: "default",
      });
    }
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
    setOverallProgress(5); // Initial progress

    const filesToUpload = files.filter(
      (f) => f.status === "pending" || f.status === "paused"
    );

    // Separate Drive links from file uploads
    const driveLinks: string[] = [];
    const fileUploads: File[] = [];

    filesToUpload.forEach((file) => {
      // Check if this is a Drive link (has driveLink property)
      if ((file as FileWithProgress).driveLink) {
        driveLinks.push((file as FileWithProgress).driveLink!);
      } else {
        // Regular file upload
        fileUploads.push(file);
      }
    });

    // Update status for files - Drive links skip upload entirely
    setFiles((prev) =>
      prev.map((f) => {
        if (f.status === "pending") {
          const hasDriveLink = (f as FileWithProgress).driveLink;
          if (hasDriveLink) {
            // Drive links: skip upload, go straight to queued
            return { ...f, status: "queued", progress: 10 };
          } else {
            // Regular file uploads
            return { ...f, status: "uploading", progress: 10 };
          }
        }
        return f;
      })
    );

    try {
      // If we have Drive links, use JSON body (no upload needed!)
      if (driveLinks.length > 0 && fileUploads.length === 0) {
        // All files are from Drive - send links directly, NO UPLOAD
        const response = await fetch("/api/qc/start", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            driveLinks: driveLinks,
            projectId: projectId,
            useAI: useAI,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to start QC");
        }

        const data = await response.json();

        // Handle response
        if (!data || !Array.isArray(data.jobs)) {
          throw new Error(data.error || data.message || "Invalid response from server");
        }
        
        // Show toast
        if (data.jobs.length > 0) {
          toast({
            title: "QC Jobs Queued",
            description: `${data.jobs.length} file(s) queued for processing directly from Google Drive.${data.errors?.length ? ` ${data.errors.length} failed.` : ""}`,
            variant: data.errors?.length ? "default" : "success",
          });
        } else if (data.errors && data.errors.length > 0) {
          toast({
            title: "QC Failed",
            description: data.message || `All ${data.errors.length} file(s) failed to process`,
            variant: "destructive",
          });
        }

        // Update files with job IDs
        setFiles((prev) => {
          const newFiles = [...prev];
          
          if (data.jobs && data.jobs.length > 0) {
            data.jobs.forEach((job: { id: string; fileName: string; status: string }) => {
              const fileIndex = newFiles.findIndex(f => 
                (f as FileWithProgress).driveLink && 
                (f as FileWithProgress).driveLink!.includes(job.fileName) ||
                f.name?.toLowerCase() === job.fileName?.toLowerCase()
              );
              if (fileIndex !== -1) {
              newFiles[fileIndex].status = "queued";
              newFiles[fileIndex].jobId = job.id; // Store job ID for cancellation
              newFiles[fileIndex].deliveryId = job.id; // Also store in deliveryId for compatibility
              newFiles[fileIndex].progress = 10;
              }
            });
          }
          
          // Mark errors
          if (data.errors && Array.isArray(data.errors) && data.errors.length > 0) {
            data.errors.forEach((err: { fileName: string; error: string }) => {
              const fileIndex = newFiles.findIndex(f => 
                (f as FileWithProgress).driveLink?.includes(err.fileName) ||
                f.name?.toLowerCase() === err.fileName?.toLowerCase()
              );
              if (fileIndex !== -1) {
                newFiles[fileIndex].status = "error";
                newFiles[fileIndex].error = err.error || "Processing failed";
                newFiles[fileIndex].progress = 0;
              }
            });
          }
          
          return newFiles;
        });

        setOverallProgress(10);
        
        // Start polling for job status
        const jobIds = data.jobs.map((j: any) => j.id);
        if (jobIds.length > 0) {
          startPollingJobStatus(jobIds);
        } else {
          setUploading(false);
        }

        return; // Exit early - Drive links processed, no upload needed
      }

      // Handle mixed or file-only uploads
      const formData = new FormData();
      fileUploads.forEach((file) => {
        formData.append("files", file);
      });
      
      // Also include Drive links if any
      if (driveLinks.length > 0) {
        driveLinks.forEach((link) => {
          formData.append("driveLinks", link);
        });
      }
      
      formData.append("useAI", String(useAI));
      if (projectId) {
        formData.append("projectId", projectId);
      }

      // Use new queue-based endpoint
      const endpoint = "/api/qc/start";

      const response = await fetch(endpoint, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to start QC");
      }

      const data = await response.json();

      // Handle response - jobs array might be empty if all failed
      if (!data || !Array.isArray(data.jobs)) {
        throw new Error(data.error || data.message || "Invalid response from server");
      }
      
      // Show appropriate toast based on results
      if (data.jobs.length > 0) {
        toast({
          title: "QC Jobs Queued",
          description: `${data.jobs.length} file(s) queued for processing.${data.errors?.length ? ` ${data.errors.length} failed.` : ""}`,
          variant: data.errors?.length ? "default" : "success",
        });
      } else if (data.errors && data.errors.length > 0) {
        // All files failed
        toast({
          title: "Upload Failed",
          description: data.message || `All ${data.errors.length} file(s) failed to process`,
          variant: "destructive",
        });
      } else {
        throw new Error("No files were processed");
      }

      // Update files with job IDs and set status to queued
      setFiles((prev) => {
        const newFiles = [...prev];
        
        // Update successful jobs
        if (data.jobs && data.jobs.length > 0) {
          data.jobs.forEach((job: { id: string; fileName: string; status: string }) => {
            // Try to find file by name (case-insensitive)
            const fileIndex = newFiles.findIndex(f => 
              f.name?.toLowerCase() === job.fileName?.toLowerCase()
            );
            if (fileIndex !== -1) {
              newFiles[fileIndex].status = "queued";
              newFiles[fileIndex].deliveryId = job.id; // Store job ID in deliveryId field for now
              newFiles[fileIndex].progress = 10;
            }
          });
        }
        
        // Mark files with errors
        if (data.errors && Array.isArray(data.errors) && data.errors.length > 0) {
          data.errors.forEach((err: { fileName: string; error: string }) => {
            // Try to find file by name (case-insensitive)
            const fileIndex = newFiles.findIndex(f => 
              f.name?.toLowerCase() === err.fileName?.toLowerCase()
            );
            if (fileIndex !== -1) {
              newFiles[fileIndex].status = "error";
              newFiles[fileIndex].error = err.error || "Upload failed";
              newFiles[fileIndex].progress = 0;
            } else {
              // If file not found by name, mark all pending files as error
              // This handles cases where fileName doesn't match exactly
              newFiles.forEach((f, idx) => {
                if (f.status === "uploading" || f.status === "pending") {
                  newFiles[idx].status = "error";
                  newFiles[idx].error = err.error || "Upload failed";
                  newFiles[idx].progress = 0;
                }
              });
            }
          });
        }
        
        return newFiles;
      });

      setOverallProgress(10);
      
      // Start polling for job status
      const jobIds = data.jobs.map((j: any) => j.id);
      if (jobIds.length > 0) {
        startPollingJobStatus(jobIds);
      } else {
        // No jobs created, stop uploading state
        setUploading(false);
      }

    } catch (error: any) {
      setUploading(false);
      setFiles((prev) =>
        prev.map((f) =>
          f.status === "uploading" ? { ...f, status: "error", error: error.message } : f
        )
      );
      toast({
        title: "Upload Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Poll job status from qc_jobs table
  const startPollingJobStatus = (jobIds: string[]) => {
    let intervalId: NodeJS.Timeout;
    let pollCount = 0;
    const maxPolls = 300; // 10 minutes max (300 * 2s)

    const poll = async () => {
      pollCount++;
      
      try {
        const jobIdsParam = jobIds.join(",");
        const response = await fetch(`/api/qc/job-status?jobIds=${jobIdsParam}`);
        
        if (!response.ok) {
          console.error("[BulkQCUpload] Polling error:", response.statusText);
          return;
        }

        const data = await response.json();
        if (!data.success || !data.jobs) {
          return;
        }

        // Update files based on job status
        setFiles((prev) => {
          return prev.map((f) => {
            // Try to find job by jobId first, then deliveryId
            const job = data.jobs.find((j: any) => j.id === f.jobId || j.id === f.deliveryId);
            if (!job) {
              return f; // Job not found yet, keep current state
            }
            
            // Update jobId if we found it via deliveryId
            if (!f.jobId && job.id) {
              (f as any).jobId = job.id;
            }

            let newStatus: typeof f.status = f.status;
            let newProgress = f.progress || 0;

            if (job.status === "queued") {
              newStatus = "queued";
              // Progress slowly increases while queued (5-15%)
              newProgress = Math.min((f.progress || 5) + 1, 15);
            } else if (job.status === "running") {
              newStatus = "processing";
              // More realistic progress simulation (15-95%)
              // Use job.progress if available from backend, otherwise simulate
              if (job.progress !== undefined) {
                newProgress = Math.max(15, Math.min(job.progress, 95));
              } else {
                // Simulate progress based on poll count - increases faster at start, slower towards end
                const currentProgress = f.progress || 15;
                const increment = currentProgress < 50 ? 5 : currentProgress < 80 ? 3 : 1;
                newProgress = Math.min(currentProgress + increment, 95);
              }
            } else if (job.status === "analyzing") {
              newStatus = "analyzing";
              // AI Analysis phase (70-95%)
              const currentProgress = f.progress || 70;
              newProgress = Math.min(currentProgress + 2, 95);
            } else if (job.status === "completed") {
              // Job completed - check QC result
              const hasResult = job.result && Object.keys(job.result).length > 0;
              if (hasResult) {
                // QC analysis completed, determine final status
                const qcStatus = job.summary?.status || "needs_review";
                newStatus = qcStatus === "passed" ? "complete" : 
                           qcStatus === "failed" ? "error" : "needs_review";
              } else {
                // Job completed but no result yet (shouldn't happen, but handle gracefully)
                newStatus = "processing";
                newProgress = 95;
              }
              newProgress = 100;
              // Store result for display
              if (job.result) {
                (f as any).result = job.result;
              }
              if (job.summary) {
                (f as any).summary = job.summary;
              }
            } else if (job.status === "failed") {
              newStatus = "error";
              newProgress = 0;
            } else if (job.status === "cancelled") {
              // Job was cancelled - remove from UI immediately
              return null; // This will filter out the file
            }

            return {
              ...f,
              status: newStatus,
              progress: newProgress,
              error: job.error || f.error,
            };
          }).filter((f): f is FileWithProgress => f !== null); // Remove cancelled files
        });

        // Check if all jobs are complete
        const allComplete = data.jobs.every((j: any) => 
          j.status === "completed" || j.status === "failed"
        );

        if (allComplete) {
          clearInterval(intervalId);
          setOverallProgress(100);
          setUploading(false);
          
          const completedCount = data.jobs.filter((j: any) => j.status === "completed").length;
          const failedCount = data.jobs.filter((j: any) => j.status === "failed").length;
          
          toast({
            title: "QC Complete",
            description: `${completedCount} of ${data.jobs.length} file(s) processed successfully.${failedCount > 0 ? ` ${failedCount} failed.` : ""}`,
            variant: completedCount === data.jobs.length ? "success" : "default",
          });
          
          onUploadComplete?.();
        } else {
          // Update overall progress based on job statuses
          const completedCount = data.jobs.filter((j: any) => 
            j.status === "completed" || j.status === "failed"
          ).length;
          const progress = 10 + Math.floor((completedCount / data.jobs.length) * 90);
          setOverallProgress(progress);
        }
      } catch (error) {
        console.error("[BulkQCUpload] Polling error:", error);
      }

      // Stop after max polls
      if (pollCount >= maxPolls) {
        clearInterval(intervalId);
        setUploading(false);
        console.log("[BulkQCUpload] Max polls reached");
      }
    };

    // Start polling immediately, then every 2 seconds
    poll();
    intervalId = setInterval(poll, 2000);

    // Store interval ID for cleanup (component will handle cleanup on unmount)
  };

  const startPollingForResults = (processingFiles: FileWithProgress[]) => {
    let intervalId: NodeJS.Timeout;
    let pollCount = 0;
    const maxPolls = 600; // 20 minutes max polling time (600 * 2s)

    const poll = async () => {
      pollCount++;
      let stillProcessingCount = 0;

      const updatedFiles = await Promise.all(
        files.map(async (file) => {
          if (file.status !== "processing" || !file.deliveryId) {
            if(file.status === "processing"){
              stillProcessingCount++;
            }
            return file;
          }

          try {
            const res = await fetch(`/api/qc/ai-analyze?deliveryId=${file.deliveryId}`);
            if (!res.ok) {
              // Don't mark as error immediately, could be a temp server issue
              stillProcessingCount++;
              return file;
            }

            const data = await res.json();
            
            if (data.status === "qc_passed" || data.status === "qc_failed" || data.status === "needs_review") {
              return {
                ...file,
                status: data.status === "qc_passed" ? "complete" : "error",
                progress: 100,
                result: data.qcReport,
                error: data.status !== "qc_passed" ? (data.qcReport?.summary || "QC failed") : undefined
              };
            } else {
              // Still processing
              stillProcessingCount++;
              return { ...file, progress: Math.min((file.progress || 20) + 2, 95) };
            }
          } catch (e) {
            stillProcessingCount++;
            return file; // Keep original file state on fetch error
          }
        })
      );
      
      setFiles(updatedFiles as FileWithProgress[]);
      
      const completedCount = updatedFiles.length - stillProcessingCount;
      const progress = 20 + Math.floor((completedCount / updatedFiles.length) * 80);
      setOverallProgress(progress);

      if (stillProcessingCount === 0 || pollCount >= maxPolls) {
        setUploading(false);
        clearInterval(intervalId);
        onUploadComplete?.();
        toast({
          title: "QC Process Finished",
          description: `Analysis for all files has concluded.`
        });
      }
    };

    intervalId = setInterval(poll, 2000);
  };

  const getFileIcon = (file: File | FileWithProgress) => {
    if (!file || !file.name) {
      return <FileVideo className="h-5 w-5 text-purple-400" />;
    }
    if (file.name.endsWith(".srt") || file.name.endsWith(".vtt")) {
      return <FileText className="h-5 w-5 text-blue-400" />;
    }
    return <FileVideo className="h-5 w-5 text-purple-400" />;
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes || bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  const pendingFiles = files.filter((f) => f.status === "pending" || f.status === "paused" || !f.status);

  return (
    <div className="space-y-6">
      {/* AI Toggle - Minimal design */}
      <div className="flex items-center justify-between p-5 rounded-2xl bg-gradient-to-r from-purple-500/10 via-purple-600/5 to-purple-500/10 border border-purple-500/20 backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-purple-500/20 flex items-center justify-center backdrop-blur-sm">
            <Lightbulb className="h-6 w-6 text-purple-400" />
          </div>
          <div>
            <p className="font-medium text-white text-base">Alokick AI Analysis</p>
            <p className="text-xs text-zinc-400 font-light">AI-powered QC by AlokickFlow</p>
          </div>
        </div>
        <button
          onClick={() => setUseAI(!useAI)}
          className={cn(
            "relative h-7 w-12 rounded-full transition-all duration-200",
            useAI ? "bg-purple-500" : "bg-zinc-700/50"
          )}
          aria-label="Toggle Alokick AI Analysis"
        >
          <span
            className={cn(
              "absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow-lg transition-transform duration-200",
              useAI && "translate-x-5"
            )}
          />
        </button>
      </div>

      {/* Upload Tabs */}
      <Tabs defaultValue="upload" className="w-full">
        <TabsList className="grid w-full grid-cols-2 bg-zinc-900/50 border border-zinc-800/50">
          <TabsTrigger value="upload" className="data-[state=active]:bg-zinc-800">
            Upload Files
          </TabsTrigger>
          <TabsTrigger value="drive" className="data-[state=active]:bg-zinc-800">
            Google Drive
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="mt-6">
          {/* Drop Zone - Apple-like spacious design */}
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "relative border-2 border-dashed rounded-2xl p-16 text-center transition-all duration-200 cursor-pointer group",
              dragActive
                ? "border-purple-500/50 bg-purple-500/5 scale-[1.01]"
                : "border-zinc-800/50 bg-zinc-900/20 hover:border-zinc-700/50 hover:bg-zinc-900/30"
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="video/*,.srt,.vtt"
              onChange={handleFileInput}
              className="hidden"
            />
            <div className="space-y-4">
              <div className="h-20 w-20 rounded-2xl bg-zinc-800/50 flex items-center justify-center mx-auto group-hover:bg-zinc-800/70 transition-colors">
                <Upload className="h-10 w-10 text-zinc-400 group-hover:text-purple-400 transition-colors" />
              </div>
              <div>
                <p className="text-white font-medium text-lg mb-2">
                  Drag and drop files here, or click to select
                </p>
                <p className="text-sm text-zinc-400 font-light">
                  Supports video files (MP4, MOV, MKV, etc.) and subtitle files (SRT, VTT)
                </p>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="drive" className="mt-6">
          <Card className="border-zinc-800/50 bg-zinc-900/20 backdrop-blur-xl">
            <CardContent className="p-6">
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-white mb-2 block">
                    Google Drive Link
                  </label>
                  <div className="flex gap-2">
                    <Input
                      type="url"
                      placeholder="https://drive.google.com/file/d/..."
                      value={driveUrl}
                      onChange={(e) => setDriveUrl(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleDriveUrl()}
                      className="bg-zinc-900/50 border-zinc-800/50"
                    />
                    <Button
                      onClick={handleDriveUrl}
                      disabled={processingDriveUrl || !driveUrl.trim()}
                    >
                      {processingDriveUrl ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <LinkIcon className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-zinc-500 mt-2">
                    Paste a Google Drive file link to add it to your upload queue
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Overall Progress */}
      <AnimatePresence>
        {uploading && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <Card className="border-zinc-800/50 bg-zinc-900/20 backdrop-blur-xl">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <Loader2 className="h-5 w-5 text-purple-400 animate-spin" />
                  <span className="text-sm font-medium text-white">
                    {useAI ? "AI Analysis in Progress" : "Processing Files"}
                  </span>
                  <span className="text-sm text-zinc-400 ml-auto">{overallProgress}%</span>
                </div>
                <Progress value={overallProgress} className="h-1.5" />
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* File List - Clean, minimal */}
      <AnimatePresence>
        {files.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <Card className="border-zinc-800/50 bg-zinc-900/20 backdrop-blur-xl">
              <CardContent className="p-5">
                <div className="space-y-3">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-medium text-white">
                      {files.length} file{files.length > 1 ? "s" : ""} selected
                    </h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={cancelAllFiles}
                      className="text-zinc-400 hover:text-white h-8"
                      disabled={uploading && files.every(f => f.status === "complete" || f.status === "error" || f.status === "needs_review")}
                    >
                      {uploading ? "Cancel All" : "Clear All"}
                    </Button>
                  </div>
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {files
                      .filter((file) => file && file.id)
                      .map((file) => (
                        <motion.div
                          key={file.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="flex items-center gap-4 p-3 rounded-xl bg-zinc-800/30 border border-zinc-800/50 hover:bg-zinc-800/40 transition-colors"
                        >
                        {getFileIcon(file)}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white truncate">
                            {(file as FileWithProgress).driveLink 
                              ? `📁 ${file.name || "Google Drive File"}` 
                              : file.name || "Unknown file"}
                          </p>
                          <div className="flex items-center gap-3 mt-1">
                            <p className="text-xs text-zinc-400">
                              {(file as FileWithProgress).driveLink 
                                ? (file.size > 0 ? formatFileSize(file.size) : "Google Drive")
                                : formatFileSize(file.size || 0)}
                            </p>
                            {file.status && file.status !== "pending" && (
                              <div className="flex items-center gap-1.5">
                                {file.status === "complete" ? (
                                  <CheckCircle2 className="h-3 w-3 text-green-400" />
                                ) : file.status === "error" ? (
                                  <AlertCircle className="h-3 w-3 text-red-400" />
                                ) : file.status === "needs_review" ? (
                                  <AlertCircle className="h-3 w-3 text-yellow-400" />
                                ) : file.status === "paused" ? (
                                  <Pause className="h-3 w-3 text-orange-400" />
                                ) : (
                                  <Loader2 className="h-3 w-3 text-purple-400 animate-spin" />
                                )}
                                <span
                                  className={cn(
                                    "text-xs",
                                    file.status === "complete"
                                      ? "text-green-400"
                                      : file.status === "error"
                                      ? "text-red-400"
                                      : file.status === "needs_review"
                                      ? "text-yellow-400"
                                      : file.status === "paused"
                                      ? "text-orange-400"
                                      : "text-purple-400"
                                  )}
                                >
                                  {file.status === "analyzing"
                                    ? "Analyzing..."
                                    : file.status === "uploading"
                                    ? "Uploading..."
                                    : file.status === "queued"
                                    ? "Queued"
                                    : file.status === "processing"
                                    ? "Processing..."
                                    : file.status === "complete"
                                    ? "Done ✓"
                                    : file.status === "needs_review"
                                    ? "Needs Review"
                                    : file.status === "error"
                                    ? "Failed"
                                    : file.status === "paused"
                                    ? "Paused"
                                    : file.status}
                                </span>
                                {file.summary && file.status === "complete" && (
                                  <span className="text-xs text-zinc-500 ml-1">
                                    (Score: {file.summary.score || 0}/100)
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                          {/* Enhanced Progress Bar - shows for all processing states */}
                          {(file.status === "queued" || file.status === "uploading" || file.status === "processing" || file.status === "analyzing") && (
                            <div className="mt-2 space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-zinc-500">
                                  {file.status === "queued" ? "Waiting in queue..." : 
                                   file.status === "uploading" ? "Uploading file..." :
                                   file.status === "analyzing" ? "AI analyzing..." : "Processing..."}
                                </span>
                                <span className="text-zinc-400 font-mono">
                                  {file.progress || 0}%
                                </span>
                              </div>
                              <div className="relative h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                                <div 
                                  className={cn(
                                    "h-full transition-all duration-500 ease-out rounded-full",
                                    file.status === "queued" ? "bg-zinc-600" :
                                    file.status === "analyzing" ? "bg-gradient-to-r from-purple-500 to-blue-500" :
                                    "bg-gradient-to-r from-blue-500 to-cyan-500"
                                  )}
                                  style={{ width: `${file.progress || 0}%` }}
                                />
                                {/* Animated shimmer effect */}
                                <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                              </div>
                            </div>
                          )}
                          {/* Show completion indicator for done status */}
                          {file.status === "complete" && (
                            <div className="mt-2 flex items-center gap-2">
                              <div className="h-2 w-full rounded-full bg-green-500/20">
                                <div className="h-full w-full rounded-full bg-green-500" />
                              </div>
                              <span className="text-xs text-green-400 font-medium whitespace-nowrap">Done</span>
                            </div>
                          )}
                          {/* Show paused indicator */}
                          {file.status === "paused" && (
                            <div className="mt-2 flex items-center gap-2">
                              <div className="h-2 w-full rounded-full bg-orange-500/20">
                                <div 
                                  className="h-full rounded-full bg-orange-500"
                                  style={{ width: `${file.progress || 0}%` }}
                                />
                              </div>
                              <span className="text-xs text-orange-400 font-medium whitespace-nowrap">{file.progress || 0}%</span>
                            </div>
                          )}
                          {file.error && file.status === "error" && (
                            <p className="text-xs text-red-400 mt-1 truncate" title={file.error}>
                              {file.error}
                            </p>
                          )}
                        </div>
                        {/* File Actions Dropdown */}
                        <div className="flex items-center gap-1">
                          {/* Quick action: Pause/Resume for active jobs */}
                          {(file.status === "queued" || file.status === "processing" || file.status === "analyzing") && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => file.id && pauseFile(file.id)}
                              className="h-8 w-8 p-0 text-zinc-400 hover:text-orange-400 transition-colors"
                              title="Pause processing"
                            >
                              <Pause className="h-4 w-4" />
                            </Button>
                          )}
                          {file.status === "paused" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => file.id && resumeFile(file.id)}
                              className="h-8 w-8 p-0 text-zinc-400 hover:text-green-400 transition-colors"
                              title="Resume processing"
                            >
                              <Play className="h-4 w-4" />
                            </Button>
                          )}
                          
                          {/* Actions Dropdown */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-zinc-400 hover:text-white transition-colors"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48 bg-zinc-900 border-zinc-700">
                              {/* View Results - only for completed files */}
                              {(file.status === "complete" || file.status === "needs_review") && (
                                <DropdownMenuItem
                                  onClick={() => viewResults(file)}
                                  className="text-zinc-300 hover:text-white hover:bg-zinc-800 cursor-pointer"
                                >
                                  <Eye className="h-4 w-4 mr-2" />
                                  View Results
                                </DropdownMenuItem>
                              )}
                              
                              {/* Open in Google Drive - only for Drive files */}
                              {(file.driveLink || file.driveFileId) && (
                                <DropdownMenuItem
                                  onClick={() => openInDrive(file)}
                                  className="text-zinc-300 hover:text-white hover:bg-zinc-800 cursor-pointer"
                                >
                                  <ExternalLink className="h-4 w-4 mr-2" />
                                  Open in Drive
                                </DropdownMenuItem>
                              )}
                              
                              {/* Download */}
                              <DropdownMenuItem
                                onClick={() => downloadFile(file)}
                                className="text-zinc-300 hover:text-white hover:bg-zinc-800 cursor-pointer"
                              >
                                <Download className="h-4 w-4 mr-2" />
                                Download
                              </DropdownMenuItem>
                              
                              <DropdownMenuSeparator className="bg-zinc-700" />
                              
                              {/* Pause/Resume */}
                              {(file.status === "queued" || file.status === "processing" || file.status === "analyzing") && (
                                <DropdownMenuItem
                                  onClick={() => file.id && pauseFile(file.id)}
                                  className="text-zinc-300 hover:text-orange-400 hover:bg-zinc-800 cursor-pointer"
                                >
                                  <Pause className="h-4 w-4 mr-2" />
                                  Pause Processing
                                </DropdownMenuItem>
                              )}
                              {file.status === "paused" && (
                                <DropdownMenuItem
                                  onClick={() => file.id && resumeFile(file.id)}
                                  className="text-zinc-300 hover:text-green-400 hover:bg-zinc-800 cursor-pointer"
                                >
                                  <Play className="h-4 w-4 mr-2" />
                                  Resume Processing
                                </DropdownMenuItem>
                              )}
                              
                              {/* Delete/Remove */}
                              <DropdownMenuItem
                                onClick={() => file.id && removeFile(file.id)}
                                className="text-red-400 hover:text-red-300 hover:bg-zinc-800 cursor-pointer"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                {file.jobId && (file.status === "queued" || file.status === "processing" || file.status === "analyzing")
                                  ? "Cancel & Remove"
                                  : "Remove"}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                  {pendingFiles.length > 0 && !uploading && (
                    <Button
                      onClick={handleUpload}
                      disabled={uploading}
                      className={cn(
                        "w-full mt-4 h-11 text-base font-medium",
                        useAI &&
                          "bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
                      )}
                    >
                      {useAI ? (
                        <>
                          <Lightbulb className="h-4 w-4 mr-2" />
                          Start AI QC Analysis
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4 mr-2" />
                          Start QC Analysis
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* QC Checks Info - Minimal */}
      <Card className="border-zinc-800/50 bg-zinc-900/20 backdrop-blur-xl">
        <CardContent className="p-6">
          <h4 className="text-sm font-medium text-white mb-4">QC Checks Performed</h4>
          <div className="grid grid-cols-2 gap-3 text-xs">
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
