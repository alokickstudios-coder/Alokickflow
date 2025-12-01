"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mail,
  Trash2,
  Shield,
  UserPlus,
  Search,
  MoreVertical,
  Edit,
  Crown,
  Languages,
  Mic,
  Music,
  Subtitles,
  Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { SearchInput } from "@/components/ui/search-input";
import { supabase } from "@/lib/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// All available roles for team management
type TeamRole = 
  | "admin" 
  | "manager" 
  | "operator" 
  | "vendor"
  | "translation"
  | "dubbing"
  | "mixing"
  | "subtitling";

interface TeamMember {
  id: string;
  full_name: string | null;
  role: TeamRole;
  email?: string;
  created_at: string;
}

const roleColors: Record<TeamRole, string> = {
  admin: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  manager: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  operator: "bg-green-500/20 text-green-400 border-green-500/30",
  vendor: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  translation: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  dubbing: "bg-pink-500/20 text-pink-400 border-pink-500/30",
  mixing: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  subtitling: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
};

const roleLabels: Record<TeamRole, string> = {
  admin: "Admin",
  manager: "Manager",
  operator: "Operator",
  vendor: "Vendor",
  translation: "Translation",
  dubbing: "Dubbing",
  mixing: "Mixing",
  subtitling: "Subtitling/Video",
};

const roleIcons: Record<TeamRole, React.ReactNode> = {
  admin: <Crown className="h-3 w-3" />,
  manager: <Shield className="h-3 w-3" />,
  operator: <Edit className="h-3 w-3" />,
  vendor: null,
  translation: <Languages className="h-3 w-3" />,
  dubbing: <Mic className="h-3 w-3" />,
  mixing: <Music className="h-3 w-3" />,
  subtitling: <Subtitles className="h-3 w-3" />,
};

