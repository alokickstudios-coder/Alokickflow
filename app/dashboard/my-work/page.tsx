"use client";

import { useState, useEffect } from "react";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
  vendor?: {
    id: string;
    full_name: string;
    email?: string;
  } | null;
  project?: {
    id: string;
    name: string;
    code: string;
  } | null;
}

interface Vendor {
  id: string;
  full_name: string;
  email?: string;
}

const statusConfig: Record<string, { label: string; color: string; icon: any; bgColor: string }> = {
  pending: { 
    label: "Pending", 
    color: "text-yellow-400", 
    bgColor: "bg-yellow-500/10 border-yellow-500/20",
    icon: Clock 
  },
  in_progress: { 
    label: "In Progress", 
    color: "text-blue-400", 
    bgColor: "bg-blue-500/10 border-blue-500/20",
    icon: AlertCircle 
  },
  completed: { 
    label: "Completed", 
    color: "text-green-400", 
    bgColor: "bg-green-500/10 border-green-500/20",
    icon: CheckCircle2 
  },
  on_hold: { 
    label: "On Hold", 
    color: "text-orange-400", 
    bgColor: "bg-orange-500/10 border-orange-500/20",
    icon: Clock 
  },
  cancelled: { 
    label: "Cancelled", 
    color: "text-zinc-400", 
    bgColor: "bg-zinc-500/10 border-zinc-500/20",
    icon: AlertCircle 
  },
};

