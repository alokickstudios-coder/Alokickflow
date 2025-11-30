"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Plus, Mail, User } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Vendor {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
}

// Mock trust score calculation (replace with real logic later)
function calculateTrustScore(vendor: Vendor): number {
  // For now, return a random score between 80-100
  return Math.floor(Math.random() * 20) + 80;
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
      <div className="h-2 w-2 rounded-full bg-current" />
      {score}% Trust
    </div>
  );
}

export default function VendorsPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const fetchVendors = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log("No user found");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", user.id)
        .single();

      if (profileError) {
        console.log("Profile error:", profileError);
        // Don't show error toast, just log it
        return;
      }

      if (!profile?.organization_id) {
        console.log("No organization_id in profile");
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("organization_id", profile.organization_id)
        .eq("role", "vendor")
        .order("created_at", { ascending: false });

      if (error) {
        console.log("Error fetching vendors:", error);
        return;
      }
      
      setVendors(data || []);
    } catch (error: any) {
      console.error("Error fetching vendors:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVendors();
  }, []);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("Not authenticated");
      }

      // Try to get organization from profile, fallback to fetching from organizations table
      let organizationId: string | null = null;
      
      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", user.id)
        .single();

      if (profile?.organization_id) {
        organizationId = profile.organization_id;
      } else {
        // Fallback: Get first organization from the table
        const { data: orgs } = await supabase
          .from("organizations")
          .select("id")
          .limit(1);
        
        if (orgs && orgs.length > 0) {
          organizationId = orgs[0].id;
          
          // Try to update the user's profile with this org
          await supabase
            .from("profiles")
            .update({ organization_id: organizationId })
            .eq("id", user.id);
        }
      }

      if (!organizationId) {
        // Last resort: Create a new organization
        const { data: newOrg, error: orgError } = await supabase
          .from("organizations")
          .insert({ name: "My Organization" })
          .select()
          .single();

        if (orgError) {
          throw new Error("Could not create organization. Please check your database setup.");
        }
        
        organizationId = newOrg.id;
        
        // Update profile with new org
        await supabase
          .from("profiles")
          .upsert({ 
            id: user.id, 
            organization_id: organizationId,
            role: "admin"
          });
      }

      // Use API route to create vendor (bypasses RLS)
      const response = await fetch("/api/vendors/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          fullName: vendorName.trim(),
          organizationId: organizationId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create vendor");
      }

      // Add new vendor to state
      if (data.vendor) {
        setVendors((prev) => [data.vendor, ...prev]);
      }

      toast({
        title: data.isTestMode ? "Vendor Added (Test Mode)" : "Vendor Created",
        description: data.isTestMode 
          ? `Test vendor "${data.vendor.full_name}" added.`
          : `Vendor "${data.vendor.full_name}" has been created successfully.`,
        variant: "success",
      });

      setEmail("");
      setVendorName("");
      setDialogOpen(false);
    } catch (error: any) {
      console.error("Error inviting vendor:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create vendor profile",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
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
              Manage your team of freelancers and vendors
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Invite Vendor
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite Vendor</DialogTitle>
                <DialogDescription>
                  Add a new vendor to your organization. For testing, a dummy profile will be created.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleInvite}>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="vendorName">Vendor Name</Label>
                    <Input
                      id="vendorName"
                      type="text"
                      placeholder="John Doe"
                      value={vendorName}
                      onChange={(e) => setVendorName(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="email">Email Address (Optional)</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="vendor@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                    <p className="text-xs text-zinc-500">
                      Leave empty to generate a random test email
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? "Adding..." : "Add Vendor"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Vendors Grid */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="glass border-zinc-800/50">
              <CardHeader>
                <Skeleton className="h-16 w-16 rounded-full mx-auto mb-4" />
                <Skeleton className="h-4 w-32 mx-auto mb-2" />
                <Skeleton className="h-3 w-24 mx-auto" />
              </CardHeader>
            </Card>
          ))}
        </div>
      ) : vendors.length === 0 ? (
        <Card className="glass border-zinc-800/50">
          <CardContent className="text-center py-12">
            <User className="h-12 w-12 text-zinc-600 mx-auto mb-4" />
            <p className="text-zinc-400 mb-2 text-lg font-medium">No Vendors Found</p>
            <p className="text-zinc-500 mb-4 text-sm">Get started by inviting your first vendor</p>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Invite Your First Vendor
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {vendors.map((vendor, index) => (
            <motion.div
              key={vendor.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.1 }}
            >
              <Card className="glass border-zinc-800/50 hover:border-zinc-700/50 transition-colors">
                <CardHeader className="text-center">
                  <div className="flex justify-center mb-4">
                    {vendor.avatar_url ? (
                      <img
                        src={vendor.avatar_url}
                        alt={vendor.full_name || "Vendor"}
                        className="h-16 w-16 rounded-full border-2 border-zinc-800/50"
                      />
                    ) : (
                      <div className="h-16 w-16 rounded-full bg-zinc-800/50 border-2 border-zinc-800/50 flex items-center justify-center">
                        <User className="h-8 w-8 text-zinc-600" />
                      </div>
                    )}
                  </div>
                  <CardTitle className="text-white text-lg">
                    {vendor.full_name || "Unnamed Vendor"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-center">
                  <TrustScoreBadge score={calculateTrustScore(vendor)} />
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
