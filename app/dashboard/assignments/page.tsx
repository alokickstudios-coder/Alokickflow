"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  FolderPlus,
  Link as LinkIcon,
  User,
  Calendar,
  ExternalLink,
  MoreVertical,
  Trash2,
  Edit,
  CheckCircle2,
  Clock,
  AlertCircle,
  UserPlus,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Vendor {
  id: string;
  full_name: string;
}

interface Project {
  id: string;
  name: string;
  code: string;
}

interface Assignment {
  id: string;
  display_name: string;
  description: string | null;
  original_drive_link: string;
  client_name: string | null;
  client_email: string | null;
  status: string;
  due_date: string | null;
  created_at: string;
  vendor: Vendor | null;
  project: Project | null;
}

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: "Pending", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30", icon: Clock },
  in_progress: { label: "In Progress", color: "bg-blue-500/20 text-blue-400 border-blue-500/30", icon: AlertCircle },
  completed: { label: "Completed", color: "bg-green-500/20 text-green-400 border-green-500/30", icon: CheckCircle2 },
  cancelled: { label: "Cancelled", color: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30", icon: AlertCircle },
};

export default function AssignmentsPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newVendorName, setNewVendorName] = useState("");
  const [addingVendor, setAddingVendor] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    vendorId: "",
    projectId: "",
    driveLink: "",
    displayName: "",
    description: "",
    clientName: "",
    clientEmail: "",
    dueDate: "",
  });

  useEffect(() => {
    initializeData();
  }, []);

  const initializeData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Authentication Required",
          description: "Please log in to view assignments",
          variant: "destructive",
        });
        return;
      }
      setUserId(user.id);

      // Get organization ID
      let orgId: string | null = null;

      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", user.id)
        .single();

      if (profile?.organization_id) {
        orgId = profile.organization_id;
      } else {
        // Fallback: Get first organization
        const { data: orgs } = await supabase
          .from("organizations")
          .select("id")
          .limit(1);
        
        if (orgs && orgs.length > 0) {
          orgId = orgs[0].id;
        }
      }

      if (!orgId) {
        toast({
          title: "No Organization",
          description: "Please complete onboarding first",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      setOrganizationId(orgId);
      await fetchData(orgId);
    } catch (error) {
      console.error("Initialization error:", error);
      setLoading(false);
    }
  };

  const fetchData = async (orgId: string) => {
    setLoading(true);
    try {
      // Fetch vendors from API (reliable source)
      const vendorsRes = await fetch(`/api/vendors/create?organizationId=${orgId}`);
      if (vendorsRes.ok) {
        const vendorsData = await vendorsRes.json();
        setVendors(vendorsData.vendors || []);
      } else {
        // Fallback to direct query
        const { data: vendorData } = await supabase
          .from("profiles")
          .select("id, full_name")
          .eq("organization_id", orgId)
          .eq("role", "vendor");
        setVendors(vendorData || []);
      }

      // Fetch projects
      const { data: projectData } = await supabase
        .from("projects")
        .select("id, name, code")
        .eq("organization_id", orgId);
      setProjects(projectData || []);

      // Fetch assignments from API
      const assignmentsRes = await fetch(`/api/assignments?organizationId=${orgId}`);
      if (assignmentsRes.ok) {
        const assignmentsData = await assignmentsRes.json();
        setAssignments(assignmentsData.assignments || []);
      } else {
        // Fallback
        const { data: assignmentsData } = await supabase
          .from("drive_assignments")
          .select(`
            *,
            vendor:vendor_id(id, full_name),
            project:project_id(id, name, code)
          `)
          .eq("organization_id", orgId)
          .order("created_at", { ascending: false });
        setAssignments(assignmentsData || []);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddVendor = async () => {
    if (!newVendorName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a vendor name",
        variant: "destructive",
      });
      return;
    }

    if (!organizationId) {
      toast({
        title: "Error",
        description: "Organization not found",
        variant: "destructive",
      });
      return;
    }

    setAddingVendor(true);
    try {
      const response = await fetch("/api/vendors/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: newVendorName.trim(),
          organizationId,
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || data.details || "Failed to create vendor");
      }

      if (data.vendor) {
        // Add to vendors list
        setVendors((prev) => [data.vendor, ...prev]);
        // Auto-select the new vendor
        setFormData((prev) => ({ ...prev, vendorId: data.vendor.id }));
        
        toast({
          title: "Vendor Created",
          description: `${data.vendor.full_name} has been added successfully`,
          variant: "success",
        });
      }

      setNewVendorName("");
    } catch (error: any) {
      console.error("Add vendor error:", error);
      
      // Check for server configuration error
      const isConfigError = error.message?.includes("Server configuration") || 
                            error.message?.includes("SUPABASE_SERVICE_ROLE_KEY");
      
      toast({
        title: isConfigError ? "Configuration Required" : "Error Creating Vendor",
        description: isConfigError 
          ? "Server not configured. Add SUPABASE_SERVICE_ROLE_KEY to .env.local"
          : error.message,
        variant: "destructive",
      });
    } finally {
      setAddingVendor(false);
    }
  };

  const extractDriveInfo = (link: string) => {
    try {
      const url = new URL(link);
      if (url.hostname.includes("drive.google.com")) {
        return "Google Drive Folder";
      }
      return "Shared Folder";
    } catch {
      return "Shared Link";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.vendorId) {
      toast({
        title: "Error",
        description: "Please select a vendor",
        variant: "destructive",
      });
      return;
    }

    if (!formData.driveLink) {
      toast({
        title: "Error",
        description: "Please enter a Google Drive link",
        variant: "destructive",
      });
      return;
    }

    if (!organizationId) {
      toast({
        title: "Error",
        description: "Organization not found. Please refresh the page.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);

    try {
      const displayName = formData.displayName || extractDriveInfo(formData.driveLink);

      // Use the API route for reliable creation
      const response = await fetch("/api/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendorId: formData.vendorId,
          organizationId,
          assignedBy: userId,
          driveLink: formData.driveLink,
          displayName,
          projectId: formData.projectId,
          description: formData.description,
          clientName: formData.clientName,
          clientEmail: formData.clientEmail,
          dueDate: formData.dueDate,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.details || "Failed to create assignment");
      }

      // Add to local state
      if (data.assignment) {
        setAssignments((prev) => [data.assignment, ...prev]);
      }

      toast({
        title: "Assignment Created",
        description: "The Google Drive link has been assigned to the vendor.",
        variant: "success",
      });

      setDialogOpen(false);
      setFormData({
        vendorId: "",
        projectId: "",
        driveLink: "",
        displayName: "",
        description: "",
        clientName: "",
        clientEmail: "",
        dueDate: "",
      });
    } catch (error: any) {
      console.error("Assignment creation error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create assignment",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const updateStatus = async (id: string, status: string) => {
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

  const deleteAssignment = async (id: string) => {
    if (!confirm("Are you sure you want to delete this assignment?")) return;

    try {
      const { error } = await supabase
        .from("drive_assignments")
        .delete()
        .eq("id", id);

      if (error) throw error;

      setAssignments((prev) => prev.filter((a) => a.id !== id));

      toast({
        title: "Deleted",
        description: "Assignment has been deleted",
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

  const handleRefresh = () => {
    if (organizationId) {
      fetchData(organizationId);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-white">Drive Assignments</h1>
          <p className="text-zinc-400 mt-1">
            Assign Google Drive links to vendors
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <FolderPlus className="h-4 w-4 mr-2" />
                New Assignment
              </Button>
            </DialogTrigger>
            <DialogContent className="glass border-zinc-800/50 max-w-lg max-h-[85vh] overflow-y-auto custom-scrollbar">
              <DialogHeader>
                <DialogTitle className="text-white">Assign Google Drive Link</DialogTitle>
                <DialogDescription>
                  Assign a client's Google Drive folder to a vendor. Client info will be hidden from the vendor.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                {/* Vendor Selection */}
                <div className="space-y-2">
                  <Label>Select Vendor *</Label>
                  {vendors.length === 0 ? (
                    <div className="space-y-2">
                      <p className="text-sm text-zinc-400 p-3 bg-zinc-900/50 rounded-md">
                        No vendors found. Add a vendor first.
                      </p>
                      <div className="flex gap-2">
                        <Input
                          placeholder="Enter vendor name"
                          value={newVendorName}
                          onChange={(e) => setNewVendorName(e.target.value)}
                        />
                        <Button 
                          type="button" 
                          onClick={handleAddVendor}
                          disabled={addingVendor}
                        >
                          {addingVendor ? "Adding..." : "Add"}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Select
                        value={formData.vendorId}
                        onValueChange={(value) => setFormData({ ...formData, vendorId: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a vendor" />
                        </SelectTrigger>
                        <SelectContent>
                          {vendors.map((vendor) => (
                            <SelectItem key={vendor.id} value={vendor.id}>
                              {vendor.full_name || "Unnamed Vendor"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-zinc-500">Or add new:</span>
                        <Input
                          placeholder="Vendor name"
                          value={newVendorName}
                          onChange={(e) => setNewVendorName(e.target.value)}
                          className="flex-1 h-8 text-sm"
                        />
                        <Button 
                          type="button" 
                          size="sm"
                          variant="outline"
                          onClick={handleAddVendor}
                          disabled={addingVendor}
                        >
                          <UserPlus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Google Drive Link */}
                <div className="space-y-2">
                  <Label>Google Drive Link *</Label>
                  <div className="relative">
                    <LinkIcon className="absolute left-3 top-3 h-4 w-4 text-zinc-400" />
                    <Input
                      placeholder="https://drive.google.com/..."
                      value={formData.driveLink}
                      onChange={(e) => setFormData({ ...formData, driveLink: e.target.value })}
                      required
                      className="pl-10"
                    />
                  </div>
                </div>

                {/* Display Name */}
                <div className="space-y-2">
                  <Label>Display Name (what vendor sees)</Label>
                  <Input
                    placeholder="Project Files - Episode 1"
                    value={formData.displayName}
                    onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                  />
                </div>

                {/* Project Selection */}
                <div className="space-y-2">
                  <Label>Link to Project (optional)</Label>
                  <Select
                    value={formData.projectId || "none"}
                    onValueChange={(value) => setFormData({ ...formData, projectId: value === "none" ? "" : value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a project" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Project</SelectItem>
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.code} - {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <Label>Instructions for Vendor</Label>
                  <Textarea
                    placeholder="Please process files according to spec..."
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                  />
                </div>

                {/* Client Info (Hidden from vendor) */}
                <div className="p-4 rounded-lg bg-zinc-900/50 border border-zinc-800/50 space-y-3">
                  <p className="text-xs text-zinc-500 uppercase tracking-wider">
                    Client Info (Hidden from vendor)
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Client Name</Label>
                      <Input
                        placeholder="Client name"
                        value={formData.clientName}
                        onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Client Email</Label>
                      <Input
                        placeholder="client@email.com"
                        type="email"
                        value={formData.clientEmail}
                        onChange={(e) => setFormData({ ...formData, clientEmail: e.target.value })}
                        className="h-9"
                      />
                    </div>
                  </div>
                </div>

                {/* Due Date */}
                <div className="space-y-2">
                  <Label>Due Date (optional)</Label>
                  <Input
                    type="date"
                    value={formData.dueDate}
                    onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                  />
                </div>

                <Button type="submit" className="w-full" disabled={submitting || !formData.vendorId}>
                  {submitting ? "Creating..." : "Assign to Vendor"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Vendors Quick View */}
      {vendors.length > 0 && (
        <Card className="glass border-zinc-800/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-white text-lg flex items-center gap-2">
              <User className="h-5 w-5" />
              Available Vendors ({vendors.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {vendors.map((vendor) => (
                <div
                  key={vendor.id}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900/50 border border-zinc-800/50 text-sm"
                >
                  <div className="h-6 w-6 rounded-full bg-zinc-800 flex items-center justify-center text-xs text-zinc-400">
                    {vendor.full_name?.[0]?.toUpperCase() || "?"}
                  </div>
                  <span className="text-zinc-300">{vendor.full_name || "Unnamed"}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Assignments Table */}
      <Card className="glass border-zinc-800/50">
        <CardHeader>
          <CardTitle className="text-white">All Assignments</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : assignments.length === 0 ? (
            <div className="text-center py-12">
              <FolderPlus className="h-12 w-12 text-zinc-600 mx-auto mb-4" />
              <p className="text-zinc-400">No assignments yet</p>
              <p className="text-zinc-500 text-sm">Create your first assignment above</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800/50">
                  <TableHead className="text-zinc-400">Folder Name</TableHead>
                  <TableHead className="text-zinc-400">Vendor</TableHead>
                  <TableHead className="text-zinc-400">Project</TableHead>
                  <TableHead className="text-zinc-400">Status</TableHead>
                  <TableHead className="text-zinc-400">Due Date</TableHead>
                  <TableHead className="text-zinc-400 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((assignment, index) => {
                  const status = statusConfig[assignment.status];
                  const StatusIcon = status?.icon || Clock;

                  return (
                    <motion.tr
                      key={assignment.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: index * 0.05 }}
                      className="border-zinc-800/50 hover:bg-zinc-900/30"
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                            <LinkIcon className="h-5 w-5 text-blue-400" />
                          </div>
                          <div>
                            <p className="font-medium text-white">
                              {assignment.display_name}
                            </p>
                            {assignment.description && (
                              <p className="text-xs text-zinc-500 truncate max-w-[200px]">
                                {assignment.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-zinc-400" />
                          <span className="text-white">
                            {assignment.vendor?.full_name || "Unknown"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {assignment.project ? (
                          <span className="text-zinc-300">
                            {assignment.project.code}
                          </span>
                        ) : (
                          <span className="text-zinc-500">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border",
                            status?.color
                          )}
                        >
                          <StatusIcon className="h-3 w-3" />
                          {status?.label}
                        </span>
                      </TableCell>
                      <TableCell>
                        {assignment.due_date ? (
                          <span className="text-zinc-300">
                            {new Date(assignment.due_date).toLocaleDateString()}
                          </span>
                        ) : (
                          <span className="text-zinc-500">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => window.open(assignment.original_drive_link, "_blank")}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="glass border-zinc-800/50">
                              <DropdownMenuItem onClick={() => updateStatus(assignment.id, "in_progress")}>
                                <Clock className="h-4 w-4 mr-2" />
                                Mark In Progress
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => updateStatus(assignment.id, "completed")}>
                                <CheckCircle2 className="h-4 w-4 mr-2" />
                                Mark Completed
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => deleteAssignment(assignment.id)}
                                className="text-red-400"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </motion.tr>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