export default function MyWorkPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVendor, setSelectedVendor] = useState<string>("all");
  const [userRole, setUserRole] = useState<string>("admin");
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    initPage();
  }, []);

  useEffect(() => {
    if (organizationId) {
      fetchAssignments();
    }
  }, [selectedVendor, organizationId]);

  const initPage = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setUserEmail(user.email || null);

      // Get user's profile and role
      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id, role")
        .eq("id", user.id)
        .single();

      if (profile) {
        setOrganizationId(profile.organization_id);
        setUserRole(profile.role);
      }

      // Fetch vendors for filter dropdown (admin only)
      if (profile?.role === 'admin') {
        const response = await fetch(`/api/vendors/create?organizationId=${profile.organization_id}`);
        if (response.ok) {
          const data = await response.json();
          setVendors(data.vendors || []);
        }
      }
    } catch (error) {
      console.error("Error initializing:", error);
    }
  };

  const fetchAssignments = async () => {
    try {
      setLoading(true);
      
      let url = `/api/my-work?`;
      
      if (userRole === 'admin') {
        url += `role=admin&organizationId=${organizationId}`;
        if (selectedVendor && selectedVendor !== 'all') {
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
    }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      const response = await fetch('/api/my-work', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignmentId: id, status }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error);
      }

      setAssignments((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status } : a))
      );

      toast({
        title: "Status Updated",
        description: `Assignment marked as ${status.replace("_", " ")}`,
        variant: "success",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const filteredAssignments = selectedVendor === 'all' 
    ? assignments 
    : assignments.filter(a => a.vendor?.id === selectedVendor);

  const pendingCount = filteredAssignments.filter((a) => a.status === "pending").length;
  const inProgressCount = filteredAssignments.filter((a) => a.status === "in_progress").length;
  const completedCount = filteredAssignments.filter((a) => a.status === "completed").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-white">My Work</h1>
          <p className="text-zinc-400 mt-1">
            {userRole === 'admin' 
              ? 'Manage and track all vendor assignments'
              : 'View and manage your assigned projects'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {userRole === 'admin' && vendors.length > 0 && (
            <Select value={selectedVendor} onValueChange={setSelectedVendor}>
              <SelectTrigger className="w-48">
                <User className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter by vendor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Vendors</SelectItem>
                {vendors.map((vendor) => (
                  <SelectItem key={vendor.id} value={vendor.id}>
                    {vendor.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" size="sm" onClick={fetchAssignments}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="glass border-zinc-800/50">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-yellow-500/10 flex items-center justify-center">
              <Clock className="h-6 w-6 text-yellow-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{pendingCount}</p>
              <p className="text-sm text-zinc-400">Pending</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass border-zinc-800/50">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <AlertCircle className="h-6 w-6 text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{inProgressCount}</p>
              <p className="text-sm text-zinc-400">In Progress</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass border-zinc-800/50">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-green-500/10 flex items-center justify-center">
              <CheckCircle2 className="h-6 w-6 text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{completedCount}</p>
              <p className="text-sm text-zinc-400">Completed</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Assignments Grid */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      ) : filteredAssignments.length === 0 ? (
        <Card className="glass border-zinc-800/50">
          <CardContent className="py-16 text-center">
            <FolderOpen className="h-16 w-16 text-zinc-600 mx-auto mb-4" />
            <h3 className="text-xl font-medium text-white mb-2">No assignments found</h3>
            <p className="text-zinc-400">
              {selectedVendor !== 'all' 
                ? 'No assignments for the selected vendor.'
                : userRole === 'admin'
                  ? 'Assign work to vendors from the Assignments page.'
                  : 'You\'ll see your assigned work here once an admin assigns projects to you.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredAssignments.map((assignment, index) => {
            const status = statusConfig[assignment.status] || statusConfig.pending;
            const StatusIcon = status?.icon || Clock;
            const isOverdue = assignment.due_date && new Date(assignment.due_date) < new Date() && assignment.status !== "completed";

            return (
              <motion.div
                key={assignment.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card className={cn(
                  "glass border-zinc-800/50 hover:border-zinc-700/50 transition-all h-full",
                  isOverdue && "border-red-500/30"
                )}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "h-10 w-10 rounded-lg flex items-center justify-center",
                          status?.bgColor
                        )}>
                          <FolderOpen className={cn("h-5 w-5", status?.color)} />
                        </div>
                        <div>
                          <CardTitle className="text-white text-lg">
                            {assignment.display_name}
                          </CardTitle>
                          <div className="flex items-center gap-2 mt-1">
                            {assignment.project && (
                              <span className="text-xs text-zinc-500 bg-zinc-800/50 px-2 py-0.5 rounded">
                                {assignment.project.code}
                              </span>
                            )}
                            {userRole === 'admin' && assignment.vendor && (
                              <span className="text-xs text-blue-400">
                                → {assignment.vendor.full_name}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <span className={cn(
                        "px-2 py-1 rounded text-xs font-medium border",
                        status?.color,
                        status?.bgColor
                      )}>
                        {status?.label}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {assignment.description && (
                      <div className="flex items-start gap-2">
                        <FileText className="h-4 w-4 text-zinc-400 mt-0.5 shrink-0" />
                        <p className="text-sm text-zinc-400 line-clamp-2">
                          {assignment.description}
                        </p>
                      </div>
                    )}

                    {assignment.due_date && (
                      <div className="flex items-center gap-2">
                        <Calendar className={cn(
                          "h-4 w-4",
                          isOverdue ? "text-red-400" : "text-zinc-400"
                        )} />
                        <span className={cn(
                          "text-sm",
                          isOverdue ? "text-red-400" : "text-zinc-400"
                        )}>
                          Due: {new Date(assignment.due_date).toLocaleDateString()}
                          {isOverdue && " (Overdue)"}
                        </span>
                      </div>
                    )}

                    <div className="flex gap-2 pt-2">
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => window.open(assignment.original_drive_link, "_blank")}
                      >
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Open Files
                      </Button>
                      
                      {assignment.status === "pending" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateStatus(assignment.id, "in_progress")}
                        >
                          Start
                        </Button>
                      )}
                      {assignment.status === "in_progress" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20"
                          onClick={() => updateStatus(assignment.id, "completed")}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          Done
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
    </div>
  );
}
