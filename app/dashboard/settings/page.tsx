"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Save, Building2, User, Bell, Shield, CreditCard, HardDrive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { DriveConnect } from "@/components/drive/drive-connect";
import { supabase } from "@/lib/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Organization {
  id: string;
  name: string;
  subscription_tier: "free" | "pro" | "enterprise";
}

interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

export default function SettingsPage() {
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const [orgName, setOrgName] = useState("");
  const [fullName, setFullName] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch profile
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (profileData) {
        setProfile(profileData);
        setFullName(profileData.full_name || "");

        // Fetch organization
        const { data: orgData } = await supabase
          .from("organizations")
          .select("*")
          .eq("id", profileData.organization_id)
          .single();

        if (orgData) {
          setOrganization(orgData);
          setOrgName(orgData.name);
        }
      }
    } catch (error) {
      console.error("Error fetching settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveOrganization = async () => {
    if (!organization) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from("organizations")
        .update({ name: orgName })
        .eq("id", organization.id);

      if (error) throw error;

      setOrganization({ ...organization, name: orgName });
      toast({
        title: "Organization updated",
        description: "Your organization name has been saved.",
        variant: "success",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update organization",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!profile) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: fullName })
        .eq("id", profile.id);

      if (error) throw error;

      setProfile({ ...profile, full_name: fullName });
      toast({
        title: "Profile updated",
        description: "Your profile has been saved.",
        variant: "success",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update profile",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-semibold text-white mb-2">Settings</h1>
        <p className="text-zinc-400">
          Manage your organization and account settings
        </p>
      </div>

      {loading ? (
        <div className="space-y-6">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="glass border-zinc-800/50">
              <CardHeader>
                <Skeleton className="h-6 w-32 mb-2" />
                <Skeleton className="h-4 w-64" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-10 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Organization Settings */}
          <Card className="glass border-zinc-800/50">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <Building2 className="h-5 w-5 text-zinc-400" />
                <CardTitle className="text-white">Organization</CardTitle>
              </div>
              <CardDescription>
                Manage your organization details and subscription
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="org-name">Organization Name</Label>
                <Input
                  id="org-name"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="Your Organization"
                />
              </div>
              {organization && (
                <div className="grid gap-2">
                  <Label>Subscription Tier</Label>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium",
                        organization.subscription_tier === "enterprise"
                          ? "border-purple-500/20 bg-purple-500/10 text-purple-400"
                          : organization.subscription_tier === "pro"
                          ? "border-blue-500/20 bg-blue-500/10 text-blue-400"
                          : "border-zinc-500/20 bg-zinc-500/10 text-zinc-400"
                      )}
                    >
                      {organization.subscription_tier.charAt(0).toUpperCase() +
                        organization.subscription_tier.slice(1)}
                    </span>
                  </div>
                </div>
              )}
              <Button onClick={handleSaveOrganization} disabled={saving}>
                <Save className="h-4 w-4 mr-2" />
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </CardContent>
          </Card>

          {/* Profile Settings */}
          <Card className="glass border-zinc-800/50">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <User className="h-5 w-5 text-zinc-400" />
                <CardTitle className="text-white">Profile</CardTitle>
              </div>
              <CardDescription>
                Update your personal information
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="full-name">Full Name</Label>
                <Input
                  id="full-name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your Name"
                />
              </div>
              <Button onClick={handleSaveProfile} disabled={saving}>
                <Save className="h-4 w-4 mr-2" />
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </CardContent>
          </Card>

          {/* Google Drive Integration */}
          <DriveConnect />

          {/* Notifications Settings */}
          <Card className="glass border-zinc-800/50">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <Bell className="h-5 w-5 text-zinc-400" />
                <CardTitle className="text-white">Notifications</CardTitle>
              </div>
              <CardDescription>
                Configure your notification preferences
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-zinc-400">
                Notification settings will be available soon.
              </p>
            </CardContent>
          </Card>

          {/* Security Settings */}
          <Card className="glass border-zinc-800/50">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <Shield className="h-5 w-5 text-zinc-400" />
                <CardTitle className="text-white">Security</CardTitle>
              </div>
              <CardDescription>
                Manage your account security settings
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-zinc-400">
                Security settings will be available soon.
              </p>
            </CardContent>
          </Card>

          {/* Billing Settings */}
          <Card className="glass border-zinc-800/50">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <CreditCard className="h-5 w-5 text-zinc-400" />
                <CardTitle className="text-white">Billing</CardTitle>
              </div>
              <CardDescription>
                Manage your subscription and payment methods
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-zinc-400">
                Billing settings will be available soon.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

