"use client";

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Upload,
  FolderPlus,
  Link as LinkIcon,
  Copy,
  Check,
  X,
  Loader2,
  HardDrive,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface UploadedFile {
  id: string;
  name: string;
  shareableLink: string;
}

interface DriveUploaderProps {
  onUploadComplete?: (files: UploadedFile[]) => void;
  folderId?: string;
  buttonText?: string;
  buttonVariant?: "default" | "outline" | "ghost";
}

export function DriveUploader({
  onUploadComplete,
  folderId,
  buttonText = "Upload to Drive",
  buttonVariant = "default",
}: DriveUploaderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
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
      setFiles((prev) => [...prev, ...Array.from(e.dataTransfer.files)]);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const uploadFiles = async () => {
    if (files.length === 0) return;

    setUploading(true);
    const uploaded: UploadedFile[] = [];

    try {
      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("fileName", file.name);
        if (folderId) {
          formData.append("folderId", folderId);
        }

        const response = await fetch("/api/google/drive/upload", {
          method: "POST",
          body: formData,
        });

        const data = await response.json();

        if (!response.ok) {
          if (response.status === 401) {
            toast({
              title: "Not Connected",
              description: "Please connect Google Drive in Settings first.",
              variant: "destructive",
            });
            return;
          }
          throw new Error(data.error);
        }

        uploaded.push(data.file);
      }

      setUploadedFiles(uploaded);
      setFiles([]);

      toast({
        title: "Upload Complete",
        description: `${uploaded.length} file(s) uploaded to Google Drive`,
        variant: "success",
      });

      if (onUploadComplete) {
        onUploadComplete(uploaded);
      }
    } catch (error: any) {
      toast({
        title: "Upload Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const copyLink = async (link: string, fileId: string) => {
    await navigator.clipboard.writeText(link);
    setCopied(fileId);
    setTimeout(() => setCopied(null), 2000);
  };

  const reset = () => {
    setFiles([]);
    setUploadedFiles([]);
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant={buttonVariant}>
          <HardDrive className="h-4 w-4 mr-2" />
          {buttonText}
        </Button>
      </DialogTrigger>
      <DialogContent className="glass border-zinc-800/50 max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <HardDrive className="h-5 w-5" />
            Upload to Google Drive
          </DialogTitle>
          <DialogDescription>
            Upload files directly to Google Drive and get shareable links
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {uploadedFiles.length > 0 ? (
            // Show uploaded files with links
            <div className="space-y-3">
              <p className="text-sm text-green-400 flex items-center gap-2">
                <Check className="h-4 w-4" />
                Files uploaded successfully!
              </p>
              {uploadedFiles.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center gap-3 p-3 rounded-lg bg-zinc-900/50 border border-zinc-800/50"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{file.name}</p>
                    <p className="text-xs text-zinc-500 truncate">
                      {file.shareableLink}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copyLink(file.shareableLink, file.id)}
                  >
                    {copied === file.id ? (
                      <Check className="h-4 w-4 text-green-400" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              ))}
              <Button onClick={reset} variant="outline" className="w-full">
                Upload More
              </Button>
            </div>
          ) : (
            // Show upload area
            <>
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                className={cn(
                  "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
                  dragActive
                    ? "border-blue-500 bg-blue-500/10"
                    : "border-zinc-700 hover:border-zinc-600"
                )}
              >
                <Upload className="h-10 w-10 text-zinc-500 mx-auto mb-4" />
                <p className="text-zinc-400 mb-2">
                  Drag & drop files here, or click to select
                </p>
                <input
                  type="file"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                  id="drive-file-input"
                />
                <label htmlFor="drive-file-input">
                  <Button variant="outline" asChild>
                    <span>Select Files</span>
                  </Button>
                </label>
              </div>

              {/* Selected files list */}
              {files.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm text-zinc-400">
                    {files.length} file(s) selected
                  </p>
                  {files.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-3 p-2 rounded bg-zinc-900/50"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">{file.name}</p>
                        <p className="text-xs text-zinc-500">
                          {(file.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeFile(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <Button
                onClick={uploadFiles}
                disabled={files.length === 0 || uploading}
                className="w-full"
              >
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload {files.length} File(s)
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

