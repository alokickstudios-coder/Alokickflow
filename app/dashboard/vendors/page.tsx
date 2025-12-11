"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Mail,
  User,
  RefreshCw,
  Phone,
  Building2,
  Briefcase,
  Users,
  MoreVertical,
  Trash2,
  Edit,
  UserPlus,
  ChevronDown,
  ChevronUp,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Vendor {
  id: string;
  full_name: string;
  email?: string | null;
  phone?: string | null;
  company_name?: string | null;
  specialty?: string | null;
  status?: string;
  trust_score?: number;
  created_at: string;
}

interface TeamMember {
  id: string;
  full_name: string;
  email?: string | null;
  phone?: string | null;
  role?: string;
  status?: string;
}

function TrustScoreBadge({ score }: { score: number }) {
  const getColor = (score: number) => {
    if (score >= 90) return "text-green-400 border-green-500/20 bg-green-500/10";
    if (score >= 75) return "text-yellow-400 border-yellow-500/20 bg-yellow-500/10";
    return "text-red-400 border-red-500/20 bg-red-500/10";
  };

  return (
    <div className={cn(
      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium",
      getColor(score)
    )}>
      <Star className="h-3 w-3" />
      {score}%
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: "bg-green-500/20 text-green-400 border-green-500/30",
    inactive: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
    suspended: "bg-red-500/20 text-red-400 border-red-500/30",
  };

  return (
    <span className={cn(
      "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize",
      colors[status] || colors.active
    )}>
      {status}
    </span>
  );
}

