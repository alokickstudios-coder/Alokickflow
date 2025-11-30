"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  FolderOpen,
  FileVideo,
  FileAudio,
  FileText,
  File,
  ChevronRight,
  ArrowLeft,
  Check,
  Loader2,
  Link as LinkIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { isValidDriveUrl } from "@/lib/google-drive";

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  webViewLink?: string;
}

interface DriveFilePickerProps {
  onSelect: (files: DriveFile[]) => void;
  multiple?: boolean;
  buttonText?: string;
}

const getFileIcon = (mimeType: string) => {
  if (mimeType.includes("folder")) return FolderOpen;
  if (mimeType.includes("video")) return FileVideo;
  if (mimeType.includes("audio")) return FileAudio;
  if (mimeType.includes("text") || mimeType.includes("document")) return FileText;
  return File;
};

export function DriveFilePicker({
  onSelect,
  multiple = true,
  buttonText = "Select from Drive",
}: DriveFilePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [selected, setSelected] = useState<DriveFile[]>([]);
  const [folderHistory, setFolderHistory] = useState<string[]>([]);
  const [driveUrl, setDriveUrl] = useState("");
  const [mode, setMode] = useState<"browse" | "url">("url");
  const { toast } = useToast();

  const fetchFiles = async (folderId?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (folderId) params.set("folderId", folderId);

      const response = await fetch(`/api/google/drive/list?${params}`);
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

      setFiles(data.files || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchFromUrl = async () => {
    if (!driveUrl) return;

    if (!isValidDriveUrl(driveUrl)) {
      toast({
        title: "Invalid URL",
        description: "Please enter a valid Google Drive URL",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/google/drive/list?url=${encodeURIComponent(driveUrl)}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error);
      }

      setFiles(data.files || []);
      setMode("browse");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const openFolder = (folderId: string) => {
    setFolderHistory((prev) => [...prev, folderId]);
    fetchFiles(folderId);
  };

  const goBack = () => {
    const newHistory = [...folderHistory];
    newHistory.pop();
    setFolderHistory(newHistory);
    fetchFiles(newHistory[newHistory.length - 1]);
  };

  const toggleSelect = (file: DriveFile) => {
    if (file.mimeType.includes("folder")) {
      openFolder(file.id);
      return;
    }

    if (multiple) {
      setSelected((prev) =>
        prev.find((f) => f.id === file.id)
          ? prev.filter((f) => f.id !== file.id)
          : [...prev, file]
      );
    } else {
      setSelected([file]);
    }
  };

  const confirmSelection = () => {
    onSelect(selected);
    setIsOpen(false);
    setSelected([]);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <FolderOpen className="h-4 w-4 mr-2" />
          {buttonText}
        </Button>
      </DialogTrigger>
      <DialogContent className="glass border-zinc-800/50 max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-white">Select Files from Google Drive</DialogTitle>
          <DialogDescription>
            Enter a Google Drive folder link or browse your files
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col space-y-4 mt-4">
          {/* URL Input */}
          <div className="flex gap-2">
            <div className="flex-1">
              <Input
                placeholder="Paste Google Drive folder link..."
                value={driveUrl}
                onChange={(e) => setDriveUrl(e.target.value)}
              />
            </div>
            <Button onClick={fetchFromUrl} disabled={loading || !driveUrl}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LinkIcon className="h-4 w-4" />}
            </Button>
          </div>

          {/* Navigation */}
          {mode === "browse" && folderHistory.length > 0 && (
            <Button variant="ghost" size="sm" onClick={goBack} className="w-fit">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          )}

          {/* File List */}
          <div className="flex-1 overflow-y-auto border border-zinc-800/50 rounded-lg">
            {loading ? (
              <div className="flex items-center justify-center h-40">
                <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
              </div>
            ) : files.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-zinc-400">
                <FolderOpen className="h-10 w-10 mb-2" />
                <p>No files found</p>
                <p className="text-sm">Enter a Drive link above to browse files</p>
              </div>
            ) : (
              <div className="divide-y divide-zinc-800/50">
                {files.map((file) => {
                  const Icon = getFileIcon(file.mimeType);
                  const isFolder = file.mimeType.includes("folder");
                  const isSelected = selected.some((f) => f.id === file.id);

                  return (
                    <motion.div
                      key={file.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      onClick={() => toggleSelect(file)}
                      className={cn(
                        "flex items-center gap-3 p-3 cursor-pointer hover:bg-zinc-900/50 transition-colors",
                        isSelected && "bg-blue-500/10"
                      )}
                    >
                      <div
                        className={cn(
                          "h-10 w-10 rounded-lg flex items-center justify-center",
                          isFolder ? "bg-yellow-500/20" : "bg-zinc-800/50"
                        )}
                      >
                        <Icon
                          className={cn(
                            "h-5 w-5",
                            isFolder ? "text-yellow-400" : "text-zinc-400"
                          )}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white truncate">{file.name}</p>
                        {file.size && (
                          <p className="text-xs text-zinc-500">
                            {(parseInt(file.size) / 1024 / 1024).toFixed(2)} MB
                          </p>
                        )}
                      </div>
                      {isFolder ? (
                        <ChevronRight className="h-5 w-5 text-zinc-400" />
                      ) : isSelected ? (
                        <Check className="h-5 w-5 text-blue-400" />
                      ) : null}
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-zinc-800/50">
            <p className="text-sm text-zinc-400">
              {selected.length} file(s) selected
            </p>
            <Button onClick={confirmSelection} disabled={selected.length === 0}>
              Select Files
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

