"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Plus,
  Calendar,
  FolderOpen,
  PlayCircle,
  MoreVertical,
  FileSpreadsheet,
  Trash2,
  Edit,
  Eye,
  FileVideo,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  ExternalLink,
  Download,
  Search,
  Building2,
  UserCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/lib/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Link from "next/link";

interface Project {
  id: string;
  code: string;
  name: string;
  status?: "active" | "completed" | "archived";
  created_at: string;
  fileCount?: number;
  passedCount?: number;
  failedCount?: number;
  processingCount?: number;
  avgScore?: number;
}

interface Vendor {
  id: string;
  full_name: string;
  company_name?: string;
  email?: string;
}

interface ProjectStage {
  id: string;
  organization_id: string;
  project_id: string;
  stage: "translation" | "dubbing" | "mixing" | "subtitling";
  status: "pending" | "in_progress" | "completed";
  assigned_to?: string | null;
}

interface TeamMember {
  id: string;
  full_name: string | null;
  role: string;
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectStages, setProjectStages] = useState<Record<string, ProjectStage[]>>({});
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [vendorAssignments, setVendorAssignments] = useState<Record<string, { vendorId: string; vendorName: string }>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [formData, setFormData] = useState({ name: "", code: "", vendorId: "" });
  const [submitting, setSubmitting] = useState(false);
  const [subscriptionTier, setSubscriptionTier] = useState<"free" | "pro" | "enterprise" | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [exporting, setExporting] = useState<string | null>(null);
  const [assigningVendor, setAssigningVendor] = useState<string | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchProjects = useCallback(async () => {
    try {
      setRefreshing(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id, role")
        .eq("id", user.id)
        .single();

      if (!profile?.organization_id) return;
      setOrganizationId(profile.organization_id);

      // Fetch vendors
      const vendorsRes = await fetch(`/api/vendors/create?organizationId=${profile.organization_id}`);
      if (vendorsRes.ok) {
        const vendorsData = await vendorsRes.json();
        setVendors(vendorsData.vendors || []);
      }

      // Fetch projects
      const { data: projectsData, error } = await supabase
        .from("projects")
        .select("*")
        .eq("organization_id", profile.organization_id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Fetch QC jobs to get file counts and scores per project
      const { data: qcJobs } = await supabase
        .from("qc_jobs")
        .select("project_id, status, result")
        .eq("organisation_id", profile.organization_id);

      // Calculate stats per project
      const projectStats: Record<string, { total: number; passed: number; failed: number; processing: number; scores: number[] }> = {};
      (qcJobs || []).forEach((job) => {
        if (!job.project_id) return;
        if (!projectStats[job.project_id]) {
          projectStats[job.project_id] = { total: 0, passed: 0, failed: 0, processing: 0, scores: [] };
        }
        projectStats[job.project_id].total++;
        if (job.status === "completed" && job.result?.status === "passed") projectStats[job.project_id].passed++;
        else if (job.status === "failed" || (job.status === "completed" && job.result?.status === "failed")) projectStats[job.project_id].failed++;
        else if (["queued", "running", "processing"].includes(job.status)) projectStats[job.project_id].processing++;
        if (job.result?.summary?.score) projectStats[job.project_id].scores.push(job.result.summary.score);
      });

      // Enrich projects with stats
      const enrichedProjects = (projectsData || []).map((project) => {
        const stats = projectStats[project.id] || { total: 0, passed: 0, failed: 0, processing: 0, scores: [] };
        return {
          ...project,
          fileCount: stats.total,
          passedCount: stats.passed,
          failedCount: stats.failed,
          processingCount: stats.processing,
          avgScore: stats.scores.length > 0 ? Math.round(stats.scores.reduce((a, b) => a + b, 0) / stats.scores.length) : undefined,
        };
      });

      setProjects(enrichedProjects);

      // Fetch project stages
      const stagesRes = await fetch(`/api/project-stages?organizationId=${profile.organization_id}`);
      if (stagesRes.ok) {
        const stagesData = await stagesRes.json();
        const grouped: Record<string, ProjectStage[]> = {};
        (stagesData.stages || []).forEach((stage: ProjectStage) => {
          if (!grouped[stage.project_id]) grouped[stage.project_id] = [];
          grouped[stage.project_id].push(stage);
        });
        setProjectStages(grouped);
      }

      // Fetch team members
      const { data: members } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .eq("organization_id", profile.organization_id)
        .neq("role", "vendor");
      if (members) setTeamMembers(members);

      // Fetch subscription tier
      const { data: org } = await supabase
        .from("organizations")
        .select("subscription_tier")
        .eq("id", profile.organization_id)
        .single();
      if (org?.subscription_tier) {
        setSubscriptionTier(org.subscription_tier as "free" | "pro" | "enterprise");
      }
    } catch (error: any) {
      console.error("Error fetching projects:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
    const interval = setInterval(fetchProjects, 10000);
    return () => clearInterval(interval);
  }, [fetchProjects]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: profile } = await supabase.from("profiles").select("organization_id").eq("id", user.id).single();
      if (!profile?.organization_id) throw new Error("No organization found");

      // Create project without settings (settings column may not exist)
      const { data: newProject, error } = await supabase.from("projects").insert({
        organization_id: profile.organization_id,
        code: formData.code.toUpperCase().trim(),
        name: formData.name.trim(),
        naming_convention_regex: "^([A-Z0-9_]+)[-_]?EP[_-]?(\\d{1,4})[_-]?([A-Za-z]+)[_-]?(.+)$",
      }).select().single();

      if (error) throw error;

      // If vendor selected, assign via API
      if (formData.vendorId && formData.vendorId !== "none" && newProject) {
        const selectedVendor = vendors.find(v => v.id === formData.vendorId);
        await fetch("/api/projects/assign-vendor", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: newProject.id,
            vendorId: formData.vendorId,
            vendorName: selectedVendor?.full_name || selectedVendor?.company_name || null,
            organizationId: profile.organization_id,
          }),
        });
      }

      toast({ title: "Project Created", description: `Project "${formData.name}" has been created.`, variant: "success" });
      setDialogOpen(false);
      setFormData({ name: "", code: "", vendorId: "" });
      fetchProjects();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const updateProjectStatus = async (project: Project, status: "active" | "completed" | "archived") => {
    try {
      const { error } = await supabase.from("projects").update({ status }).eq("id", project.id);
      if (error) throw error;
      setProjects((prev) => prev.map((p) => (p.id === project.id ? { ...p, status } : p)));
      toast({ title: "Status updated", description: `Project marked as ${status}` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const assignVendorToProject = async (project: Project, vendorId: string | null) => {
    if (!organizationId) return;
    
    // Handle "none" value
    const actualVendorId = vendorId === "none" ? null : vendorId;
    
    setAssigningVendor(project.id);
    try {
      const vendor = actualVendorId ? vendors.find(v => v.id === actualVendorId) : null;
      const response = await fetch("/api/projects/assign-vendor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          vendorId: actualVendorId,
          vendorName: vendor?.full_name || vendor?.company_name || null,
          organizationId,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to assign vendor");

      // Update local vendorAssignments state
      if (actualVendorId && vendor) {
        setVendorAssignments((prev) => ({
          ...prev,
          [project.id]: {
            vendorId: actualVendorId,
            vendorName: vendor.full_name || vendor.company_name || "Unknown",
          },
        }));
      } else {
        setVendorAssignments((prev) => {
          const updated = { ...prev };
          delete updated[project.id];
          return updated;
        });
      }

      toast({
        title: actualVendorId ? "Vendor Assigned" : "Vendor Removed",
        description: actualVendorId 
          ? `${vendor?.full_name || vendor?.company_name} assigned to ${project.name}`
          : `Vendor removed from ${project.name}`,
      });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setAssigningVendor(null);
    }
  };

  const handleDeleteProject = async (project: Project) => {
    if (!confirm(`Delete project "${project.name}"? This will also delete all associated QC jobs.`)) return;
    try {
      await supabase.from("qc_jobs").delete().eq("project_id", project.id);
      await supabase.from("project_stages").delete().eq("project_id", project.id);
      await supabase.from("projects").delete().eq("id", project.id);
      toast({ title: "Project deleted" });
      fetchProjects();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleExportToSheets = async (project: Project) => {
    setExporting(project.id);
    try {
      const response = await fetch("/api/qc/export-to-sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, projectName: project.name }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (data.sheetUrl) window.open(data.sheetUrl, "_blank");
      toast({ title: "Export successful", description: `Exported ${data.rowCount} results to Google Sheets!` });
    } catch (error: any) {
      toast({ title: "Export failed", description: error.message, variant: "destructive" });
    } finally {
      setExporting(null);
    }
  };

  const handleBeginQC = (project: Project) => {
    window.location.href = `/dashboard/qc/bulk?projectId=${project.id}&code=${encodeURIComponent(project.code)}`;
  };

  const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

  const filteredProjects = projects.filter((p) =>
    !searchQuery || p.code.toLowerCase().includes(searchQuery.toLowerCase()) || p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const stats = {
    total: projects.length,
    active: projects.filter((p) => p.status === "active" || !p.status).length,
    completed: projects.filter((p) => p.status === "completed").length,
    totalFiles: projects.reduce((sum, p) => sum + (p.fileCount || 0), 0),
  };

  const stageLabel = { translation: "Translation", dubbing: "Dubbing", mixing: "Mixing", subtitling: "Subtitling" } as const;
  const stageOrder = ["translation", "dubbing", "mixing", "subtitling"] as const;

  const updateStage = async (stage: ProjectStage, updates: Partial<Pick<ProjectStage, "status">> & { assigned_to?: string | null }) => {
    try {
      const res = await fetch("/api/project-stages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: stage.id, status: updates.status, assignedTo: updates.assigned_to }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const updated = data.stage as ProjectStage;
      setProjectStages((prev) => ({
        ...prev,
        [updated.project_id]: (prev[updated.project_id] || []).map((s) => (s.id === updated.id ? updated : s)),
      }));
      toast({ title: "Stage updated" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6 lg:space-y-8">
      {/* Header with Stats */}
      <div className="glass border-zinc-800/50 rounded-lg p-4 sm:p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold text-white mb-1 sm:mb-2">Projects</h1>
            <p className="text-sm sm:text-base text-zinc-400">Manage your media production projects</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-green-400">{stats.active} active</span>
              <span className="text-zinc-600">•</span>
              <span className="text-blue-400">{stats.completed} completed</span>
              <span className="text-zinc-600">•</span>
              <span className="text-zinc-400">{stats.totalFiles} files</span>
            </div>
            <Button variant="ghost" size="sm" onClick={fetchProjects} disabled={refreshing} className="h-8 w-8 p-0">
              <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            </Button>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button className="w-full sm:w-auto"><Plus className="h-4 w-4 mr-2" />Create Project</Button>
              </DialogTrigger>
              <DialogContent className="mx-4 sm:mx-auto max-w-md">
                <DialogHeader>
                  <DialogTitle>Create New Project</DialogTitle>
                  <DialogDescription>Add a new project to organize your media deliveries</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit}>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label htmlFor="code">Project Code</Label>
                      <Input id="code" placeholder="PRT" value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} required maxLength={10} className="uppercase" />
                      <p className="text-xs text-zinc-500">Short code used in filenames (e.g., PRT, ABC)</p>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="name">Project Name</Label>
                      <Input id="name" placeholder="Project Name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
                    </div>
                    <div className="grid gap-2">
                      <Label>Assign Vendor (Optional)</Label>
                      <Select value={formData.vendorId || "none"} onValueChange={(val) => setFormData({ ...formData, vendorId: val === "none" ? "" : val })}>
                        <SelectTrigger className="bg-zinc-800 border-zinc-700">
                          <SelectValue placeholder="Select a vendor..." />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-700">
                          <SelectItem value="none">No Vendor</SelectItem>
                          {vendors.map((vendor) => (
                            <SelectItem key={vendor.id} value={vendor.id}>
                              <div className="flex items-center gap-2">
                                <Building2 className="h-3 w-3 text-zinc-400" />
                                {vendor.full_name}{vendor.company_name && ` (${vendor.company_name})`}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-zinc-500">Vendor will appear in QC exports</p>
                    </div>
                  </div>
                  <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
                    <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="w-full sm:w-auto">Cancel</Button>
                    <Button type="submit" disabled={submitting} className="w-full sm:w-auto">{submitting ? "Creating..." : "Create Project"}</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <Input placeholder="Search projects..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10 bg-zinc-900/50 border-zinc-800/50" />
        </div>
      </div>

      {/* Projects Grid */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-48 w-full" />)}
        </div>
      ) : filteredProjects.length === 0 ? (
        <Card className="glass border-zinc-800/50">
          <CardContent className="p-12 text-center">
            <FolderOpen className="h-12 w-12 text-zinc-600 mx-auto mb-3" />
            <p className="text-zinc-400 mb-4">{searchQuery ? "No projects match your search" : "No projects yet"}</p>
            <Button onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4 mr-2" />Create Your First Project</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredProjects.map((project, index) => {
            const stages = projectStages[project.id] || [];
            const completedStages = stages.filter((s) => s.status === "completed").length;
            const stageProgress = stages.length > 0 ? (completedStages / 4) * 100 : 0;

            return (
              <motion.div
                key={project.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card className="glass border-zinc-800/50 hover:border-zinc-700/50 transition-all group h-full">
                  <CardContent className="p-5">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-purple-600/10 flex items-center justify-center">
                          <FolderOpen className="h-6 w-6 text-purple-400" />
                        </div>
                        <div>
                          <button
                            onClick={() => { setSelectedProject(project); setDetailModalOpen(true); }}
                            className="text-lg font-mono font-bold text-white hover:text-purple-400 transition-colors text-left"
                          >
                            {project.code}
                          </button>
                          <p className="text-sm text-zinc-400 truncate max-w-[150px]">{project.name}</p>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-zinc-400 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56 bg-zinc-900 border-zinc-700">
                          <DropdownMenuItem onClick={() => { setSelectedProject(project); setDetailModalOpen(true); }}>
                            <Eye className="h-4 w-4 mr-2" />View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleBeginQC(project)}>
                            <PlayCircle className="h-4 w-4 mr-2" />Begin QC
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleExportToSheets(project)} disabled={exporting === project.id}>
                            <FileSpreadsheet className="h-4 w-4 mr-2" />{exporting === project.id ? "Exporting..." : "Export to Sheets"}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator className="bg-zinc-700" />
                          <div className="px-2 py-1.5">
                            <div className="text-xs text-zinc-500 mb-1 flex items-center gap-1">
                              <Building2 className="h-3 w-3" /> Assign Vendor
                            </div>
                            <Select
                              value={vendorAssignments[project.id]?.vendorId || "none"}
                              onValueChange={(val) => assignVendorToProject(project, val)}
                              disabled={assigningVendor === project.id}
                            >
                              <SelectTrigger className="h-8 text-xs bg-zinc-800 border-zinc-700">
                                <SelectValue placeholder="Select vendor..." />
                              </SelectTrigger>
                              <SelectContent className="bg-zinc-900 border-zinc-700">
                                <SelectItem value="none">No Vendor</SelectItem>
                                {vendors.map((v) => (
                                  <SelectItem key={v.id} value={v.id}>
                                    {v.full_name}{v.company_name && ` (${v.company_name})`}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <DropdownMenuSeparator className="bg-zinc-700" />
                          <DropdownMenuItem onClick={() => handleDeleteProject(project)} className="text-red-400">
                            <Trash2 className="h-4 w-4 mr-2" />Delete Project
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {/* Status Badge & Vendor */}
                    <div className="flex items-center gap-2 mb-4 flex-wrap">
                      <Badge variant="outline" className={cn(
                        project.status === "completed" ? "border-green-500/30 text-green-400 bg-green-500/10" :
                        project.status === "archived" ? "border-zinc-500/30 text-zinc-400 bg-zinc-500/10" :
                        "border-blue-500/30 text-blue-400 bg-blue-500/10"
                      )}>
                        {project.status === "completed" ? "Completed" : project.status === "archived" ? "Archived" : "Active"}
                      </Badge>
                      {vendorAssignments[project.id]?.vendorName && (
                        <Badge variant="outline" className="border-purple-500/30 text-purple-400 bg-purple-500/10">
                          <Building2 className="h-3 w-3 mr-1" />
                          {vendorAssignments[project.id].vendorName}
                        </Badge>
                      )}
                      {project.avgScore !== undefined && (
                        <span className={cn(
                          "text-xs font-medium",
                          project.avgScore >= 80 ? "text-green-400" : project.avgScore >= 60 ? "text-yellow-400" : "text-red-400"
                        )}>
                          Avg: {project.avgScore}/100
                        </span>
                      )}
                    </div>

                    {/* Stage Progress */}
                    <div className="mb-4">
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="text-zinc-500">Stage Progress</span>
                        <span className="text-zinc-400">{completedStages}/4 complete</span>
                      </div>
                      <Progress value={stageProgress} className="h-1.5" />
                    </div>

                    {/* File Stats */}
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      <div className="text-center p-2 rounded-lg bg-zinc-800/30">
                        <p className="text-lg font-bold text-white">{project.fileCount || 0}</p>
                        <p className="text-[10px] text-zinc-500">Files</p>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-green-500/10">
                        <p className="text-lg font-bold text-green-400">{project.passedCount || 0}</p>
                        <p className="text-[10px] text-zinc-500">Passed</p>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-red-500/10">
                        <p className="text-lg font-bold text-red-400">{project.failedCount || 0}</p>
                        <p className="text-[10px] text-zinc-500">Failed</p>
                      </div>
                    </div>

                    {/* Processing indicator */}
                    {(project.processingCount || 0) > 0 && (
                      <div className="flex items-center gap-2 mb-4 px-2 py-1.5 rounded bg-blue-500/10 border border-blue-500/20">
                        <Loader2 className="h-3.5 w-3.5 text-blue-400 animate-spin" />
                        <span className="text-xs text-blue-400">{project.processingCount} files processing</span>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" className="flex-1 border-purple-500/30 text-purple-300 hover:bg-purple-500/10" onClick={() => handleBeginQC(project)}>
                        <PlayCircle className="h-4 w-4 mr-1.5" />QC
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1 border-zinc-700" onClick={() => handleExportToSheets(project)} disabled={exporting === project.id || !project.fileCount}>
                        <FileSpreadsheet className="h-4 w-4 mr-1.5" />{exporting === project.id ? "..." : "Export"}
                      </Button>
                    </div>

                    {/* Date */}
                    <div className="flex items-center gap-1.5 mt-3 text-xs text-zinc-500">
                      <Calendar className="h-3.5 w-3.5" />
                      Created {formatDate(project.created_at)}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Project Detail Modal */}
      <Dialog open={detailModalOpen} onOpenChange={setDetailModalOpen}>
        <DialogContent className="max-w-2xl bg-zinc-900 border-zinc-700 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-3">
              <FolderOpen className="h-5 w-5 text-purple-400" />
              {selectedProject?.code} - {selectedProject?.name}
            </DialogTitle>
          </DialogHeader>
          
          {selectedProject && (
            <div className="space-y-6 mt-4">
              {/* Stats */}
              <div className="grid grid-cols-4 gap-3">
                <div className="text-center p-3 rounded-lg bg-zinc-800/50">
                  <p className="text-2xl font-bold text-white">{selectedProject.fileCount || 0}</p>
                  <p className="text-xs text-zinc-500">Total Files</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-green-500/10">
                  <p className="text-2xl font-bold text-green-400">{selectedProject.passedCount || 0}</p>
                  <p className="text-xs text-zinc-500">Passed</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-red-500/10">
                  <p className="text-2xl font-bold text-red-400">{selectedProject.failedCount || 0}</p>
                  <p className="text-xs text-zinc-500">Failed</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-blue-500/10">
                  <p className="text-2xl font-bold text-blue-400">{selectedProject.processingCount || 0}</p>
                  <p className="text-xs text-zinc-500">Processing</p>
                </div>
              </div>

              {/* Average Score */}
              {selectedProject.avgScore !== undefined && (
                <div className="p-4 rounded-lg bg-zinc-800/50 flex items-center justify-between">
                  <span className="text-zinc-400">Average QC Score</span>
                  <span className={cn(
                    "text-2xl font-bold",
                    selectedProject.avgScore >= 80 ? "text-green-400" : selectedProject.avgScore >= 60 ? "text-yellow-400" : "text-red-400"
                  )}>
                    {selectedProject.avgScore}/100
                  </span>
                </div>
              )}

              {/* Status Control */}
              <div className="space-y-2">
                <Label>Project Status</Label>
                <Select
                  value={selectedProject.status || "active"}
                  onValueChange={(val) => {
                    if (val === "active" || val === "completed" || val === "archived") {
                      updateProjectStatus(selectedProject, val);
                      setSelectedProject({ ...selectedProject, status: val });
                    }
                  }}
                >
                  <SelectTrigger className="w-full bg-zinc-800 border-zinc-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-700">
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Vendor Assignment */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-purple-400" />
                  Assigned Vendor
                </Label>
                <Select
                  value={vendorAssignments[selectedProject.id]?.vendorId || "none"}
                  onValueChange={(val) => assignVendorToProject(selectedProject, val)}
                  disabled={assigningVendor === selectedProject.id}
                >
                  <SelectTrigger className="w-full bg-zinc-800 border-zinc-700">
                    <SelectValue placeholder="Select a vendor..." />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-700">
                    <SelectItem value="none">No Vendor Assigned</SelectItem>
                    {vendors.map((vendor) => (
                      <SelectItem key={vendor.id} value={vendor.id}>
                        <div className="flex items-center gap-2">
                          <UserCircle className="h-4 w-4 text-zinc-400" />
                          {vendor.full_name}
                          {vendor.company_name && <span className="text-zinc-500">({vendor.company_name})</span>}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {vendors.length === 0 && (
                  <p className="text-xs text-zinc-500">
                    No vendors available. <Link href="/dashboard/vendors" className="text-purple-400 hover:underline">Add vendors</Link> first.
                  </p>
                )}
                {vendorAssignments[selectedProject.id]?.vendorName && (
                  <p className="text-xs text-zinc-400">
                    Currently assigned to: <span className="text-purple-400">{vendorAssignments[selectedProject.id].vendorName}</span>
                  </p>
                )}
              </div>

              {/* Stages */}
              <div className="space-y-3">
                <Label>Production Stages</Label>
                {stageOrder.map((stageName) => {
                  const stages = projectStages[selectedProject.id] || [];
                  const stage = stages.find((s) => s.stage === stageName);
                  const status = stage?.status || "pending";
                  return (
                    <div key={stageName} className="flex items-center gap-3 p-3 rounded-lg bg-zinc-800/50">
                      <span className="text-sm text-white w-32">{stageLabel[stageName]}</span>
                      <Select
                        value={status}
                        onValueChange={(val) => stage ? updateStage(stage, { status: val as ProjectStage["status"] }) : null}
                      >
                        <SelectTrigger className="w-32 bg-zinc-800 border-zinc-700">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-700">
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="in_progress">In Progress</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select
                        value={stage?.assigned_to || "unassigned"}
                        onValueChange={(val) => stage ? updateStage(stage, { assigned_to: val === "unassigned" ? null : val }) : null}
                      >
                        <SelectTrigger className="flex-1 bg-zinc-800 border-zinc-700">
                          <SelectValue placeholder="Assign..." />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-700">
                          <SelectItem value="unassigned">Unassigned</SelectItem>
                          {teamMembers.map((m) => (
                            <SelectItem key={m.id} value={m.id}>{m.full_name || "Unnamed"}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 pt-4 border-t border-zinc-800">
                <Button onClick={() => handleBeginQC(selectedProject)} className="bg-purple-600 hover:bg-purple-700">
                  <PlayCircle className="h-4 w-4 mr-2" />Begin QC
                </Button>
                <Button onClick={() => handleExportToSheets(selectedProject)} variant="outline" className="border-zinc-700" disabled={exporting === selectedProject.id || !selectedProject.fileCount}>
                  <FileSpreadsheet className="h-4 w-4 mr-2" />{exporting === selectedProject.id ? "Exporting..." : "Export to Sheets"}
                </Button>
                <Button onClick={() => { handleDeleteProject(selectedProject); setDetailModalOpen(false); }} variant="outline" className="border-red-500/30 text-red-400 ml-auto">
                  <Trash2 className="h-4 w-4 mr-2" />Delete
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