export default function VendorsPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [teamDialogOpen, setTeamDialogOpen] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [expandedVendor, setExpandedVendor] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const { toast } = useToast();

  // Form states
  const [vendorForm, setVendorForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    companyName: "",
    specialty: "",
    notes: "",
  });

  const [teamMemberForm, setTeamMemberForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    role: "member",
  });

  const fetchVendors = async () => {
    try {
      setLoading(true);
      
      // Get session/organization via API
      const sessionRes = await fetch("/api/auth/session");
      if (!sessionRes.ok) return;
      
      const session = await sessionRes.json();
      if (!session.authenticated || !session.organization?.id) return;
      
      setOrganizationId(session.organization.id);

      const response = await fetch(`/api/vendors/create?organizationId=${session.organization.id}`);
      if (response.ok) {
        const data = await response.json();
        setVendors(data.vendors || []);
      }
    } catch (error) {
      console.error("Error fetching vendors:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTeamMembers = async (vendorId: string) => {
    try {
      const response = await fetch(`/api/vendors/team?vendorId=${vendorId}`);
      if (response.ok) {
        const data = await response.json();
        setTeamMembers(data.members || []);
      }
    } catch (error) {
      console.error("Error fetching team:", error);
    }
  };

  useEffect(() => {
    fetchVendors();
  }, []);

  const handleCreateVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendorForm.fullName.trim() || !organizationId) return;

    setSubmitting(true);
    try {
      const response = await fetch("/api/vendors/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...vendorForm,
          organizationId,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || data.details);

      setVendors((prev) => [data.vendor, ...prev]);
      toast({
        title: "Vendor Created",
        description: `${data.vendor.full_name} has been added successfully.`,
        variant: "success",
      });

      setVendorForm({ fullName: "", email: "", phone: "", companyName: "", specialty: "", notes: "" });
      setDialogOpen(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddTeamMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamMemberForm.fullName.trim() || !selectedVendor) return;

    setSubmitting(true);
    try {
      const response = await fetch("/api/vendors/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendorId: selectedVendor.id,
          ...teamMemberForm,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || data.help);

      setTeamMembers((prev) => [data.member, ...prev]);
      toast({
        title: "Team Member Added",
        description: `${data.member.full_name} has been added to the team.`,
        variant: "success",
      });

      setTeamMemberForm({ fullName: "", email: "", phone: "", role: "member" });
      setTeamDialogOpen(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteVendor = async (vendorId: string) => {
    try {
      const response = await fetch(`/api/vendors/create?id=${vendorId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setVendors((prev) => prev.filter((v) => v.id !== vendorId));
        toast({ title: "Vendor Deleted", variant: "success" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleDeleteTeamMember = async (memberId: string) => {
    try {
      const response = await fetch(`/api/vendors/team?id=${memberId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setTeamMembers((prev) => prev.filter((m) => m.id !== memberId));
        toast({ title: "Team Member Removed", variant: "success" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const toggleVendorExpand = async (vendor: Vendor) => {
    if (expandedVendor === vendor.id) {
      setExpandedVendor(null);
    } else {
      setExpandedVendor(vendor.id);
      setSelectedVendor(vendor);
      await fetchTeamMembers(vendor.id);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="glass border-zinc-800/50 rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-white mb-2">Vendors</h1>
            <p className="text-zinc-400">
              Manage your team of freelancers and vendors ({vendors.length} total)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchVendors}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Vendor
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[85vh] overflow-y-auto custom-scrollbar">
                <DialogHeader>
                  <DialogTitle>Add New Vendor</DialogTitle>
                  <DialogDescription>
                    Add a vendor to your organization. They can be assigned work and manage their own team.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleCreateVendor}>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label htmlFor="fullName">Full Name *</Label>
                      <Input
                        id="fullName"
                        placeholder="John Doe"
                        value={vendorForm.fullName}
                        onChange={(e) => setVendorForm({ ...vendorForm, fullName: e.target.value })}
                        required
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          placeholder="vendor@example.com"
                          value={vendorForm.email}
                          onChange={(e) => setVendorForm({ ...vendorForm, email: e.target.value })}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="phone">Phone</Label>
                        <Input
                          id="phone"
                          placeholder="+1 234 567 8900"
                          value={vendorForm.phone}
                          onChange={(e) => setVendorForm({ ...vendorForm, phone: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="companyName">Company</Label>
                        <Input
                          id="companyName"
                          placeholder="Acme Studios"
                          value={vendorForm.companyName}
                          onChange={(e) => setVendorForm({ ...vendorForm, companyName: e.target.value })}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="specialty">Specialty</Label>
                        <Input
                          id="specialty"
                          placeholder="Video Editing, Color Grading"
                          value={vendorForm.specialty}
                          onChange={(e) => setVendorForm({ ...vendorForm, specialty: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="notes">Notes</Label>
                      <Textarea
                        id="notes"
                        placeholder="Additional notes about this vendor..."
                        value={vendorForm.notes}
                        onChange={(e) => setVendorForm({ ...vendorForm, notes: e.target.value })}
                        rows={3}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={submitting}>
                      {submitting ? "Creating..." : "Create Vendor"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      {/* Vendors List */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="glass border-zinc-800/50">
              <CardHeader>
                <div className="flex items-center gap-4">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      ) : vendors.length === 0 ? (
        <Card className="glass border-zinc-800/50">
          <CardContent className="text-center py-12">
            <User className="h-12 w-12 text-zinc-600 mx-auto mb-4" />
            <p className="text-zinc-400 mb-2 text-lg font-medium">No Vendors Yet</p>
            <p className="text-zinc-500 mb-4 text-sm">Add vendors to assign work and manage your supply chain</p>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Vendor
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {vendors.map((vendor, index) => (
            <motion.div
              key={vendor.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
            >
              <Card className="glass border-zinc-800/50 hover:border-zinc-700/50 transition-colors">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold text-lg">
                        {vendor.full_name?.charAt(0)?.toUpperCase() || "V"}
                      </div>
                      <div>
                        <CardTitle className="text-white text-lg flex items-center gap-2">
                          {vendor.full_name}
                          {vendor.status && <StatusBadge status={vendor.status} />}
                        </CardTitle>
                        <div className="flex items-center gap-4 text-sm text-zinc-400 mt-1">
                          {vendor.email && (
                            <span className="flex items-center gap-1">
                              <Mail className="h-3 w-3" /> {vendor.email}
                            </span>
                          )}
                          {vendor.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="h-3 w-3" /> {vendor.phone}
                            </span>
                          )}
                          {vendor.company_name && (
                            <span className="flex items-center gap-1">
                              <Building2 className="h-3 w-3" /> {vendor.company_name}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {vendor.trust_score && <TrustScoreBadge score={vendor.trust_score} />}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleVendorExpand(vendor)}
                      >
                        <Users className="h-4 w-4 mr-1" />
                        Team
                        {expandedVendor === vendor.id ? (
                          <ChevronUp className="h-4 w-4 ml-1" />
                        ) : (
                          <ChevronDown className="h-4 w-4 ml-1" />
                        )}
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => {
                            setSelectedVendor(vendor);
                            setTeamDialogOpen(true);
                          }}>
                            <UserPlus className="h-4 w-4 mr-2" />
                            Add Team Member
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-400"
                            onClick={() => handleDeleteVendor(vendor.id)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete Vendor
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardHeader>

                <AnimatePresence>
                  {expandedVendor === vendor.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <CardContent className="pt-4 border-t border-zinc-800/50">
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="text-sm font-medium text-zinc-300">Team Members</h4>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedVendor(vendor);
                              setTeamDialogOpen(true);
                            }}
                          >
                            <UserPlus className="h-3 w-3 mr-1" />
                            Add Member
                          </Button>
                        </div>
                        {teamMembers.length === 0 ? (
                          <p className="text-zinc-500 text-sm">No team members yet</p>
                        ) : (
                          <div className="space-y-2">
                            {teamMembers.map((member) => (
                              <div
                                key={member.id}
                                className="flex items-center justify-between p-3 rounded-lg bg-zinc-900/50"
                              >
                                <div className="flex items-center gap-3">
                                  <div className="h-8 w-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 text-sm">
                                    {member.full_name?.charAt(0)?.toUpperCase()}
                                  </div>
                                  <div>
                                    <p className="text-white text-sm">{member.full_name}</p>
                                    <p className="text-zinc-500 text-xs">
                                      {member.role || "Member"}
                                      {member.email && ` • ${member.email}`}
                                    </p>
                                  </div>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-zinc-400 hover:text-red-400"
                                  onClick={() => handleDeleteTeamMember(member.id)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Add Team Member Dialog */}
      <Dialog open={teamDialogOpen} onOpenChange={setTeamDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Team Member</DialogTitle>
            <DialogDescription>
              Add a team member to {selectedVendor?.full_name}'s team
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddTeamMember}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="memberName">Full Name *</Label>
                <Input
                  id="memberName"
                  placeholder="Jane Smith"
                  value={teamMemberForm.fullName}
                  onChange={(e) => setTeamMemberForm({ ...teamMemberForm, fullName: e.target.value })}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="memberEmail">Email</Label>
                  <Input
                    id="memberEmail"
                    type="email"
                    placeholder="jane@example.com"
                    value={teamMemberForm.email}
                    onChange={(e) => setTeamMemberForm({ ...teamMemberForm, email: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="memberRole">Role</Label>
                  <Input
                    id="memberRole"
                    placeholder="Editor, Colorist, etc."
                    value={teamMemberForm.role}
                    onChange={(e) => setTeamMemberForm({ ...teamMemberForm, role: e.target.value })}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setTeamDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Adding..." : "Add Member"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
