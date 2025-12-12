"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { FileUploadZone } from "@/components/upload/file-upload-zone";
import { DriveUploader } from "@/components/drive/drive-uploader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  FileVideo,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Download,
  ExternalLink,
  MoreVertical,
  Pause,
  Trash2,
  RefreshCw,
  ArrowRight,
  Zap,
  FolderOpen,
  Users,
  TrendingUp,
  Activity,
  FileSpreadsheet,
  GitBranch,
  ClipboardCheck,
  Workflow,
  Languages,
  Mic,
  Music,
  Subtitles,
  PlayCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import Link from "next/link";

interface RecentFile {
  id: string;
  file_name: string;
  original_file_name: string;
  status: string;
  storage_path?: string;
  drive_link?: string;
  drive_file_id?: string;
  qc_report?: any;
  created_at: string;
  progress?: number;
  score?: number;
  project_id?: string;
  project?: { id: string; code: string; name: string };
}

interface WorkflowStats {
  activeProjects: number;
  pendingDeliveries: number;
  assignmentsInProgress: number;
  qcPending: number;
  qcCompleted: number;
  vendorsActive: number;
}

interface ProjectWithStages {
  id: string;
  code: string;
  name: string;
  status: string;
  stages: {
    translation: string;
    dubbing: string;
    mixing: string;
    subtitling: string;
  };
  fileCount: number;
  qcPassed: number;
  qcFailed: number;
}

