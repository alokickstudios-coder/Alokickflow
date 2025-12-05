"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Plus, Calendar, FolderOpen, PlayCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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

interface Project {
  id: string;
  code: string;
  name:string;
  status?: "active" | "completed" | "archived";
  created_at: string;
}

interface ProjectStage {
  id: string;
  project_id: string;
  name: string;
  status: "pending" | "in_progress" | "completed";
  stage_order: number;
}

interface TeamMember {
  id: string;
  full_name: string | null;
  role: string;
}

function StatusBadge({ status }: { status: "active" | "completed" | "archived" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        status === "active"
          ? "border-green-500/20 bg-green-500/10 text-green-400"
          : "border-zinc-500/20 bg-zinc-500/10 text-zinc-400"
      )}
    >
      {status === "active" ? "Active" : "Archived"}
    </span>
  );
}

// Mobile Project Card
function ProjectCard({ project, formatDate }: { project: Project; formatDate: (date: string) => string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 rounded-lg bg-zinc-900/50 border border-zinc-800/50"
    >
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg bg-purple-500/20 flex items-center justify-center shrink-0">
          <FolderOpen className="h-5 w-5 text-purple-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-mono font-bold text-white text-lg">{project.code}</p>
              <p className="text-sm text-zinc-300 mt-0.5">{project.name}</p>
            </div>
            <StatusBadge status={project.status ?? "active"} />
          </div>
          <div className="flex items-center gap-1.5 mt-3 text-xs text-zinc-500">
            <Calendar className="h-3.5 w-3.5" />
            {formatDate(project.created_at)}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectStages, setProjectStages] = useState<Record<string, ProjectStage[]>>({});
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({ name: "", code: "" });
  const [submitting, setSubmitting] = useState(false);
  const [subscriptionTier, setSubscriptionTier] = useState<"free" | "pro" | "enterprise" | null>(null);
  const { toast } = useToast();

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Authentication Error",
          description: "Please log in to view projects",
          variant: "destructive",
        });
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("organization_id, role")
        .eq("id", user.id)
        .single();

      if (profileError || !profile?.organization_id) {
        toast({
          title: "Error",
          description: "No organization found",
          variant: "destructive",
        });
        return;
      }

      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("organization_id", profile.organization_id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setProjects(data || []);

      const stagesByProject: Record<string, ProjectStage[]> = {};
      for (const project of data || []) {
        const res = await fetch(`/api/projects/${project.id}/stages`);
        if (res.ok) {
          const { stages } = await res.json();
          stagesByProject[project.id] = stages;
        }
      }
      setProjectStages(stagesByProject);


      // Fetch team members (non-vendor)
      const { data: members } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .eq("organization_id", profile.organization_id)
        .neq("role", "vendor");
      if (members) setTeamMembers(members);

      // Fetch subscription tier for gating QC features
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
      toast({
        title: "Error",
        description: error.message || "Failed to fetch projects",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("Not authenticated");
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", user.id)
        .single();

      if (!profile?.organization_id) {
        throw new Error("No organization found");
      }

      const { error } = await supabase.from("projects").insert({
        organization_id: profile.organization_id,
        code: formData.code.toUpperCase().trim(),
        name: formData.name.trim(),
        naming_convention_regex:
          "^([A-Z0-9_]+)[-_]?EP[_-]?(\\d{1,4})[_-]?([A-Za-z]+)[_-]?(.+)$",
      });

      if (error) throw error;

      toast({
        title: "Project Created",
        description: `Project "${formData.name}" has been created successfully.`,
        variant: "success",
      });

      setDialogOpen(false);
      setFormData({ name: "", code: "" });
      fetchProjects();
    } catch (error: any) {
      console.error("Error creating project:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create project",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const updateProjectStatus = async (project: Project, status: "active" | "completed" | "archived") => {
    try {
      const { error } = await supabase.from("projects").update({ status }).eq("id", project.id);
      if (error) throw error;
      setProjects((prev) => prev.map((p) => (p.id === project.id ? { ...p, status } : p)));
      toast({
        title: "Status updated",
        description: `Project marked as ${status}`,
        variant: "success",
      });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to update status",
        variant: "destructive",
      });
    }
  };

  const addStage = async (projectId: string) => {
    const stageName = prompt("Enter stage name:");
    if (!stageName) return;

    try {
      const res = await fetch(`/api/projects/${projectId}/stages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: stageName,
          stage_order: (projectStages[projectId]?.length || 0) + 1,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add stage");
      fetchProjects();
      toast({
        title: "Stage Added",
        variant: "success",
      });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to add stage",
        variant: "destructive",
      });
    }
  };
  
  const deleteStage = async (projectId: string, stageId: string) => {
    if (!confirm("Are you sure you want to delete this stage?")) return;
  
    try {
      const res = await fetch(`/api/projects/${projectId}/stages/${stageId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete stage");
      fetchProjects();
      toast({
        title: "Stage Deleted",
        variant: "success",
      });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to delete stage",
        variant: "destructive",
      });
    }
  };
  

  const updateStage = async (
    projectId: string,
    stageId: string,
    updates: Partial<ProjectStage>
  ) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/stages/${stageId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update stage");
      fetchProjects();
      toast({
        title: "Stage updated",
        variant: "success",
      });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to update stage",
        variant: "destructive",
      });
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const handleBeginQC = (project: Project) => {
    const stages = projectStages[project.id] || [];
    const allStagesCompleted = stages.length > 0 && stages.every((s) => s.status === "completed");

    if (!subscriptionTier) {
      toast({
        title: "Please wait",
        description: "Loading subscription details...",
        variant: "destructive",
      });
      return;
    }

    if (!allStagesCompleted) {
      toast({
        title: "Project stages incomplete",
        description: "Complete all project stages before starting Bulk QC.",
        variant: "destructive",
      });
      return;
    }

    if (subscriptionTier === "free") {
      toast({
        title: "Bulk QC is a paid feature",
        description: "Upgrade to Pro or Enterprise to enable Bulk QC.",
        variant: "destructive",
      });
      window.location.href = "/dashboard/settings";
      return;
    }

    // For Pro and Enterprise, navigate to Bulk QC with project context
    window.location.href = `/dashboard/qc?projectId=${project.id}&code=${encodeURIComponent(
      project.code
    )}`;
  };

  const renderStages = (projectId: string) => {
    const stages = projectStages[projectId] || [];
  
    return (
      <div className="flex flex-col gap-2">
        {stages.map((stage) => (
          <div
            key={stage.id}
            className="flex items-center gap-2 border border-zinc-800/60 rounded-lg px-3 py-2 bg-zinc-900/40"
          >
            <Input
              defaultValue={stage.name}
              onBlur={(e) => updateStage(projectId, stage.id, { name: e.target.value })}
              className="text-sm text-white w-28 bg-transparent border-none"
            />
            <Select
              value={stage.status}
              onValueChange={(val) =>
                updateStage(projectId, stage.id, { status: val as ProjectStage["status"] })
              }
            >
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="ghost" size="icon" onClick={() => deleteStage(projectId, stage.id)}>
              <Trash2 className="h-4 w-4 text-red-500" />
            </Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={() => addStage(projectId)}>
          <Plus className="h-4 w-4 mr-2" /> Add Stage
        </Button>
      </div>
    );
  };

  return (
    <div className="space-y-4 sm:space-y-6 lg:space-y-8">
      {/* Header */}
      <div className="glass border-zinc-800/50 rounded-lg p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold text-white mb-1 sm:mb-2">
              Projects
            </h1>
            <p className="text-sm sm:text-base text-zinc-400">
              Manage your media production projects
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="w-full sm:w-auto">
                <Plus className="h-4 w-4 mr-2" />
                Create Project
              </Button>
            </DialogTrigger>
            <DialogContent className="mx-4 sm:mx-auto max-w-md max-h-[85vh] overflow-y-auto custom-scrollbar">
              <DialogHeader>
                <DialogTitle>Create New Project</DialogTitle>
                <DialogDescription>
                  Add a new project to organize your media deliveries
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit}>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="code">Project Code</Label>
                    <Input
                      id="code"
                      placeholder="PRT"
                      value={formData.code}
                      onChange={(e) =>
                        setFormData({ ...formData, code: e.target.value })
                      }
                      required
                      maxLength={10}
                      className="uppercase"
                    />
                    <p className="text-xs text-zinc-500">
                      Short code used in filenames (e.g., PRT, ABC)
                    </p>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="name">Project Name</Label>
                    <Input
                      id="name"
                      placeholder="Project Name"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      required
                    />
                  </div>
                </div>
                <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDialogOpen(false)}
                    className="w-full sm:w-auto"
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
                    {submitting ? "Creating..." : "Create Project"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Projects */}
      <Card className="glass border-zinc-800/50">
        <CardHeader className="px-4 sm:px-6">
          <CardTitle className="text-white text-base sm:text-lg">
            All Projects
            <span className="text-zinc-500 font-normal text-sm ml-2">
              ({projects.length})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
          {loading ? (
            <div className="space-y-3 sm:space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 sm:h-12 w-full" />
              ))}
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-12">
              <FolderOpen className="h-12 w-12 text-zinc-600 mx-auto mb-3" />
              <p className="text-zinc-400 mb-4">No projects yet</p>
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Project
              </Button>
            </div>
          ) : (
            <>
              {/* Mobile Card View */}
              <div className="sm:hidden space-y-3">
                {projects.map((project) => (
                  <ProjectCard key={project.id} project={project} formatDate={formatDate} />
                ))}
              </div>

              {/* Desktop Table View */}
              <div className="hidden sm:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-zinc-800/50 hover:bg-zinc-900/30">
                      <TableHead className="text-zinc-400">Project Code</TableHead>
                      <TableHead className="text-zinc-400">Name</TableHead>
                      <TableHead className="text-zinc-400">Stages</TableHead>
                      <TableHead className="text-zinc-400">Status</TableHead>
                      <TableHead className="text-zinc-400">Created Date</TableHead>
                      <TableHead className="text-zinc-400 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {projects.map((project, index) => (
                      <motion.tr
                        key={project.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2, delay: index * 0.05 }}
                        className="border-zinc-800/50 hover:bg-zinc-900/30 transition-colors"
                      >
                        <TableCell className="font-mono font-semibold text-white">
                          {project.code}
                        </TableCell>
                        <TableCell className="text-zinc-300">
                          {project.name}
                        </TableCell>
                        <TableCell className="text-zinc-300">{renderStages(project.id)}</TableCell>
                        <TableCell>
                          <Select
                            value={project.status ?? "active"}
                            onValueChange={(val) => {
                              if (val && (val === "active" || val === "completed" || val === "archived")) {
                                updateProjectStatus(project, val);
                              }
                            }}
                          >
                            <SelectTrigger className="w-36">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="active">Active</SelectItem>
                              <SelectItem value="completed">Completed</SelectItem>
                              <SelectItem value="archived">Archived</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-zinc-400">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            {formatDate(project.created_at)}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-purple-500/40 text-purple-300 hover:bg-purple-500/10"
                            onClick={() => handleBeginQC(project)}
                          >
                            <PlayCircle className="h-4 w-4 mr-1.5" />
                            Begin QC
                          </Button>
                        </TableCell>
                      </motion.tr>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
