"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, XCircle, AlertTriangle, FileVideo, FileAudio, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface QCError {
  type: string;
  message: string;
  timestamp: number;
  severity: "error" | "warning";
}

interface QCReport {
  status: "passed" | "failed";
  format?: {
    container: string;
    videoCodec?: string;
    audioCodec?: string;
    resolution?: string;
    frameRate?: number;
  };
  duration?: {
    expected: number;
    actual: number;
    difference: number;
  };
  loudness?: {
    value: number;
    target: number;
    status: "passed" | "failed";
  };
  errors: QCError[];
  warnings: QCError[];
  analyzedAt: string;
}

interface Delivery {
  id: string;
  file_name: string;
  original_file_name: string;
  status: "uploading" | "processing" | "qc_passed" | "qc_failed" | "rejected";
  qc_report: QCReport | null;
  qc_errors: QCError[];
  created_at: string;
  project?: {
    code: string;
    name: string;
  };
  vendor?: {
    full_name: string | null;
  };
}

function StatusIcon({ status }: { status: "passed" | "failed" | "pending" }) {
  if (status === "passed") {
    return <CheckCircle2 className="h-5 w-5 text-green-400" />;
  }
  if (status === "failed") {
    return <XCircle className="h-5 w-5 text-red-400" />;
  }
  return <AlertTriangle className="h-5 w-5 text-yellow-400" />;
}