export default function DashboardPage() {
  const { toast } = useToast();
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
  const [projects, setProjects] = useState<ProjectWithStages[]>([]);
  const [stats, setStats] = useState<WorkflowStats>({
    activeProjects: 0,
    pendingDeliveries: 0,
    assignmentsInProgress: 0,
    qcPending: 0,
    qcCompleted: 0,
    vendorsActive: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboardData = useCallback(async () => {
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

      // Parallel fetch all data
      const [projectsRes, deliveriesRes, qcJobsRes, assignmentsRes, vendorsRes, stagesRes] = await Promise.all([
        supabase.from("projects").select("*").eq("organization_id", profile.organization_id).order("created_at", { ascending: false }).limit(5),
        supabase.from("deliveries").select("*").eq("organization_id", profile.organization_id).order("created_at", { ascending: false }).limit(10),
        supabase.from("qc_jobs").select("*").eq("organisation_id", profile.organization_id).order("created_at", { ascending: false }).limit(50),
        supabase.from("assignments").select("*").eq("organization_id", profile.organization_id),
        supabase.from("profiles").select("*").eq("organization_id", profile.organization_id).eq("role", "vendor"),
        supabase.from("project_stages").select("*").eq("organization_id", profile.organization_id),
      ]);

      const projectsData = projectsRes.data || [];
      const deliveries = deliveriesRes.data || [];
      const qcJobs = qcJobsRes.data || [];
      const assignments = assignmentsRes.data || [];
      const vendors = vendorsRes.data || [];
      const stages = stagesRes.data || [];

      // Calculate stats
      setStats({
        activeProjects: projectsData.filter(p => p.status === "active" || !p.status).length,
        pendingDeliveries: deliveries.filter(d => d.status === "processing" || d.status === "uploading").length,
        assignmentsInProgress: assignments.filter(a => a.status === "in_progress" || a.status === "pending").length,
        qcPending: qcJobs.filter(j => ["queued", "running", "processing"].includes(j.status)).length,
        qcCompleted: qcJobs.filter(j => j.status === "completed").length,
        vendorsActive: vendors.length,
      });

      // Build projects with stages
      const projectsWithStages: ProjectWithStages[] = projectsData.map(project => {
        const projectStages = stages.filter(s => s.project_id === project.id);
        const projectJobs = qcJobs.filter(j => j.project_id === project.id);
        
        const stageMap: Record<string, string> = {};
        projectStages.forEach(s => { stageMap[s.stage] = s.status; });

        return {
          id: project.id,
          code: project.code,
          name: project.name,
          status: project.status || "active",
          stages: {
            translation: stageMap["translation"] || "pending",
            dubbing: stageMap["dubbing"] || "pending",
            mixing: stageMap["mixing"] || "pending",
            subtitling: stageMap["subtitling"] || "pending",
          },
          fileCount: projectJobs.length,
          qcPassed: projectJobs.filter(j => j.status === "completed" && j.result?.status === "passed").length,
          qcFailed: projectJobs.filter(j => j.status === "failed" || (j.status === "completed" && j.result?.status === "failed")).length,
        };
      });

      setProjects(projectsWithStages);

      // Build recent files
      const filesMap = new Map<string, RecentFile>();
      deliveries.forEach((d) => {
        filesMap.set(d.id, { ...d, progress: d.status === "qc_passed" || d.status === "qc_failed" ? 100 : (d.progress || 0) });
      });

      qcJobs.forEach((job) => {
        const existing = filesMap.get(job.delivery_id) || {};
        filesMap.set(job.delivery_id || job.id, {
          ...existing,
          id: job.delivery_id || job.id,
          file_name: job.file_name || (existing as any).file_name,
          original_file_name: job.file_name || (existing as any).original_file_name,
          status: job.status === "completed" ? "qc_passed" : job.status === "failed" ? "qc_failed" : job.status,
          drive_link: job.drive_link,
          drive_file_id: job.drive_file_id,
          qc_report: job.result,
          created_at: job.created_at,
          progress: job.progress !== undefined && job.progress !== null ? job.progress : (job.status === "completed" || job.status === "failed" ? 100 : job.status === "queued" ? 0 : 5),
          score: job.result?.summary?.score,
          project_id: job.project_id || (existing as any).project_id,
        });
      });

      const files = Array.from(filesMap.values()).slice(0, 8);

      const projectIds = [...new Set(files.map((f) => f.project_id).filter(Boolean))];
      if (projectIds.length > 0) {
        const { data: projectsInfo } = await supabase.from("projects").select("id, code, name").in("id", projectIds);
        files.forEach((file) => {
          if (file.project_id) file.project = projectsInfo?.find((p) => p.id === file.project_id);
        });
      }

      setRecentFiles(files);
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 10000);
    return () => clearInterval(interval);
  }, [fetchDashboardData]);

  const getStatusInfo = (status: string) => {
    switch (status) {
      case "qc_passed": case "completed":
        return { label: "Passed", color: "text-green-400", icon: CheckCircle2 };
      case "qc_failed": case "failed":
        return { label: "Failed", color: "text-red-400", icon: XCircle };
      case "queued":
        return { label: "Queued", color: "text-zinc-400", icon: Clock };
      case "running": case "processing":
        return { label: "Processing", color: "text-blue-400", icon: Loader2 };
      default:
        return { label: status, color: "text-zinc-400", icon: Clock };
    }
  };

  const isProcessing = (status: string) => ["queued", "running", "processing", "uploading"].includes(status);

  const handleDownload = async (file: RecentFile) => {
    try {
      if (file.drive_link || file.drive_file_id) {
        const fileId = file.drive_file_id || file.drive_link?.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1];
        if (fileId) window.open(`https://drive.google.com/uc?export=download&id=${fileId}`, "_blank");
      } else if (file.storage_path) {
        const { data } = await supabase.storage.from("deliveries").createSignedUrl(file.storage_path, 3600);
        if (data?.signedUrl) window.open(data.signedUrl, "_blank");
      }
      toast({ title: "Download started" });
    } catch {
      toast({ title: "Download failed", variant: "destructive" });
    }
  };

  const handleOpenInDrive = (file: RecentFile) => {
    if (file.drive_link) window.open(file.drive_link, "_blank");
    else if (file.drive_file_id) window.open(`https://drive.google.com/file/d/${file.drive_file_id}/view`, "_blank");
  };

  const handlePause = async (file: RecentFile) => {
    try {
      await fetch("/api/qc/cancel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobIds: [file.id] }) });
      toast({ title: "Job paused" });
      fetchDashboardData();
    } catch {
      toast({ title: "Failed to pause", variant: "destructive" });
    }
  };

  const handleDelete = async (file: RecentFile) => {
    if (!confirm("Delete this file?")) return;
    try {
      await supabase.from("deliveries").delete().eq("id", file.id);
      await supabase.from("qc_jobs").delete().eq("delivery_id", file.id);
      toast({ title: "File deleted" });
      fetchDashboardData();
    } catch {
      toast({ title: "Failed to delete", variant: "destructive" });
    }
  };

  const formatDate = (dateString: string) => new Date(dateString).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  const getStageIcon = (stage: string) => {
    switch (stage) {
      case "translation": return Languages;
      case "dubbing": return Mic;
      case "mixing": return Music;
      case "subtitling": return Subtitles;
      default: return ClipboardCheck;
    }
  };

  const getStageColor = (status: string) => {
    switch (status) {
      case "completed": return "text-green-400 bg-green-500/10";
      case "in_progress": return "text-blue-400 bg-blue-500/10";
      default: return "text-zinc-500 bg-zinc-500/10";
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header - Workflow Focused */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-white mb-1 sm:mb-2 flex items-center gap-3">
            <Workflow className="h-8 w-8 text-purple-400" />
            Workflow Dashboard
          </h1>
          <p className="text-sm sm:text-base text-zinc-400">
            Manage your media production pipeline
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {stats.qcPending > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20">
              <Loader2 className="h-3.5 w-3.5 text-blue-400 animate-spin" />
              <span className="text-xs text-blue-400 font-medium">{stats.qcPending} QC running</span>
            </div>
          )}
          <Button variant="ghost" size="sm" onClick={fetchDashboardData} disabled={refreshing} className="h-8 w-8 p-0">
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Workflow Pipeline Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { value: stats.activeProjects, label: "Active Projects", icon: FolderOpen, color: "purple", href: "/dashboard/projects" },
          { value: stats.pendingDeliveries, label: "Pending Deliveries", icon: FileVideo, color: "blue", href: "/dashboard/deliveries" },
          { value: stats.assignmentsInProgress, label: "Assignments", icon: GitBranch, color: "orange", href: "/dashboard/assignments" },
          { value: stats.vendorsActive, label: "Vendors", icon: Users, color: "green", href: "/dashboard/vendors" },
          { value: stats.qcCompleted, label: "QC Completed", icon: CheckCircle2, color: "green", href: "/dashboard/qc" },
          { value: stats.qcPending, label: "QC Pending", icon: Loader2, color: "blue", href: "/dashboard/qc/bulk", animate: stats.qcPending > 0 },
        ].map((stat, i) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Link href={stat.href}>
              <Card className={`glass border-zinc-800/50 overflow-hidden group hover:border-${stat.color}-500/30 transition-all cursor-pointer h-full`}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-xl bg-${stat.color}-500/10 flex items-center justify-center flex-shrink-0`}>
                      <stat.icon className={cn(`h-5 w-5 text-${stat.color}-400`, stat.animate && "animate-spin")} />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-white">{stat.value}</p>
                      <p className="text-[10px] text-zinc-500 leading-tight">{stat.label}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </motion.div>
        ))}
      </div>

      {/* Production Pipeline - Project Cards */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Activity className="h-5 w-5 text-purple-400" />
            Production Pipeline
          </h2>
          <Link href="/dashboard/projects">
            <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-white">
              View All <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </Link>
        </div>

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-40 bg-zinc-800/50 rounded-lg animate-pulse" />)}
          </div>
        ) : projects.length === 0 ? (
          <Card className="glass border-zinc-800/50">
            <CardContent className="p-8 text-center">
              <FolderOpen className="h-12 w-12 text-zinc-600 mx-auto mb-3" />
              <p className="text-zinc-400 mb-4">No active projects. Create one to start your workflow!</p>
              <Link href="/dashboard/projects">
                <Button><FolderOpen className="h-4 w-4 mr-2" />Create Project</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((project, index) => (
              <motion.div
                key={project.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Link href={`/dashboard/qc/bulk?projectId=${project.id}&code=${encodeURIComponent(project.code)}`}>
                  <Card className="glass border-zinc-800/50 hover:border-purple-500/30 transition-all cursor-pointer h-full">
                    <CardContent className="p-4">
                      {/* Project Header */}
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h3 className="text-lg font-mono font-bold text-white">{project.code}</h3>
                          <p className="text-xs text-zinc-500 truncate max-w-[150px]">{project.name}</p>
                        </div>
                        <Badge variant="outline" className={cn(
                          project.status === "completed" ? "border-green-500/30 text-green-400" :
                          project.status === "archived" ? "border-zinc-500/30 text-zinc-400" :
                          "border-blue-500/30 text-blue-400"
                        )}>
                          {project.status || "Active"}
                        </Badge>
                      </div>

                      {/* Workflow Stages */}
                      <div className="grid grid-cols-4 gap-1 mb-3">
                        {(["translation", "dubbing", "mixing", "subtitling"] as const).map((stage) => {
                          const StageIcon = getStageIcon(stage);
                          const status = project.stages[stage];
                          const colorClass = getStageColor(status);
                          return (
                            <div
                              key={stage}
                              className={cn("flex flex-col items-center p-2 rounded-lg", colorClass)}
                              title={`${stage}: ${status}`}
                            >
                              <StageIcon className="h-4 w-4" />
                              <span className="text-[8px] mt-1 uppercase">{stage.slice(0, 3)}</span>
                            </div>
                          );
                        })}
                      </div>

                      {/* QC Stats */}
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-zinc-500">{project.fileCount} files</span>
                        <div className="flex items-center gap-2">
                          {project.qcPassed > 0 && <span className="text-green-400">✓ {project.qcPassed}</span>}
                          {project.qcFailed > 0 && <span className="text-red-400">✗ {project.qcFailed}</span>}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Upload Zone */}
      <div className="glass border-zinc-800/50 rounded-lg p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 mb-4">
          <h2 className="text-lg sm:text-xl font-semibold text-white">Upload Deliveries</h2>
          <DriveUploader buttonText="Import from Drive" buttonVariant="outline" />
        </div>
        <FileUploadZone />
      </div>

      {/* Bottom Section - Recent Activity + Quick Actions */}
      <div className="grid gap-4 lg:grid-cols-7">
        {/* Recent Files */}
        <div className="lg:col-span-5">
          <Card className="glass border-zinc-800/50">
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Recent Activity</h3>
                <Link href="/dashboard/deliveries">
                  <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-white">
                    View All <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </Link>
              </div>

              {loading ? (
                <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-14 bg-zinc-800/50 rounded-lg animate-pulse" />)}</div>
              ) : recentFiles.length === 0 ? (
                <div className="text-center py-6">
                  <FileVideo className="h-10 w-10 text-zinc-600 mx-auto mb-2" />
                  <p className="text-sm text-zinc-400">No recent files. Upload some to get started!</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {recentFiles.map((file, index) => {
                    const statusInfo = getStatusInfo(file.status);
                    const StatusIcon = statusInfo.icon;
                    const processing = isProcessing(file.status);
                    const hasDriveLink = !!(file.drive_link || file.drive_file_id);

                    return (
                      <motion.div
                        key={file.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.03 }}
                        className="group p-3 rounded-lg bg-zinc-900/30 border border-zinc-800/30 hover:border-zinc-700/50 transition-all"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-lg bg-zinc-800/50 flex items-center justify-center flex-shrink-0">
                            <FileVideo className="h-4 w-4 text-zinc-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">{file.original_file_name || file.file_name || "Unknown"}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              {file.project && <span className="text-[10px] text-zinc-500">{file.project.code}</span>}
                              <span className="text-[10px] text-zinc-600">•</span>
                              <span className="text-[10px] text-zinc-500">{formatDate(file.created_at)}</span>
                              {hasDriveLink && <Badge variant="outline" className="text-[8px] border-blue-500/30 text-blue-400 px-1 py-0 h-3.5">Drive</Badge>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <StatusIcon className={cn("h-4 w-4", statusInfo.color, processing && "animate-spin")} />
                            {file.score !== undefined && (
                              <span className={cn("text-xs font-medium", file.score >= 80 ? "text-green-400" : file.score >= 60 ? "text-yellow-400" : "text-red-400")}>
                                {file.score}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="sm" onClick={() => handleDownload(file)} className="h-7 w-7 p-0 text-zinc-400 hover:text-white">
                              <Download className="h-3.5 w-3.5" />
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-zinc-400 hover:text-white">
                                  <MoreVertical className="h-3.5 w-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-40 bg-zinc-900 border-zinc-700">
                                {hasDriveLink && <DropdownMenuItem onClick={() => handleOpenInDrive(file)}><ExternalLink className="h-3.5 w-3.5 mr-2" />Open in Drive</DropdownMenuItem>}
                                <DropdownMenuItem onClick={() => handleDownload(file)}><Download className="h-3.5 w-3.5 mr-2" />Download</DropdownMenuItem>
                                <DropdownMenuSeparator className="bg-zinc-700" />
                                {processing && <DropdownMenuItem onClick={() => handlePause(file)} className="text-orange-400"><Pause className="h-3.5 w-3.5 mr-2" />Pause</DropdownMenuItem>}
                                <DropdownMenuItem onClick={() => handleDelete(file)} className="text-red-400"><Trash2 className="h-3.5 w-3.5 mr-2" />Delete</DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="lg:col-span-2">
          <Card className="glass border-zinc-800/50 h-full">
            <CardContent className="p-4 sm:p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Quick Actions</h3>
              <div className="space-y-3">
                {[
                  { href: "/dashboard/projects", icon: FolderOpen, title: "New Project", desc: "Start a production", color: "purple" },
                  { href: "/dashboard/assignments", icon: GitBranch, title: "Assign Work", desc: "Delegate to vendors", color: "orange" },
                  { href: "/dashboard/qc/bulk", icon: Zap, title: "Run QC", desc: "Automated analysis", color: "blue" },
                  { href: "/dashboard/qc", icon: TrendingUp, title: "View Results", desc: "QC reports", color: "green" },
                ].map((action) => (
                  <Link key={action.href} href={action.href}>
                    <motion.div 
                      whileHover={{ scale: 1.02 }} 
                      className={`p-3 rounded-lg bg-gradient-to-r from-${action.color}-500/10 to-transparent border border-${action.color}-500/20 hover:border-${action.color}-500/40 transition-colors cursor-pointer`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`h-9 w-9 rounded-lg bg-${action.color}-500/20 flex items-center justify-center`}>
                          <action.icon className={`h-4 w-4 text-${action.color}-400`} />
                        </div>
                        <div>
                          <p className={`text-sm font-medium text-${action.color}-300`}>{action.title}</p>
                          <p className="text-[10px] text-zinc-500">{action.desc}</p>
                        </div>
                      </div>
                    </motion.div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
