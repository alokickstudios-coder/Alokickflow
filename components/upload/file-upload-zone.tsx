"use client";

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Upload, X, FileVideo, FileAudio, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface UploadFile {
  file: File;
  id: string;
  progress: number;
  status: "pending" | "uploading" | "success" | "error";
  error?: string;
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
        uploadFileToSupabase(uploadFile);
      });
    }
  };

  const uploadFileToSupabase = async (uploadFile: UploadFile) => {
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

      // Upload to Supabase Storage with progress tracking
      // Note: Supabase doesn't provide native progress callbacks, so we simulate it
      // For real progress, you'd need to use chunked uploads or a different approach
      const uploadPromise = supabase.storage
        .from("deliveries")
        .upload(storagePath, uploadFile.file, {
          cacheControl: "3600",
          upsert: false,
        });

      // Simulate progress (in production, implement chunked uploads for real progress)
      const progressInterval = setInterval(() => {
        setFiles((prev) =>
          prev.map((f) => {
            if (f.id === uploadFile.id && f.progress < 90) {
              return { ...f, progress: Math.min(f.progress + 10, 90) };
            }
            return f;
          })
        );
      }, 200);

      const { data: uploadData, error: uploadError } = await uploadPromise;
      clearInterval(progressInterval);

      if (uploadError) throw uploadError;

      // Update progress to 100%
      setFiles((prev) =>
        prev.map((f) =>
          f.id === uploadFile.id ? { ...f, progress: 100, status: "success" } : f
        )
      );

      // Create delivery record
      const { error: deliveryError } = await supabase.from("deliveries").insert({
        organization_id: profile.organization_id,
        project_id: projectId,
        vendor_id: user.id,
        file_name: uploadFile.file.name,
        original_file_name: uploadFile.file.name,
        status: "uploading",
        storage_path: storagePath,
        file_size: uploadFile.file.size,
        file_type: uploadFile.file.type.startsWith("video/") ? "video" : "audio",
      });

      if (deliveryError) {
        console.error("Error creating delivery record:", deliveryError);
        // Still show success for upload, but log the error
      }

      toast({
        title: "Upload Successful",
        description: `${uploadFile.file.name} has been uploaded successfully.`,
        variant: "success",
      });

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

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={cn(
          "relative border-2 border-dashed rounded-lg p-12 text-center transition-colors",
          dragActive
            ? "border-zinc-600 bg-zinc-900/50"
            : "border-zinc-800/50 bg-zinc-900/30 hover:border-zinc-700/50"
        )}
      >
        <input
          type="file"
          id="file-upload"
          multiple
          accept="video/*,audio/*"
          onChange={handleFileInput}
          className="hidden"
        />
        <Upload className="h-16 w-16 text-zinc-500 mx-auto mb-4" />
        <p className="text-white font-medium mb-2 text-lg">
          Drag and drop files here, or click to select
        </p>
        <p className="text-sm text-zinc-400 mb-4">
          Supports video and audio files. Filename must match: PROJECTCODE-EP###-TYPE-NAME.ext
        </p>
        <Button variant="outline" type="button" onClick={handleClick}>
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
                  className="p-4 rounded-lg bg-zinc-900/50 border border-zinc-800/50"
                >
                  <div className="flex items-center gap-3 mb-3">
                    {getFileIcon(uploadFile.file.name)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">
                        {uploadFile.file.name}
                      </p>
                      <p className="text-xs text-zinc-400">
                        {formatFileSize(uploadFile.file.size)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {uploadFile.status === "success" && (
                        <CheckCircle2 className="h-5 w-5 text-green-400" />
                      )}
                      {uploadFile.status === "error" && (
                        <AlertCircle className="h-5 w-5 text-red-400" />
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFile(uploadFile.id)}
                        className="h-8 w-8 p-0 text-zinc-400 hover:text-red-400"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {uploadFile.status === "uploading" && (
                    <div className="space-y-1">
                      <Progress value={uploadFile.progress} className="h-2" />
                      <p className="text-xs text-zinc-400 text-right">
                        {uploadFile.progress}%
                      </p>
                    </div>
                  )}
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

