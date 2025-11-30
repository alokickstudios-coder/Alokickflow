"use client";

import { useState, useEffect } from "react";
import { BulkQCUpload } from "@/components/qc/bulk-upload";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, ExternalLink, CheckCircle2, XCircle } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface BulkQCResult {
  id: string;
  file_name: string;
  original_file_name: string;
  status: "uploading" | "processing" | "qc_passed" | "qc_failed" | "rejected";
  storage_path: string;
  qc_report: any;
  qc_errors: any[];
  created_at: string;
  project?: {
    code: string;
    name: string;
  };
}

export default function BulkQCPage() {
  const [results, setResults] = useState<BulkQCResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchResults = async () => {
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

      const { data: deliveries, error } = await supabase
        .from("deliveries")
        .select("*")
        .eq("organization_id", profile.organization_id)
        .in("status", ["qc_passed", "qc_failed", "processing"])
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;

      // Fetch projects
      const projectIds = [...new Set(deliveries?.map((d) => d.project_id) || [])];
      const { data: projects } = await supabase
        .from("projects")
        .select("id, code, name")
        .in("id", projectIds);

      const enrichedResults = (deliveries || []).map((delivery) => ({
        ...delivery,
        project: projects?.find((p) => p.id === delivery.project_id),
      }));

      setResults(enrichedResults);
    } catch (error) {
      console.error("Error fetching QC results:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchResults();
    // Poll for updates every 5 seconds
    const interval = setInterval(fetchResults, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleDownload = async (result: BulkQCResult) => {
    try {
      const { data, error } = await supabase.storage
        .from("deliveries")
        .createSignedUrl(result.storage_path, 3600);

      if (error) throw error;
      if (data?.signedUrl) {
        window.open(data.signedUrl, "_blank");
      }
    } catch (error) {
      console.error("Error downloading file:", error);
      alert("Failed to download file");
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

  const getErrorCount = (result: BulkQCResult) => {
    if (result.qc_errors && Array.isArray(result.qc_errors)) {
      return result.qc_errors.length;
    }
    if (result.qc_report?.errors && Array.isArray(result.qc_report.errors)) {
      return result.qc_report.errors.length;
    }
    return 0;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-semibold text-white mb-2">Bulk QC Analysis</h1>
        <p className="text-zinc-400">
          Upload multiple video and SRT files for automated quality control
        </p>
      </div>

      {/* Upload Section */}
      <Card className="glass border-zinc-800/50">
        <CardHeader>
          <CardTitle className="text-white">Upload Files for QC</CardTitle>
        </CardHeader>
        <CardContent>
          <BulkQCUpload onUploadComplete={fetchResults} />
        </CardContent>
      </Card>

      {/* Results Table */}
      <Card className="glass border-zinc-800/50">
        <CardHeader className="flex items-center justify-between pb-2.5 px-6 pt-6">
          <CardTitle className="text-white text-lg">QC Results</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchResults}
            disabled={refreshing}
            className="text-zinc-400 hover:text-white"
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </Button>
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
          ) : results.length === 0 ? (
            <div className="text-center py-12 px-6">
              <p className="text-zinc-400">No QC results yet. Upload files to get started.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800/50 hover:bg-zinc-900/30">
                    <TableHead className="text-zinc-400 font-medium text-xs uppercase tracking-wider py-2.5 w-[50px]">
                      #
                    </TableHead>
                    <TableHead className="text-zinc-400 font-medium text-xs uppercase tracking-wider py-2.5 w-[200px]">
                      Project Name
                    </TableHead>
                    <TableHead className="text-zinc-400 font-medium text-xs uppercase tracking-wider py-2.5 w-[250px]">
                      File Name
                    </TableHead>
                    <TableHead className="text-zinc-400 font-medium text-xs uppercase tracking-wider py-2.5 w-[150px]">
                      Status
                    </TableHead>
                    <TableHead className="text-zinc-400 font-medium text-xs uppercase tracking-wider py-2.5 w-[200px]">
                      Errors Caught
                    </TableHead>
                    <TableHead className="text-zinc-400 font-medium text-xs uppercase tracking-wider py-2.5 w-[150px]">
                      Original File Link
                    </TableHead>
                    <TableHead className="text-zinc-400 font-medium text-xs uppercase tracking-wider py-2.5 w-[100px] text-right">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((result, index) => {
                    const errorCount = getErrorCount(result);
                    const isPassed = result.status === "qc_passed";

                    return (
                      <TableRow
                        key={result.id}
                        className="border-zinc-800/50 hover:bg-zinc-900/30 transition-colors"
                      >
                        <TableCell className="py-2">
                          <span className="text-sm text-zinc-400">{index + 1}</span>
                        </TableCell>
                        <TableCell className="py-2">
                          <div>
                            <span className="text-sm font-mono font-semibold text-zinc-300">
                              {result.project?.code || "—"}
                            </span>
                            {result.project?.name && (
                              <p className="text-xs text-zinc-500 truncate">
                                {result.project.name}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="py-2">
                          <p className="text-sm font-medium text-white truncate">
                            {result.original_file_name || result.file_name}
                          </p>
                        </TableCell>
                        <TableCell className="py-2">
                          <div className="flex items-center gap-2">
                            {isPassed ? (
                              <CheckCircle2 className="h-4 w-4 text-green-400" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-400" />
                            )}
                            <span
                              className={cn(
                                "text-xs font-medium",
                                isPassed ? "text-green-400" : "text-red-400"
                              )}
                            >
                              {result.status === "qc_passed"
                                ? "Passed"
                                : result.status === "qc_failed"
                                ? "Failed"
                                : "Processing"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="py-2">
                          {errorCount > 0 ? (
                            <div className="space-y-1">
                              <span className="text-sm font-medium text-red-400">
                                {errorCount} error{errorCount > 1 ? "s" : ""}
                              </span>
                              {result.qc_errors && Array.isArray(result.qc_errors) && (
                                <div className="text-xs text-zinc-500 space-y-0.5">
                                  {result.qc_errors.slice(0, 3).map((error: any, idx: number) => (
                                    <div key={idx} className="truncate">
                                      • {error.type || error.message}
                                    </div>
                                  ))}
                                  {result.qc_errors.length > 3 && (
                                    <div className="text-zinc-600">
                                      +{result.qc_errors.length - 3} more
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-sm text-green-400">No errors</span>
                          )}
                        </TableCell>
                        <TableCell className="py-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDownload(result)}
                            className="h-7 px-2 text-zinc-400 hover:text-white"
                          >
                            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                            Open
                          </Button>
                        </TableCell>
                        <TableCell className="py-2 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDownload(result)}
                            className="h-7 px-2 text-zinc-400 hover:text-white"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

