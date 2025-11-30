"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Download, FileVideo, FileAudio, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchInput } from "@/components/ui/search-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface Delivery {
  id: string;
  file_name: string;
  original_file_name: string;
  status: "uploading" | "processing" | "qc_passed" | "qc_failed" | "rejected";
  storage_path: string;
  project_id: string;
  vendor_id: string;
  created_at: string;
  project?: {
    code: string;
    name: string;
  };
  vendor?: {
    full_name: string | null;
  };
}

function StatusBadge({ status }: { status: Delivery["status"] }) {
  const variants = {
    qc_passed: {
      label: "Passed",
      className: "border-green-500/20 bg-green-500/10 text-green-400",
    },
    qc_failed: {
      label: "Failed",
      className: "border-red-500/20 bg-red-500/10 text-red-400",
    },
    processing: {
      label: "QC Pending",
      className: "border-yellow-500/20 bg-yellow-500/10 text-yellow-400",
    },
    uploading: {
      label: "Uploading",
      className: "border-blue-500/20 bg-blue-500/10 text-blue-400",
    },
    rejected: {
      label: "Rejected",
      className: "border-red-500/20 bg-red-500/10 text-red-400",
    },
  };

  const { label, className } = variants[status];

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        className
      )}
    >
      {label}
    </span>
  );
}

function FileTypeIcon({ fileName }: { fileName: string }) {
  const extension = fileName.split(".").pop()?.toLowerCase();
  const isVideo = ["mov", "mp4", "avi", "mkv", "mxf"].includes(extension || "");
  const isAudio = ["wav", "aiff", "mp3", "flac", "m4a"].includes(extension || "");

  if (isVideo) {
    return <FileVideo className="h-4 w-4 text-zinc-400" />;
  }
  if (isAudio) {
    return <FileAudio className="h-4 w-4 text-zinc-400" />;
  }
  return <FileVideo className="h-4 w-4 text-zinc-400" />;
}