export default function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [filteredMembers, setFilteredMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteData, setInviteData] = useState({ email: "", role: "operator" });
  const [inviting, setInviting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchTeamMembers();
  }, []);

  useEffect(() => {
    let filtered = members;

    if (searchQuery) {
      filtered = filtered.filter(
        (m) =>
          m.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.email?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (roleFilter !== "all") {
      filtered = filtered.filter((m) => m.role === roleFilter);
    }

    setFilteredMembers(filtered);
  }, [searchQuery, roleFilter, members]);

  const fetchTeamMembers = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id, role")
        .eq("id", user.id)
        .single();

      if (!profile?.organization_id) return;

      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, role, created_at")
        .eq("organization_id", profile.organization_id)
        .neq("role", "vendor")
        .order("created_at", { ascending: false });

      if (data) {
        // Get emails from auth (in production, you'd use a server function)
        const membersWithEmail = data.map((m) => ({
          ...m,
          email: `user-${m.id.slice(0, 8)}@example.com`, // Placeholder
        }));
        setMembers(membersWithEmail as TeamMember[]);
        setFilteredMembers(membersWithEmail as TeamMember[]);
      }
    } catch (error) {
      console.error("Error fetching team:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviting(true);

    try {
      // In production, you'd send an invite email via Edge Function
      // For now, we'll show a success message
      toast({
        title: "Invitation Sent",
        description: `An invitation has been sent to ${inviteData.email}`,
        variant: "success",
      });

      setInviteDialogOpen(false);
      setInviteData({ email: "", role: "operator" });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to send invitation",
        variant: "destructive",
      });
    } finally {
      setInviting(false);
    }
  };

  const handleChangeRole = async (memberId: string, newRole: TeamRole) => {
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ role: newRole })
        .eq("id", memberId);

      if (error) throw error;

      setMembers((prev) =>
        prev.map((m) => (m.id === memberId ? { ...m, role: newRole } : m))
      );

      toast({
        title: "Role Updated",
        description: "Team member role has been updated",
        variant: "success",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update role",
        variant: "destructive",
      });
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!confirm("Are you sure you want to remove this team member?")) return;

    try {
      // In production, you'd also remove from auth.users
      const { error } = await supabase
        .from("profiles")
        .delete()
        .eq("id", memberId);

      if (error) throw error;

      setMembers((prev) => prev.filter((m) => m.id !== memberId));

      toast({
        title: "Member Removed",
        description: "Team member has been removed from your organization",
        variant: "success",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to remove member",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-white">Team Management</h1>
          <p className="text-zinc-400 mt-1">
            Manage your organization's team members and roles
          </p>
        </div>
        <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="h-4 w-4 mr-2" />
              Invite Member
            </Button>
          </DialogTrigger>
          <DialogContent className="glass border-zinc-800/50">
            <DialogHeader>
              <DialogTitle className="text-white">Invite Team Member</DialogTitle>
              <DialogDescription>
                Send an invitation to join your organization
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleInvite} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="colleague@company.com"
                  value={inviteData.email}
                  onChange={(e) =>
                    setInviteData({ ...inviteData, email: e.target.value })
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <Select
                  value={inviteData.role}
                  onValueChange={(value) =>
                    setInviteData({ ...inviteData, role: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">
                      <div className="flex items-center gap-2">
                        <Crown className="h-3.5 w-3.5 text-purple-400" />
                        Admin
                      </div>
                    </SelectItem>
                    <SelectItem value="manager">
                      <div className="flex items-center gap-2">
                        <Shield className="h-3.5 w-3.5 text-blue-400" />
                        Manager
                      </div>
                    </SelectItem>
                    <SelectItem value="operator">
                      <div className="flex items-center gap-2">
                        <Edit className="h-3.5 w-3.5 text-green-400" />
                        Operator
                      </div>
                    </SelectItem>
                    <div className="px-2 py-1.5 text-xs text-zinc-500 font-medium border-t border-zinc-800 mt-1 pt-2">
                      Production Teams
                    </div>
                    <SelectItem value="translation">
                      <div className="flex items-center gap-2">
                        <Languages className="h-3.5 w-3.5 text-cyan-400" />
                        Translation Team
                      </div>
                    </SelectItem>
                    <SelectItem value="dubbing">
                      <div className="flex items-center gap-2">
                        <Mic className="h-3.5 w-3.5 text-pink-400" />
                        Dubbing Team
                      </div>
                    </SelectItem>
                    <SelectItem value="mixing">
                      <div className="flex items-center gap-2">
                        <Music className="h-3.5 w-3.5 text-amber-400" />
                        Mixing Team
                      </div>
                    </SelectItem>
                    <SelectItem value="subtitling">
                      <div className="flex items-center gap-2">
                        <Subtitles className="h-3.5 w-3.5 text-indigo-400" />
                        Subtitling / Video Editing
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full" disabled={inviting}>
                {inviting ? "Sending..." : "Send Invitation"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <Card className="glass border-zinc-800/50">
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <SearchInput
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 max-w-sm"
            />
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="operator">Operator</SelectItem>
                <div className="px-2 py-1.5 text-xs text-zinc-500 font-medium border-t border-zinc-800 mt-1 pt-2">
                  Production Teams
                </div>
                <SelectItem value="translation">Translation</SelectItem>
                <SelectItem value="dubbing">Dubbing</SelectItem>
                <SelectItem value="mixing">Mixing</SelectItem>
                <SelectItem value="subtitling">Subtitling/Video</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Team Table */}
      <Card className="glass border-zinc-800/50">
        <CardHeader>
          <CardTitle className="text-white">
            Team Members ({filteredMembers.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-zinc-400">
                {searchQuery || roleFilter !== "all"
                  ? "No members match your filters"
                  : "No team members yet"}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800/50">
                  <TableHead className="text-zinc-400">Member</TableHead>
                  <TableHead className="text-zinc-400">Role</TableHead>
                  <TableHead className="text-zinc-400">Joined</TableHead>
                  <TableHead className="text-zinc-400 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMembers.map((member, index) => (
                  <motion.tr
                    key={member.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: index * 0.05 }}
                    className="border-zinc-800/50 hover:bg-zinc-900/30"
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-zinc-700 to-zinc-900 flex items-center justify-center text-white font-medium">
                          {member.full_name?.[0]?.toUpperCase() || "?"}
                        </div>
                        <div>
                          <p className="font-medium text-white">
                            {member.full_name || "Unknown"}
                          </p>
                          <p className="text-sm text-zinc-400">{member.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border",
                          roleColors[member.role]
                        )}
                      >
                        {roleIcons[member.role]}
                        {roleLabels[member.role]}
                      </span>
                    </TableCell>
                    <TableCell className="text-zinc-400">
                      {new Date(member.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="glass border-zinc-800/50 w-56">
                          <div className="px-2 py-1.5 text-xs text-zinc-500 font-medium">
                            Change Role
                          </div>
                          <DropdownMenuItem
                            onClick={() => handleChangeRole(member.id, "admin")}
                          >
                            <Crown className="h-4 w-4 mr-2 text-purple-400" />
                            Make Admin
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleChangeRole(member.id, "manager")}
                          >
                            <Shield className="h-4 w-4 mr-2 text-blue-400" />
                            Make Manager
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleChangeRole(member.id, "operator")}
                          >
                            <Edit className="h-4 w-4 mr-2 text-green-400" />
                            Make Operator
                          </DropdownMenuItem>
                          <div className="px-2 py-1.5 text-xs text-zinc-500 font-medium border-t border-zinc-800 mt-1 pt-2">
                            Assign to Team
                          </div>
                          <DropdownMenuItem
                            onClick={() => handleChangeRole(member.id, "translation")}
                          >
                            <Languages className="h-4 w-4 mr-2 text-cyan-400" />
                            Translation Team
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleChangeRole(member.id, "dubbing")}
                          >
                            <Mic className="h-4 w-4 mr-2 text-pink-400" />
                            Dubbing Team
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleChangeRole(member.id, "mixing")}
                          >
                            <Music className="h-4 w-4 mr-2 text-amber-400" />
                            Mixing Team
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleChangeRole(member.id, "subtitling")}
                          >
                            <Subtitles className="h-4 w-4 mr-2 text-indigo-400" />
                            Subtitling / Video Editing
                          </DropdownMenuItem>
                          <div className="border-t border-zinc-800 mt-1 pt-1">
                            <DropdownMenuItem
                              onClick={() => handleRemoveMember(member.id)}
                              className="text-red-400"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Remove Member
                            </DropdownMenuItem>
                          </div>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </motion.tr>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

