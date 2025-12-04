"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Save, Building2, User, Bell, Shield, CreditCard, HardDrive, KeyRound } from "lucide-react";
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
  const [googleSaving, setGoogleSaving] = useState(false);
  const [googleClientId, setGoogleClientId] = useState("");
  const [googleClientSecret, setGoogleClientSecret] = useState("");
  const [googleClientIdMasked, setGoogleClientIdMasked] = useState<string | null>(null);
  const [hasGoogleSecret, setHasGoogleSecret] = useState(false);
  const { toast } = useToast();

  const [orgName, setOrgName] = useState("");
  const [fullName, setFullName] = useState("");

  useEffect(() => {
    fetchData();
    fetchGoogleSettings();
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

  const fetchGoogleSettings = async () => {
    try {
      const res = await fetch("/api/settings/google");
      if (!res.ok) return;
      const data = await res.json();
      if (data.googleClientIdMasked) {
        setGoogleClientIdMasked(data.googleClientIdMasked);
        setHasGoogleSecret(data.hasClientSecret);
      }
    } catch (error) {
      console.error("Error fetching Google settings:", error);
    }
  };

  const handleSaveGoogle = async () => {
    if (!googleClientId || !googleClientSecret) {
      toast({
        title: "Missing fields",
        description: "Please enter both Client ID and Client Secret.",
        variant: "destructive",
      });
      return;
    }

    setGoogleSaving(true);
    try {
      const res = await fetch("/api/settings/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: googleClientId,
          clientSecret: googleClientSecret,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save Google OAuth settings");
      }

      setGoogleClientIdMasked(data.googleClientIdMasked);
      setHasGoogleSecret(true);
      setGoogleClientSecret("");

      toast({
        title: "Google OAuth Updated",
        description: "Google OAuth credentials saved for all users.",
        variant: "success",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setGoogleSaving(false);
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
          <div className="space-y-4">
            <DriveConnect />

            {/* Google OAuth Credentials (Admin only) */}
            {organization && profile && (
              <Card className="glass border-zinc-800/50">
                <CardHeader>
                  <div className="flex items-center gap-3 mb-2">
                    <KeyRound className="h-5 w-5 text-zinc-400" />
                    <CardTitle className="text-white">
                      Google OAuth (App-wide)
                    </CardTitle>
                  </div>
                  <CardDescription>
                    Configure the Google OAuth Client ID and Secret used for Drive integration.
                    These settings apply to all users in this deployment.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-2">
                    <Label htmlFor="google-client-id">Client ID</Label>
                    <Input
                      id="google-client-id"
                      placeholder={
                        googleClientIdMasked
                          ? `Current: ${googleClientIdMasked}`
                          : "1677...apps.googleusercontent.com"
                      }
                      value={googleClientId}
                      onChange={(e) => setGoogleClientId(e.target.value)}
                    />
                    {googleClientIdMasked && (
                      <p className="text-xs text-zinc-500">
                        Stored Client ID: <span className="font-mono">{googleClientIdMasked}</span>
                      </p>
                    )}
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="google-client-secret">Client Secret</Label>
                    <Input
                      id="google-client-secret"
                      type="password"
                      placeholder={hasGoogleSecret ? "************ (already set)" : "GOCSPX-..."}
                      value={googleClientSecret}
                      onChange={(e) => setGoogleClientSecret(e.target.value)}
                    />
                    <p className="text-xs text-zinc-500">
                      Only admins can update these values. Secrets are stored securely in the database,
                      not exposed to other users.
                    </p>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-zinc-500">
                      Redirect URI (configure in Google Cloud Console):{" "}
                      <span className="font-mono">
                        {`${window.location.origin}/api/google/callback`}
                      </span>
                    </p>
                    <Button onClick={handleSaveGoogle} disabled={googleSaving}>
                      <Save className="h-4 w-4 mr-2" />
                      {googleSaving ? "Saving..." : "Save OAuth Keys"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

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
            <CardContent className="space-y-4">
              {organization?.subscription_tier !== "free" ? (
                 <div className="flex flex-col gap-4">
                    <div className="p-4 rounded-lg bg-zinc-900/50 border border-zinc-800">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-zinc-400">Current Plan</span>
                            <span className="font-medium text-white capitalize">{organization?.subscription_tier}</span>
                        </div>
                        <p className="text-xs text-zinc-500">
                            Managed via Stripe
                        </p>
                    </div>
                    <Button 
                        variant="outline" 
                        onClick={async () => {
                            try {
                                const res = await fetch("/api/stripe/customer-portal", { method: "POST" });
                                if (!res.ok) throw new Error("Failed to load portal");
                                const { url } = await res.json();
                                window.location.href = url;
                            } catch (error) {
                                toast({
                                    title: "Error",
                                    description: "Could not access billing portal",
                                    variant: "destructive"
                                });
                            }
                        }}
                    >
                        Manage Subscription
                    </Button>
                 </div>
              ) : (
                  <div className="space-y-4">
                    <p className="text-sm text-zinc-400">
                        You are currently on the Free plan. Upgrade to unlock more features.
                    </p>
                    <Button asChild>
                        <a href="/dashboard/pricing">View Plans</a>
                    </Button>
                  </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