export default function DeliveriesPage() {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [filteredDeliveries, setFilteredDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const fetchDeliveries = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get user's organization
      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", user.id)
        .single();

      if (!profile?.organization_id) return;

      // Fetch deliveries with project and vendor info
      const { data: deliveriesData, error: deliveriesError } = await supabase
        .from("deliveries")
        .select("*")
        .eq("organization_id", profile.organization_id)
        .order("created_at", { ascending: false })
        .limit(100);

      if (deliveriesError) throw deliveriesError;

      // Fetch projects and vendors separately
      const projectIds = [...new Set(deliveriesData?.map((d) => d.project_id) || [])];
      const vendorIds = [...new Set(deliveriesData?.map((d) => d.vendor_id) || [])];

      const { data: projects } = await supabase
        .from("projects")
        .select("id, code, name")
        .in("id", projectIds);

      const { data: vendors } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", vendorIds);

      // Combine data
      const enrichedDeliveries = (deliveriesData || []).map((delivery) => ({
        ...delivery,
        project: projects?.find((p) => p.id === delivery.project_id),
        vendor: vendors?.find((v) => v.id === delivery.vendor_id),
      }));

      setDeliveries(enrichedDeliveries);
      setFilteredDeliveries(enrichedDeliveries);
    } catch (error) {
      console.error("Error fetching deliveries:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeliveries();
  }, []);

  // Filter deliveries based on search and status
  useEffect(() => {
    let filtered = deliveries;

    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter(
        (d) =>
          d.file_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          d.original_file_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          d.project?.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
          d.vendor?.full_name?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Apply status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter((d) => d.status === statusFilter);
    }

    setFilteredDeliveries(filtered);
  }, [searchQuery, statusFilter, deliveries]);

  const handleDownload = async (delivery: Delivery) => {
    try {
      // Extract file path from storage_path
      const filePath = delivery.storage_path || delivery.file_name;
      
      // Try to create a signed URL from Supabase Storage
      try {
        const { data, error } = await supabase.storage
          .from("deliveries")
          .createSignedUrl(filePath, 3600);

        if (error) throw error;

        if (data?.signedUrl) {
          window.open(data.signedUrl, "_blank");
          return;
        }
      } catch (storageError) {
        // If storage bucket doesn't exist or file not found, fall back to direct download
        console.warn("Storage download failed, using fallback:", storageError);
      }

      // Fallback: For now, show a message
      // In production, you'd implement a server-side endpoint to serve files
      alert(`Download functionality will be available once storage is configured.\n\nFile: ${delivery.file_name}\nPath: ${filePath}`);
    } catch (error) {
      console.error("Error downloading file:", error);
      alert("Failed to download file. Please try again.");
    }
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-semibold text-white mb-2">Deliveries</h1>
        <p className="text-zinc-400">
          Manage and track all file uploads and QC results
        </p>
      </div>

      {/* Deliveries Table */}
      <Card className="glass border-zinc-800/50">
        <CardHeader className="pb-2.5 px-6 pt-6">
          <div className="flex items-center justify-between">
            <CardTitle className="text-white text-lg">All Deliveries</CardTitle>
            <div className="flex items-center gap-3">
              <SearchInput
                placeholder="Search files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-64"
              />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
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
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-10 flex-1" />
                </div>
              ))}
            </div>
          ) : deliveries.length === 0 ? (
            <div className="text-center py-12 px-6">
              <p className="text-zinc-400">
                {searchQuery || statusFilter !== "all"
                  ? "No deliveries match your filters"
                  : "No deliveries yet"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800/50 hover:bg-zinc-900/30">
                    <TableHead className="text-zinc-400 font-medium text-xs uppercase tracking-wider py-2.5 w-[300px]">
                      File Name
                    </TableHead>
                    <TableHead className="text-zinc-400 font-medium text-xs uppercase tracking-wider py-2.5 w-[120px]">
                      Project
                    </TableHead>
                    <TableHead className="text-zinc-400 font-medium text-xs uppercase tracking-wider py-2.5 w-[150px]">
                      Vendor
                    </TableHead>
                    <TableHead className="text-zinc-400 font-medium text-xs uppercase tracking-wider py-2.5 w-[120px]">
                      Status
                    </TableHead>
                    <TableHead className="text-zinc-400 font-medium text-xs uppercase tracking-wider py-2.5 w-[120px]">
                      Date
                    </TableHead>
                    <TableHead className="text-zinc-400 font-medium text-xs uppercase tracking-wider py-2.5 w-[100px] text-right">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDeliveries.map((delivery, index) => (
                    <motion.tr
                      key={delivery.id}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.15, delay: index * 0.02 }}
                      className="border-zinc-800/50 hover:bg-zinc-900/30 transition-colors"
                    >
                      <TableCell className="py-2">
                        <div className="flex items-center gap-2.5">
                          <FileTypeIcon fileName={delivery.file_name} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">
                              {delivery.original_file_name || delivery.file_name}
                            </p>
                            <p className="text-xs text-zinc-500 truncate">
                              {delivery.file_name}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-2">
                        <div>
                          <span className="text-sm font-mono font-semibold text-zinc-300">
                            {delivery.project?.code || "—"}
                          </span>
                          {delivery.project?.name && (
                            <p className="text-xs text-zinc-500 truncate">
                              {delivery.project.name}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="py-2">
                        <span className="text-sm text-zinc-300">
                          {delivery.vendor?.full_name || "Unknown Vendor"}
                        </span>
                      </TableCell>
                      <TableCell className="py-2">
                        <StatusBadge status={delivery.status} />
                      </TableCell>
                      <TableCell className="py-2">
                        <span className="text-xs text-zinc-400">
                          {formatDate(delivery.created_at)}
                        </span>
                      </TableCell>
                      <TableCell className="py-2 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDownload(delivery)}
                          className="h-7 px-2 text-zinc-400 hover:text-white"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </motion.tr>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

