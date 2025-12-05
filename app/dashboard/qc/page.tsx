"use client";

import { useState, useEffect } from "react";
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
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, ExternalLink, RefreshCw, FileSpreadsheet, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface QCJob {
  id: string;
  file_name: string | null;
  status: string;
  error_message: string | null;
  result_json: any;
  created_at: string;
  updated_at: string;
  project?: {
    id: string;
    code: string;
    name: string;
  };
}

type SortField = "file_name" | "status" | "created_at" | "score";
type SortDirection = "asc" | "desc";

export default function QCResultsPage() {
  const [jobs, setJobs] = useState<QCJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<QCJob | null>(null);
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [exporting, setExporting] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);

  const fetchQCJobs = async () => {
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

      // Fetch QC jobs that are completed
      const { data: jobsData, error: jobsError } = await supabase
        .from("qc_jobs")
        .select(`
          *,
          project:projects(id, code, name)
        `)
        .eq("organisation_id", profile.organization_id)
        .in("status", ["completed", "failed"])
        .order("created_at", { ascending: false })
        .limit(500);

      if (jobsError) throw jobsError;

      setJobs((jobsData || []) as QCJob[]);
    } catch (error: any) {
      console.error("Error fetching QC jobs:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQCJobs();
    // Auto-refresh every 10 seconds
    const interval = setInterval(fetchQCJobs, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const getStatusBadge = (status: string, result: any) => {
    if (status === "completed") {
      const qcStatus = result?.status;
      if (qcStatus === "passed") {
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/50">Passed</Badge>;
      } else if (qcStatus === "failed") {
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/50">Failed</Badge>;
      } else {
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/50">Needs Review</Badge>;
      }
    } else if (status === "failed") {
      return <Badge className="bg-red-500/20 text-red-400 border-red-500/50">Error</Badge>;
    } else {
      return <Badge className="bg-zinc-500/20 text-zinc-400 border-zinc-500/50">{status}</Badge>;
    }
  };

  const getQCValue = (job: QCJob, field: string): string | number => {
    const result = job.result_json || {};
    
    switch (field) {
      case "audioMissing":
        return result.basicQC?.audioMissing?.detected ? "Yes" : "No";
      case "loudness":
        const lufs = result.basicQC?.loudness?.lufs;
        return lufs !== undefined ? `${lufs.toFixed(1)} LUFS` : "N/A";
      case "lipSync":
        if (result.lipSync?.skipped) return "Skipped";
        const score = result.lipSync?.syncScore;
        return score !== undefined ? `${(score * 100).toFixed(0)}%` : "N/A";
      case "subtitleTiming":
        return result.basicQC?.subtitleTiming?.status === "failed" ? "Failed" : "OK";
      case "bgm":
        return result.bgm?.bgmDetected ? "Detected" : "Missing";
      case "glitches":
        return result.videoGlitch?.glitchCount || 0;
      case "visualQuality":
        return result.basicQC?.visualQuality?.status === "failed" ? "Failed" : "OK";
      case "score":
        return result.score || 0;
      default:
        return "N/A";
    }
  };

  const filteredAndSorted = jobs
    .filter((job) => {
      if (filterStatus !== "all") {
        const result = job.result_json || {};
        if (filterStatus === "passed" && result.status !== "passed") return false;
        if (filterStatus === "failed" && result.status !== "failed" && job.status !== "failed") return false;
        if (filterStatus === "needs_review" && result.status !== "needs_review") return false;
      }
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          job.file_name?.toLowerCase().includes(query) ||
          job.project?.name?.toLowerCase().includes(query) ||
          job.project?.code?.toLowerCase().includes(query)
        );
      }
      return true;
    })
    .sort((a, b) => {
      let aVal: any;
      let bVal: any;

      if (sortField === "score") {
        aVal = a.result_json?.score || 0;
        bVal = b.result_json?.score || 0;
      } else if (sortField === "file_name") {
        aVal = a.file_name || "";
        bVal = b.file_name || "";
      } else if (sortField === "status") {
        aVal = a.status;
        bVal = b.status;
      } else {
        aVal = new Date(a.created_at).getTime();
        bVal = new Date(b.created_at).getTime();
      }

      if (sortDirection === "asc") {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });

  const handleExportToSheets = async () => {
    if (!currentProjectId && filteredAndSorted.length > 0) {
      const projectIds = [...new Set(filteredAndSorted.map((j) => j.project?.id).filter(Boolean))];
      if (projectIds.length === 0) {
        alert("No project found. Please ensure QC results are linked to a project.");
        return;
      }
      if (projectIds.length > 1) {
        alert("Multiple projects found. Please filter to a single project first.");
        return;
      }
      setCurrentProjectId(projectIds[0] as string);
    }

    const projectId = currentProjectId || filteredAndSorted[0]?.project?.id;
    if (!projectId) {
      alert("No project found for export.");
      return;
    }

    setExporting(true);
    try {
      const response = await fetch("/api/qc/export-to-sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to export to Google Sheets");
      }

      if (data.sheetUrl) {
        window.open(data.sheetUrl, "_blank");
      }
      
      const message = data.isNewSheet 
        ? `Created new QC sheet and exported ${data.rowCount} result(s)!`
        : `Updated QC sheet with ${data.rowCount} result(s)!`;
      
      alert(message);
    } catch (error: any) {
      alert(`Export failed: ${error.message}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">QC Results</h1>
          <p className="text-zinc-400 mt-1">View and manage quality control results</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={handleExportToSheets}
            disabled={exporting || filteredAndSorted.length === 0}
            className="bg-purple-600 hover:bg-purple-700"
          >
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            {exporting ? "Exporting..." : "Export to Sheets"}
          </Button>
          <Button
            variant="outline"
            onClick={fetchQCJobs}
            disabled={loading}
            className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <Input
              placeholder="Search files or projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-sm border-zinc-700 bg-zinc-800 text-white"
            />
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[180px] border-zinc-700 bg-zinc-800 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="passed">Passed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="needs_review">Needs Review</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Results Table */}
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full bg-zinc-800" />
              ))}
            </div>
          ) : filteredAndSorted.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-zinc-400">No QC results found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800 hover:bg-zinc-800/50">
                    <TableHead className="text-zinc-300">
                      <button
                        onClick={() => handleSort("file_name")}
                        className="flex items-center gap-1 hover:text-white"
                      >
                        File Name
                        {sortField === "file_name" && (
                          sortDirection === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                        )}
                      </button>
                    </TableHead>
                    <TableHead className="text-zinc-300">Project</TableHead>
                    <TableHead className="text-zinc-300">
                      <button
                        onClick={() => handleSort("status")}
                        className="flex items-center gap-1 hover:text-white"
                      >
                        Status
                        {sortField === "status" && (
                          sortDirection === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                        )}
                      </button>
                    </TableHead>
                    <TableHead className="text-zinc-300">Audio Missing</TableHead>
                    <TableHead className="text-zinc-300">Loudness</TableHead>
                    <TableHead className="text-zinc-300">Lip-Sync</TableHead>
                    <TableHead className="text-zinc-300">Subtitle Timing</TableHead>
                    <TableHead className="text-zinc-300">BGM</TableHead>
                    <TableHead className="text-zinc-300">Glitches</TableHead>
                    <TableHead className="text-zinc-300">Visual Quality</TableHead>
                    <TableHead className="text-zinc-300">
                      <button
                        onClick={() => handleSort("score")}
                        className="flex items-center gap-1 hover:text-white"
                      >
                        Score
                        {sortField === "score" && (
                          sortDirection === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                        )}
                      </button>
                    </TableHead>
                    <TableHead className="text-zinc-300">
                      <button
                        onClick={() => handleSort("created_at")}
                        className="flex items-center gap-1 hover:text-white"
                      >
                        Created At
                        {sortField === "created_at" && (
                          sortDirection === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                        )}
                      </button>
                    </TableHead>
                    <TableHead className="text-zinc-300">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAndSorted.map((job) => {
                    const result = job.result_json || {};
                    const isExpanded = selectedJob?.id === job.id;

                    return (
                      <>
                        <TableRow
                          key={job.id}
                          className="border-zinc-800 hover:bg-zinc-800/50 cursor-pointer"
                          onClick={() => setSelectedJob(isExpanded ? null : job)}
                        >
                          <TableCell className="text-white font-medium">
                            {job.file_name || "Unknown"}
                          </TableCell>
                          <TableCell className="text-zinc-400">
                            {job.project ? `${job.project.code} - ${job.project.name}` : "N/A"}
                          </TableCell>
                          <TableCell>{getStatusBadge(job.status, result)}</TableCell>
                          <TableCell className="text-zinc-400">{getQCValue(job, "audioMissing")}</TableCell>
                          <TableCell className="text-zinc-400">{getQCValue(job, "loudness")}</TableCell>
                          <TableCell className="text-zinc-400">{getQCValue(job, "lipSync")}</TableCell>
                          <TableCell className="text-zinc-400">{getQCValue(job, "subtitleTiming")}</TableCell>
                          <TableCell className="text-zinc-400">{getQCValue(job, "bgm")}</TableCell>
                          <TableCell className="text-zinc-400">{getQCValue(job, "glitches")}</TableCell>
                          <TableCell className="text-zinc-400">{getQCValue(job, "visualQuality")}</TableCell>
                          <TableCell className="text-zinc-400">
                            <Badge variant="outline" className="border-zinc-600">
                              {getQCValue(job, "score")}/100
                            </Badge>
                          </TableCell>
                          <TableCell className="text-zinc-400">
                            {new Date(job.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  // Download or view details
                                }}
                                className="h-8 w-8 p-0 text-zinc-400 hover:text-white"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                        {isExpanded && (
                          <TableRow className="border-zinc-800 bg-zinc-900/30">
                            <TableCell colSpan={13} className="p-6">
                              <div className="space-y-4">
                                <h4 className="font-semibold text-white">QC Report Details</h4>
                                <pre className="text-xs text-zinc-400 bg-zinc-950 p-4 rounded overflow-auto max-h-96">
                                  {JSON.stringify(result, null, 2)}
                                </pre>
                                {job.error_message && (
                                  <div className="text-red-400 text-sm">
                                    <strong>Error:</strong> {job.error_message}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
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
