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
import { SubscriptionCard } from "@/components/billing/subscription-card";
import { supabase } from "@/lib/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PLANS, PlanSlug } from "@/config/subscriptionConfig";

interface Organization {
  id: string;
  name: string;
  subscription_tier: "free" | "mid" | "enterprise";
}

interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

function SubscriptionManagementSection() {
  const [subscription, setSubscription] = useState<any>(null);
  const [usage, setUsage] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const [planSlug, setPlanSlug] = useState<PlanSlug>("free");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSubscriptionData();
  }, []);

  const fetchSubscriptionData = async () => {
    try {
      setLoading(true);
      const [subRes, usageRes] = await Promise.all([
        fetch("/api/billing/subscription"),
        fetch("/api/billing/usage"),
      ]);

      if (subRes.ok) {
        const subData = await subRes.json();
        setSubscription(subData);
        const currentPlan = subData?.subscription?.plan?.slug || "free";
        setPlanSlug(currentPlan as PlanSlug);
      }

      if (usageRes.ok) {
        const usageData = await usageRes.json();
        setUsage(usageData);
      }
    } catch (error) {
      console.error("Error fetching subscription data:", error);
      toast({
        title: "Error",
        description: "Failed to load subscription data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!subscription) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-zinc-400">
          You are currently on the Free plan. Upgrade to unlock more features.
        </p>
        <Button asChild>
          <Link href="/dashboard/pricing">View Plans</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm text-zinc-400">Plan</p>
          <Select value={planSlug} onValueChange={(v) => setPlanSlug(v as PlanSlug)}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="free">Free</SelectItem>
              <SelectItem value="mid">Mid</SelectItem>
              <SelectItem value="enterprise">Enterprise</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          disabled={saving || planSlug === subscription.subscription.plan.slug}
          onClick={async () => {
            setSaving(true);
            try {
              const res = await fetch("/api/billing/plan", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ planSlug, billingCycle: "monthly" }),
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error || "Failed to update plan");
              toast({
                title: "Plan Updated",
                description: `Successfully switched to ${data.subscription.plan.name} plan`,
                variant: "success",
              });
              fetchSubscriptionData();
            } catch (err: any) {
              toast({
                title: "Error",
                description: err.message,
                variant: "destructive",
              });
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? "Saving..." : planSlug === subscription.subscription.plan.slug ? "Current Plan" : "Apply Plan"}
        </Button>
      </div>

      <SubscriptionCard
        plan={subscription.subscription}
        limits={subscription.limits}
        usage={usage?.usage ? { ...usage.usage, ...usage.limits } : undefined}
        enabledAddons={subscription.enabledAddons || []}
      />
    </div>
  );
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
                        (organization.subscription_tier as string) === "enterprise"
                          ? "border-purple-500/20 bg-purple-500/10 text-purple-400"
                          : (organization.subscription_tier as string) === "mid"
                          ? "border-blue-500/20 bg-blue-500/10 text-blue-400"
                          : "border-zinc-500/20 bg-zinc-500/10 text-zinc-400"
                      )}
                    >
                      {(organization.subscription_tier as string) === "mid"
                        ? "Mid"
                        : (organization.subscription_tier as string).charAt(0).toUpperCase() +
                          (organization.subscription_tier as string).slice(1)}
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
                <CardTitle className="text-white">Billing & Subscription</CardTitle>
              </div>
              <CardDescription>
                Manage your subscription, usage, and add-ons
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <SubscriptionManagementSection />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

