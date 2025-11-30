"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, XCircle, Clock, FileVideo, FileText, ExternalLink, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase/client";
import Link from "next/link";

interface Delivery {
  id: string;
  file_name: string;
  status: "uploading" | "processing" | "qc_passed" | "qc_failed" | "rejected" | "needs_review";
  storage_path: string;
  created_at: string;
  file_type?: string;
  project?: {
    code: string;
    name: string;
  };
  vendor?: {
    full_name: string;
  };
}

function StatusBadge({ status }: { status: Delivery["status"] }) {
  const variants: Record<string, { icon: any; className: string; label: string }> = {
    qc_passed: {
      icon: CheckCircle2,
      className: "bg-green-500/10 text-green-400 border-green-500/20",
      label: "Passed",
    },
    qc_failed: {
      icon: XCircle,
      className: "bg-red-500/10 text-red-400 border-red-500/20",
      label: "Failed",
    },
    processing: {
      icon: Clock,
      className: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20 animate-pulse",
      label: "Processing",
    },
    uploading: {
      icon: Clock,
      className: "bg-blue-500/10 text-blue-400 border-blue-500/20",
      label: "Uploading",
    },
    rejected: {
      icon: XCircle,
      className: "bg-red-500/10 text-red-400 border-red-500/20",
      label: "Rejected",
    },
    needs_review: {
      icon: Clock,
      className: "bg-orange-500/10 text-orange-400 border-orange-500/20",
      label: "Review",
    },
  };

  const variant = variants[status] || variants.processing;
  const Icon = variant.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        variant.className
      )}
    >
      <Icon className="h-3 w-3" />
      {variant.label}
    </span>
  );
}

function getFileIcon(fileName: string, fileType?: string) {
  if (fileType === "subtitle" || fileName.endsWith(".srt") || fileName.endsWith(".vtt")) {
    return <FileText className="h-5 w-5 text-blue-400" />;
  }
  return <FileVideo className="h-5 w-5 text-purple-400" />;
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return "Just now";
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} min ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)} days ago`;
  
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function RecentDeliveries() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);

  useEffect(() => {
    fetchDeliveries();

    // Set up real-time subscription
    const channel = supabase
      .channel("recent-deliveries")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "deliveries" },
        () => {
          fetchDeliveries();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchDeliveries = async () => {
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

      // Fetch deliveries with project and vendor info
      const { data: deliveriesData, error } = await supabase
        .from("deliveries")
        .select(`
          id,
          file_name,
          status,
          storage_path,
          created_at,
          file_type,
          project:project_id(code, name),
          vendor:vendor_id(full_name)
        `)
        .eq("organization_id", profile.organization_id)
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) throw error;
      
      // Transform data to handle Supabase's array return for single relations
      const transformedData = (deliveriesData || []).map((item: any) => ({
        ...item,
        project: Array.isArray(item.project) ? item.project[0] : item.project,
        vendor: Array.isArray(item.vendor) ? item.vendor[0] : item.vendor,
      }));
      setDeliveries(transformedData);
    } catch (error) {
      console.error("Error fetching deliveries:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleDownload = async (delivery: Delivery) => {
    try {
      const { data, error } = await supabase.storage
        .from("deliveries")
        .createSignedUrl(delivery.storage_path, 3600);

      if (error) throw error;
      if (data?.signedUrl) {
        window.open(data.signedUrl, "_blank");
      }
    } catch (error) {
      console.error("Error downloading file:", error);
    }
  };

  if (loading) {
    return (
      <Card className="glass border-zinc-800/50">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg font-semibold text-white">
            Recent Deliveries
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-10 w-10 rounded" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-6 w-20" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1 }}
    >
      <Card className="glass border-zinc-800/50">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg font-semibold text-white">
            Recent Deliveries
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchDeliveries}
              disabled={refreshing}
              className="text-zinc-400 hover:text-white"
            >
              <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            </Button>
            <Link href="/dashboard/deliveries">
              <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-white">
                View All
                <ExternalLink className="h-3 w-3 ml-1" />
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {deliveries.length === 0 ? (
            <div className="text-center py-8">
              <FileVideo className="h-12 w-12 text-zinc-600 mx-auto mb-3" />
              <p className="text-zinc-400">No deliveries yet</p>
              <p className="text-zinc-500 text-sm">Upload files to get started</p>
            </div>
          ) : (
            <div className="space-y-3">
              {deliveries.map((delivery, index) => (
                <motion.div
                  key={delivery.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                  className="flex items-center gap-4 rounded-lg border border-zinc-800/50 bg-zinc-900/30 p-3 transition-colors hover:border-zinc-700/50 cursor-pointer group"
                  onClick={() => handleDownload(delivery)}
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-800/50">
                    {getFileIcon(delivery.file_name, delivery.file_type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium text-white group-hover:text-blue-400 transition-colors">
                      {delivery.file_name}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {delivery.project?.code && (
                        <span className="text-zinc-400">{delivery.project.code}</span>
                      )}
                      {delivery.project?.code && delivery.vendor?.full_name && " • "}
                      {delivery.vendor?.full_name}
                      {(delivery.project?.code || delivery.vendor?.full_name) && " • "}
                      {formatTimeAgo(delivery.created_at)}
                    </p>
                  </div>
                  <StatusBadge status={delivery.status} />
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
