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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
  project: {
    id: string;
    name: string;
    code: string;
  } | null;
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
  cancelled: { 
    label: "Cancelled", 
    color: "text-zinc-400", 
    bgColor: "bg-zinc-500/10 border-zinc-500/20",
    icon: AlertCircle 
  },
};

export default function MyWorkPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchMyAssignments();
  }, []);

  const fetchMyAssignments = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch assignments for this vendor
      // Note: RLS ensures vendors only see their own assignments
      // Client info (client_name, client_email) is NOT selected - kept hidden
      const { data, error } = await supabase
        .from("drive_assignments")
        .select(`
          id,
          display_name,
          description,
          original_drive_link,
          status,
          due_date,
          created_at,
          project:projects(id, name, code)
        `)
        .eq("vendor_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (data) {
        // Transform data to handle Supabase's array return for single relations
        const transformedData = data.map((item: any) => ({
          ...item,
          project: Array.isArray(item.project) ? item.project[0] : item.project,
        }));
        setAssignments(transformedData);
      }
    } catch (error) {
      console.error("Error fetching assignments:", error);
    } finally {
      setLoading(false);
    }
  };

  const updateMyStatus = async (id: string, status: string) => {
    try {
      const { error } = await supabase
        .from("drive_assignments")
        .update({ status })
        .eq("id", id);

      if (error) throw error;

      setAssignments((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status } : a))
      );

      toast({
        title: "Status Updated",
        description: `Marked as ${status.replace("_", " ")}`,
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

  const pendingCount = assignments.filter((a) => a.status === "pending").length;
  const inProgressCount = assignments.filter((a) => a.status === "in_progress").length;
  const completedCount = assignments.filter((a) => a.status === "completed").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-semibold text-white">My Work</h1>
        <p className="text-zinc-400 mt-1">
          View and manage your assigned projects
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
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
      ) : assignments.length === 0 ? (
        <Card className="glass border-zinc-800/50">
          <CardContent className="py-16 text-center">
            <FolderOpen className="h-16 w-16 text-zinc-600 mx-auto mb-4" />
            <h3 className="text-xl font-medium text-white mb-2">No assignments yet</h3>
            <p className="text-zinc-400">
              You'll see your assigned work here once an admin assigns projects to you.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {assignments.map((assignment, index) => {
            const status = statusConfig[assignment.status];
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
                          {assignment.project && (
                            <p className="text-xs text-zinc-500">
                              {assignment.project.code}
                            </p>
                          )}
                        </div>
                      </div>
                      <span className={cn(
                        "px-2 py-1 rounded text-xs font-medium",
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
                          onClick={() => updateMyStatus(assignment.id, "in_progress")}
                        >
                          Start
                        </Button>
                      )}
                      {assignment.status === "in_progress" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateMyStatus(assignment.id, "completed")}
                        >
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

