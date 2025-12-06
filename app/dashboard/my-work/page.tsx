"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  FolderOpen,
  ExternalLink,
  Clock,
  CheckCircle2,
  AlertCircle,
  Calendar,
  FileText,
  RefreshCw,
  User,
  Upload,
  MoreVertical,
  Download,
  Trash2,
  Play,
  Pause,
  Eye,
  FileVideo,
  Search,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Assignment {
  id: string;
  display_name: string;
  description: string | null;
  original_drive_link: string;
  status: string;
  due_date: string | null;
  created_at: string;
  vendor?: { id: string; full_name: string; email?: string } | null;
  project?: { id: string; name: string; code: string } | null;
}

interface Vendor {
  id: string;
  full_name: string;
  email?: string;
}

const statusConfig: Record<string, { label: string; color: string; icon: any; bgColor: string }> = {
  pending: { label: "Pending", color: "text-yellow-400", bgColor: "bg-yellow-500/10 border-yellow-500/20", icon: Clock },
  in_progress: { label: "In Progress", color: "text-blue-400", bgColor: "bg-blue-500/10 border-blue-500/20", icon: Loader2 },
  completed: { label: "Completed", color: "text-green-400", bgColor: "bg-green-500/10 border-green-500/20", icon: CheckCircle2 },
  on_hold: { label: "On Hold", color: "text-orange-400", bgColor: "bg-orange-500/10 border-orange-500/20", icon: Pause },
  cancelled: { label: "Cancelled", color: "text-zinc-400", bgColor: "bg-zinc-500/10 border-zinc-500/20", icon: AlertCircle },
};