function QCStatusBadge({ status }: { status: Delivery["status"] }) {
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
      label: "Processing",
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

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

function formatTimestamp(seconds: number): string {
  return formatDuration(seconds);
}

export default function QCResultsPage() {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDelivery, setSelectedDelivery] = useState<Delivery | null>(null);

  const fetchQCDeliveries = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", user.id)
        .single();

      if (!profile?.organization_id) return;

      // Fetch deliveries that have been processed (not just uploading)
      const { data: deliveriesData, error: deliveriesError } = await supabase
        .from("deliveries")
        .select("*")
        .eq("organization_id", profile.organization_id)
        .in("status", ["qc_passed", "qc_failed", "processing"])
        .order("created_at", { ascending: false })
        .limit(100);

      if (deliveriesError) throw deliveriesError;

      // Fetch projects and vendors
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

      const enrichedDeliveries = (deliveriesData || []).map((delivery) => ({
        ...delivery,
        project: projects?.find((p) => p.id === delivery.project_id),
        vendor: vendors?.find((v) => v.id === delivery.vendor_id),
      }));

      setDeliveries(enrichedDeliveries);
    } catch (error) {
      console.error("Error fetching QC results:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQCDeliveries();
  }, []);

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-white mb-2">QC Results</h1>
          <p className="text-zinc-400">
            Review quality control reports and analysis results
          </p>
        </div>
        <Button asChild>
          <a href="/dashboard/qc/bulk">Bulk QC Analysis</a>
        </Button>
      </div>

      {/* QC Results Table */}
      <Card className="glass border-zinc-800/50">
        <CardHeader className="pb-2.5 px-6 pt-6">
          <CardTitle className="text-white text-lg">Quality Control Reports</CardTitle>
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
              <p className="text-zinc-400">No QC results available yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800/50 hover:bg-zinc-900/30">
                    <TableHead className="text-zinc-400 font-medium text-xs uppercase tracking-wider py-2.5 w-[250px]">
                      File Name
                    </TableHead>
                    <TableHead className="text-zinc-400 font-medium text-xs uppercase tracking-wider py-2.5 w-[100px]">
                      Project
                    </TableHead>
                    <TableHead className="text-zinc-400 font-medium text-xs uppercase tracking-wider py-2.5 w-[120px]">
                      Status
                    </TableHead>
                    <TableHead className="text-zinc-400 font-medium text-xs uppercase tracking-wider py-2.5 w-[200px]">
                      QC Summary
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
                  {deliveries.map((delivery, index) => {
                    const report = delivery.qc_report;
                    const hasErrors = report?.errors && report.errors.length > 0;
                    const hasWarnings = report?.warnings && report.warnings.length > 0;

                    return (
                      <motion.tr
                        key={delivery.id}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.15, delay: index * 0.02 }}
                        className="border-zinc-800/50 hover:bg-zinc-900/30 transition-colors cursor-pointer"
                        onClick={() => setSelectedDelivery(delivery)}
                      >
                        <TableCell className="py-2">
                          <div className="flex items-center gap-2.5">
                            {delivery.file_name.match(/\.(mov|mp4|avi|mkv|mxf)$/i) ? (
                              <FileVideo className="h-4 w-4 text-zinc-400" />
                            ) : (
                              <FileAudio className="h-4 w-4 text-zinc-400" />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-white truncate">
                                {delivery.original_file_name || delivery.file_name}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-2">
                          <span className="text-sm font-mono font-semibold text-zinc-300">
                            {delivery.project?.code || "—"}
                          </span>
                        </TableCell>
                        <TableCell className="py-2">
                          <QCStatusBadge status={delivery.status} />
                        </TableCell>
                        <TableCell className="py-2">
                          {report ? (
                            <div className="flex items-center gap-2">
                              <StatusIcon
                                status={
                                  report.status === "passed"
                                    ? "passed"
                                    : report.status === "failed"
                                    ? "failed"
                                    : "pending"
                                }
                              />
                              <div className="text-xs text-zinc-400">
                                {hasErrors && (
                                  <span className="text-red-400">
                                    {report.errors.length} error{report.errors.length > 1 ? "s" : ""}
                                  </span>
                                )}
                                {hasErrors && hasWarnings && " • "}
                                {hasWarnings && (
                                  <span className="text-yellow-400">
                                    {report.warnings.length} warning
                                    {report.warnings.length > 1 ? "s" : ""}
                                  </span>
                                )}
                                {!hasErrors && !hasWarnings && report.status === "passed" && (
                                  <span className="text-green-400">All checks passed</span>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-zinc-500">No report available</span>
                          )}
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
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedDelivery(delivery);
                            }}
                            className="h-7 px-2 text-zinc-400 hover:text-white"
                          >
                            View
                          </Button>
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

      {/* QC Detail Modal */}
      {selectedDelivery && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={() => setSelectedDelivery(null)}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            onClick={(e) => e.stopPropagation()}
            className="glass border-zinc-800/50 rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto"
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-semibold text-white mb-2">
                    QC Report Details
                  </h2>
                  <p className="text-sm text-zinc-400">
                    {selectedDelivery.original_file_name || selectedDelivery.file_name}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedDelivery(null)}
                  className="text-zinc-400 hover:text-white"
                >
                  ×
                </Button>
              </div>

              {selectedDelivery.qc_report ? (
                <div className="space-y-6">
                  {/* Overall Status */}
                  <Card className="glass border-zinc-800/50">
                    <CardHeader>
                      <div className="flex items-center gap-3">
                        <StatusIcon
                          status={
                            selectedDelivery.qc_report.status === "passed"
                              ? "passed"
                              : "failed"
                          }
                        />
                        <CardTitle className="text-white">
                          {selectedDelivery.qc_report.status === "passed"
                            ? "QC Passed"
                            : "QC Failed"}
                        </CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs text-zinc-500 mb-1">Project</p>
                          <p className="text-sm font-medium text-white">
                            {selectedDelivery.project?.code || "—"} - {selectedDelivery.project?.name || "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-zinc-500 mb-1">Vendor</p>
                          <p className="text-sm font-medium text-white">
                            {selectedDelivery.vendor?.full_name || "Unknown"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-zinc-500 mb-1">Analyzed At</p>
                          <p className="text-sm font-medium text-white">
                            {formatDate(selectedDelivery.qc_report.analyzedAt)}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Format Information */}
                  {selectedDelivery.qc_report.format && (
                    <Card className="glass border-zinc-800/50">
                      <CardHeader>
                        <CardTitle className="text-white text-lg">Format</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs text-zinc-500 mb-1">Container</p>
                            <p className="text-sm font-medium text-white">
                              {selectedDelivery.qc_report.format.container}
                            </p>
                          </div>
                          {selectedDelivery.qc_report.format.videoCodec && (
                            <div>
                              <p className="text-xs text-zinc-500 mb-1">Video Codec</p>
                              <p className="text-sm font-medium text-white">
                                {selectedDelivery.qc_report.format.videoCodec}
                              </p>
                            </div>
                          )}
                          {selectedDelivery.qc_report.format.audioCodec && (
                            <div>
                              <p className="text-xs text-zinc-500 mb-1">Audio Codec</p>
                              <p className="text-sm font-medium text-white">
                                {selectedDelivery.qc_report.format.audioCodec}
                              </p>
                            </div>
                          )}
                          {selectedDelivery.qc_report.format.resolution && (
                            <div>
                              <p className="text-xs text-zinc-500 mb-1">Resolution</p>
                              <p className="text-sm font-medium text-white">
                                {selectedDelivery.qc_report.format.resolution}
                              </p>
                            </div>
                          )}
                          {selectedDelivery.qc_report.format.frameRate && (
                            <div>
                              <p className="text-xs text-zinc-500 mb-1">Frame Rate</p>
                              <p className="text-sm font-medium text-white">
                                {selectedDelivery.qc_report.format.frameRate} fps
                              </p>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Duration */}
                  {selectedDelivery.qc_report.duration && (
                    <Card className="glass border-zinc-800/50">
                      <CardHeader>
                        <CardTitle className="text-white text-lg">Duration</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <p className="text-xs text-zinc-500 mb-1">Expected</p>
                            <p className="text-sm font-medium text-white">
                              {formatDuration(selectedDelivery.qc_report.duration.expected)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-zinc-500 mb-1">Actual</p>
                            <p className="text-sm font-medium text-white">
                              {formatDuration(selectedDelivery.qc_report.duration.actual)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-zinc-500 mb-1">Difference</p>
                            <p
                              className={cn(
                                "text-sm font-medium",
                                Math.abs(selectedDelivery.qc_report.duration.difference) < 1
                                  ? "text-green-400"
                                  : "text-red-400"
                              )}
                            >
                              {formatDuration(Math.abs(selectedDelivery.qc_report.duration.difference))}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Loudness */}
                  {selectedDelivery.qc_report.loudness && (
                    <Card className="glass border-zinc-800/50">
                      <CardHeader>
                        <CardTitle className="text-white text-lg">Loudness (EBU R128)</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <p className="text-xs text-zinc-500 mb-1">Measured</p>
                            <p className="text-sm font-medium text-white">
                              {selectedDelivery.qc_report.loudness.value.toFixed(1)} LUFS
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-zinc-500 mb-1">Target</p>
                            <p className="text-sm font-medium text-white">
                              {selectedDelivery.qc_report.loudness.target} LUFS
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-zinc-500 mb-1">Status</p>
                            <p
                              className={cn(
                                "text-sm font-medium",
                                selectedDelivery.qc_report.loudness.status === "passed"
                                  ? "text-green-400"
                                  : "text-red-400"
                              )}
                            >
                              {selectedDelivery.qc_report.loudness.status === "passed"
                                ? "Passed"
                                : "Failed"}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Errors */}
                  {selectedDelivery.qc_report.errors &&
                    selectedDelivery.qc_report.errors.length > 0 && (
                      <Card className="glass border-red-500/20">
                        <CardHeader>
                          <CardTitle className="text-red-400 text-lg flex items-center gap-2">
                            <XCircle className="h-5 w-5" />
                            Errors ({selectedDelivery.qc_report.errors.length})
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-3">
                            {selectedDelivery.qc_report.errors.map((error, idx) => (
                              <div
                                key={idx}
                                className="p-3 rounded-lg bg-red-500/10 border border-red-500/20"
                              >
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <p className="text-sm font-medium text-red-400 mb-1">
                                      {error.type}
                                    </p>
                                    <p className="text-xs text-zinc-400">{error.message}</p>
                                  </div>
                                  {error.timestamp > 0 && (
                                    <span className="text-xs text-zinc-500 ml-4">
                                      {formatTimestamp(error.timestamp)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                  {/* Warnings */}
                  {selectedDelivery.qc_report.warnings &&
                    selectedDelivery.qc_report.warnings.length > 0 && (
                      <Card className="glass border-yellow-500/20">
                        <CardHeader>
                          <CardTitle className="text-yellow-400 text-lg flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5" />
                            Warnings ({selectedDelivery.qc_report.warnings.length})
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-3">
                            {selectedDelivery.qc_report.warnings.map((warning, idx) => (
                              <div
                                key={idx}
                                className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20"
                              >
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <p className="text-sm font-medium text-yellow-400 mb-1">
                                      {warning.type}
                                    </p>
                                    <p className="text-xs text-zinc-400">{warning.message}</p>
                                  </div>
                                  {warning.timestamp > 0 && (
                                    <span className="text-xs text-zinc-500 ml-4">
                                      {formatTimestamp(warning.timestamp)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-zinc-400">No QC report available for this delivery</p>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}