export default function MyWorkPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [userRole, setUserRole] = useState<string>("admin");
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const { toast } = useToast();

  const initPage = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setUserEmail(user.email || null);

      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id, role")
        .eq("id", user.id)
        .single();

      if (profile) {
        setOrganizationId(profile.organization_id);
        setUserRole(profile.role);
      }

      if (profile?.role === "admin") {
        const response = await fetch(`/api/vendors/create?organizationId=${profile.organization_id}`);
        if (response.ok) {
          const data = await response.json();
          setVendors(data.vendors || []);
        }
      }
    } catch (error) {
      console.error("Error initializing:", error);
    }
  }, []);

  const fetchAssignments = useCallback(async () => {
    if (!organizationId && !userEmail) return;
    
    try {
      setRefreshing(true);
      
      let url = `/api/my-work?`;
      
      if (userRole === "admin") {
        url += `role=admin&organizationId=${organizationId}`;
        if (selectedVendor && selectedVendor !== "all") {
          url += `&vendorId=${selectedVendor}`;
        }
      } else if (userEmail) {
        url += `userEmail=${encodeURIComponent(userEmail)}`;
      }

      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setAssignments(data.assignments || []);
      }
    } catch (error) {
      console.error("Error fetching assignments:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [organizationId, userEmail, userRole, selectedVendor]);

  useEffect(() => {
    initPage();
  }, [initPage]);

  useEffect(() => {
    if (organizationId || userEmail) {
      fetchAssignments();
      const interval = setInterval(fetchAssignments, 10000);
      return () => clearInterval(interval);
    }
  }, [fetchAssignments, organizationId, userEmail]);

  const updateStatus = async (id: string, status: string) => {
    try {
      const response = await fetch("/api/my-work", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignmentId: id, status }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error);
      }

      setAssignments((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
      toast({ title: "Status Updated", description: `Assignment marked as ${status.replace("_", " ")}` });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleDelete = async (assignment: Assignment) => {
    if (!confirm(`Delete assignment "${assignment.display_name}"?`)) return;
    try {
      const { error } = await supabase.from("assignments").delete().eq("id", assignment.id);
      if (error) throw error;
      toast({ title: "Assignment deleted" });
      fetchAssignments();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const filteredAssignments = assignments.filter((a) => {
    const matchesVendor = selectedVendor === "all" || a.vendor?.id === selectedVendor;
    const matchesSearch = !searchQuery || 
      a.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.project?.code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.vendor?.full_name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || a.status === statusFilter;
    return matchesVendor && matchesSearch && matchesStatus;
  });

  const stats = {
    pending: filteredAssignments.filter((a) => a.status === "pending").length,
    inProgress: filteredAssignments.filter((a) => a.status === "in_progress").length,
    completed: filteredAssignments.filter((a) => a.status === "completed").length,
    total: filteredAssignments.length,
  };

  const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div className="space-y-6">
      {/* Header with Stats */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-white">My Work</h1>
          <p className="text-zinc-400 mt-1">
            {userRole === "admin" ? "Manage and track all vendor assignments" : "View and manage your assigned projects"}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-yellow-400">{stats.pending} pending</span>
            <span className="text-zinc-600">•</span>
            <span className="text-blue-400">{stats.inProgress} active</span>
            <span className="text-zinc-600">•</span>
            <span className="text-green-400">{stats.completed} done</span>
          </div>
          <Button variant="ghost" size="sm" onClick={fetchAssignments} disabled={refreshing} className="h-8 w-8 p-0">
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { value: stats.pending, label: "Pending", icon: Clock, color: "yellow" },
          { value: stats.inProgress, label: "In Progress", icon: Loader2, color: "blue", animate: stats.inProgress > 0 },
          { value: stats.completed, label: "Completed", icon: CheckCircle2, color: "green" },
          { value: stats.total, label: "Total", icon: FolderOpen, color: "purple" },
        ].map((stat) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="glass border-zinc-800/50">
              <CardContent className="p-4 flex items-center gap-4">
                <div className={`h-12 w-12 rounded-xl bg-${stat.color}-500/10 flex items-center justify-center`}>
                  <stat.icon className={cn(`h-6 w-6 text-${stat.color}-400`, stat.animate && "animate-spin")} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{stat.value}</p>
                  <p className="text-sm text-zinc-400">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <Input placeholder="Search assignments..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10 bg-zinc-900/50 border-zinc-800/50" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40 bg-zinc-900/50 border-zinc-800/50">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent className="bg-zinc-900 border-zinc-700">
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="on_hold">On Hold</SelectItem>
          </SelectContent>
        </Select>
        {userRole === "admin" && vendors.length > 0 && (
          <Select value={selectedVendor} onValueChange={setSelectedVendor}>
            <SelectTrigger className="w-48 bg-zinc-900/50 border-zinc-800/50">
              <User className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Filter by vendor" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-700">
              <SelectItem value="all">All Vendors</SelectItem>
              {vendors.map((vendor) => (
                <SelectItem key={vendor.id} value={vendor.id}>{vendor.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Assignments Grid */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-48 w-full" />)}
        </div>
      ) : filteredAssignments.length === 0 ? (
        <Card className="glass border-zinc-800/50">
          <CardContent className="py-16 text-center">
            <FolderOpen className="h-16 w-16 text-zinc-600 mx-auto mb-4" />
            <h3 className="text-xl font-medium text-white mb-2">No assignments found</h3>
            <p className="text-zinc-400">
              {searchQuery || statusFilter !== "all" ? "Try adjusting your filters." : "Assignments will appear here."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredAssignments.map((assignment, index) => {
            const status = statusConfig[assignment.status] || statusConfig.pending;
            const StatusIcon = status?.icon || Clock;
            const isOverdue = assignment.due_date && new Date(assignment.due_date) < new Date() && assignment.status !== "completed";
            const isInProgress = assignment.status === "in_progress";

            return (
              <motion.div
                key={assignment.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card className={cn(
                  "glass border-zinc-800/50 hover:border-zinc-700/50 transition-all h-full group",
                  isOverdue && "border-red-500/30"
                )}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center", status?.bgColor)}>
                          <StatusIcon className={cn("h-5 w-5", status?.color, isInProgress && "animate-spin")} />
                        </div>
                        <div>
                          <button
                            onClick={() => { setSelectedAssignment(assignment); setDetailModalOpen(true); }}
                            className="text-lg font-medium text-white hover:text-purple-400 transition-colors text-left"
                          >
                            {assignment.display_name}
                          </button>
                          <div className="flex items-center gap-2 mt-1">
                            {assignment.project && (
                              <Badge variant="outline" className="text-[10px] border-zinc-700 text-zinc-400">
                                {assignment.project.code}
                              </Badge>
                            )}
                            {userRole === "admin" && assignment.vendor && (
                              <span className="text-xs text-blue-400">→ {assignment.vendor.full_name}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-zinc-400 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48 bg-zinc-900 border-zinc-700">
                          <DropdownMenuItem onClick={() => { setSelectedAssignment(assignment); setDetailModalOpen(true); }}>
                            <Eye className="h-4 w-4 mr-2" />View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => window.open(assignment.original_drive_link, "_blank")}>
                            <ExternalLink className="h-4 w-4 mr-2" />Open Files
                          </DropdownMenuItem>
                          <DropdownMenuSeparator className="bg-zinc-700" />
                          {assignment.status === "pending" && (
                            <DropdownMenuItem onClick={() => updateStatus(assignment.id, "in_progress")} className="text-blue-400">
                              <Play className="h-4 w-4 mr-2" />Start Work
                            </DropdownMenuItem>
                          )}
                          {assignment.status === "in_progress" && (
                            <>
                              <DropdownMenuItem onClick={() => updateStatus(assignment.id, "completed")} className="text-green-400">
                                <CheckCircle2 className="h-4 w-4 mr-2" />Mark Complete
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => updateStatus(assignment.id, "on_hold")} className="text-orange-400">
                                <Pause className="h-4 w-4 mr-2" />Put On Hold
                              </DropdownMenuItem>
                            </>
                          )}
                          {assignment.status === "on_hold" && (
                            <DropdownMenuItem onClick={() => updateStatus(assignment.id, "in_progress")} className="text-blue-400">
                              <Play className="h-4 w-4 mr-2" />Resume
                            </DropdownMenuItem>
                          )}
                          {userRole === "admin" && (
                            <>
                              <DropdownMenuSeparator className="bg-zinc-700" />
                              <DropdownMenuItem onClick={() => handleDelete(assignment)} className="text-red-400">
                                <Trash2 className="h-4 w-4 mr-2" />Delete
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Status Badge */}
                    <Badge variant="outline" className={cn("px-2 py-1 text-xs font-medium border", status?.color, status?.bgColor)}>
                      {status?.label}
                    </Badge>

                    {assignment.description && (
                      <div className="flex items-start gap-2">
                        <FileText className="h-4 w-4 text-zinc-400 mt-0.5 shrink-0" />
                        <p className="text-sm text-zinc-400 line-clamp-2">{assignment.description}</p>
                      </div>
                    )}

                    {assignment.due_date && (
                      <div className="flex items-center gap-2">
                        <Calendar className={cn("h-4 w-4", isOverdue ? "text-red-400" : "text-zinc-400")} />
                        <span className={cn("text-sm", isOverdue ? "text-red-400" : "text-zinc-400")}>
                          Due: {formatDate(assignment.due_date)}
                          {isOverdue && " (Overdue)"}
                        </span>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex gap-2 pt-2">
                      <Button size="sm" className="flex-1" onClick={() => window.open(assignment.original_drive_link, "_blank")}>
                        <ExternalLink className="h-4 w-4 mr-2" />Open Files
                      </Button>
                      
                      {assignment.status === "pending" && (
                        <Button size="sm" variant="outline" onClick={() => updateStatus(assignment.id, "in_progress")} className="border-blue-500/30 text-blue-400">
                          <Play className="h-4 w-4" />
                        </Button>
                      )}
                      {assignment.status === "in_progress" && (
                        <Button size="sm" variant="outline" className="border-green-500/30 text-green-400" onClick={() => updateStatus(assignment.id, "completed")}>
                          <CheckCircle2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Detail Modal */}
      <Dialog open={detailModalOpen} onOpenChange={setDetailModalOpen}>
        <DialogContent className="max-w-lg bg-zinc-900 border-zinc-700">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-3">
              <FolderOpen className="h-5 w-5 text-purple-400" />
              {selectedAssignment?.display_name}
            </DialogTitle>
          </DialogHeader>
          
          {selectedAssignment && (
            <div className="space-y-4 mt-4">
              {/* Status */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/50">
                <span className="text-zinc-400">Status</span>
                <Select
                  value={selectedAssignment.status}
                  onValueChange={(val) => {
                    updateStatus(selectedAssignment.id, val);
                    setSelectedAssignment({ ...selectedAssignment, status: val });
                  }}
                >
                  <SelectTrigger className="w-40 bg-zinc-800 border-zinc-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-700">
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="on_hold">On Hold</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Info */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                {selectedAssignment.project && (
                  <div>
                    <p className="text-zinc-500">Project</p>
                    <p className="text-zinc-300">{selectedAssignment.project.code} - {selectedAssignment.project.name}</p>
                  </div>
                )}
                {selectedAssignment.vendor && (
                  <div>
                    <p className="text-zinc-500">Assigned To</p>
                    <p className="text-zinc-300">{selectedAssignment.vendor.full_name}</p>
                  </div>
                )}
                {selectedAssignment.due_date && (
                  <div>
                    <p className="text-zinc-500">Due Date</p>
                    <p className="text-zinc-300">{formatDate(selectedAssignment.due_date)}</p>
                  </div>
                )}
                <div>
                  <p className="text-zinc-500">Created</p>
                  <p className="text-zinc-300">{formatDate(selectedAssignment.created_at)}</p>
                </div>
              </div>

              {selectedAssignment.description && (
                <div>
                  <p className="text-zinc-500 text-sm mb-1">Description</p>
                  <p className="text-zinc-300 text-sm">{selectedAssignment.description}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-3 pt-4 border-t border-zinc-800">
                <Button onClick={() => window.open(selectedAssignment.original_drive_link, "_blank")} className="flex-1">
                  <ExternalLink className="h-4 w-4 mr-2" />Open Files in Drive
                </Button>
                {userRole === "admin" && (
                  <Button onClick={() => { handleDelete(selectedAssignment); setDetailModalOpen(false); }} variant="outline" className="border-red-500/30 text-red-400">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
