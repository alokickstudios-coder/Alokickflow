/**
 * Centralized Authentication & Organization Helpers
 * 
 * These helpers ensure users always have a valid organization linked.
 * Used by all API routes that need organization context.
 */

import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

export interface SessionData {
  user: {
    id: string;
    email: string | undefined;
  };
  profile: any;
  organization: any;
  organizationId: string;
}

/**
 * Get Supabase admin client with service role key
 */
export function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Missing Supabase configuration:", {
      hasUrl: !!supabaseUrl,
      hasServiceKey: !!supabaseServiceKey,
    });
    return null;
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Get authenticated user's session with auto-creation of profile and organization
 * 
 * This function ALWAYS returns a valid organization for authenticated users.
 * It will create the organization and profile if they don't exist.
 */
export async function getAuthenticatedSession(): Promise<{
  success: boolean;
  error?: string;
  data?: SessionData;
}> {
  try {
    // Get authenticated user from request cookies
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return { success: false, error: "Not authenticated" };
    }

    const adminClient = getAdminClient();
    if (!adminClient) {
      return { success: false, error: "Server configuration error" };
    }

    // Get or create profile with organization
    const result = await ensureUserHasOrganization(adminClient, user);
    
    if (!result.success) {
      return { success: false, error: result.error };
    }

    return {
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
        },
        profile: result.profile,
        organization: result.organization,
        organizationId: result.organizationId!,
      },
    };
  } catch (error: any) {
    console.error("getAuthenticatedSession error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Ensure user has a profile and organization linked.
 * Creates them if they don't exist or links them if disconnected.
 */
export async function ensureUserHasOrganization(
  adminClient: any,
  user: { id: string; email?: string; user_metadata?: any }
): Promise<{
  success: boolean;
  error?: string;
  profile?: any;
  organization?: any;
  organizationId?: string;
}> {
  try {
    // Step 1: Get existing profile
    let { data: profile } = await adminClient
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    // Step 2: Get or create organization
    let organization = null;
    let organizationId = profile?.organization_id;

    if (organizationId) {
      // Profile has organization_id, verify it exists
      const { data: existingOrg } = await adminClient
        .from("organizations")
        .select("*")
        .eq("id", organizationId)
        .single();
      
      if (existingOrg) {
        organization = existingOrg;
      } else {
        // Organization doesn't exist anymore, clear the reference
        organizationId = null;
      }
    }

    // Step 3: Create organization if needed
    if (!organization) {
      const orgName = user.email?.split("@")[0] || "My Organization";
      
      const { data: newOrg, error: orgError } = await adminClient
        .from("organizations")
        .insert({
          name: `${orgName}'s Workspace`,
          subscription_tier: "enterprise", // Default to enterprise for full access
        })
        .select()
        .single();

      if (orgError) {
        console.error("Failed to create organization:", orgError);
        return { success: false, error: "Failed to create organization" };
      }

      organization = newOrg;
      organizationId = newOrg.id;

      // Also create enterprise subscription
      await createEnterpriseSubscription(adminClient, organizationId);
    }

    // Step 4: Create or update profile
    if (!profile) {
      // Create new profile
      const { data: newProfile, error: profileError } = await adminClient
        .from("profiles")
        .insert({
          id: user.id,
          full_name: user.user_metadata?.full_name || user.email?.split("@")[0] || "User",
          role: "admin",
          organization_id: organizationId,
        })
        .select()
        .single();

      if (profileError) {
        console.error("Failed to create profile:", profileError);
        return { success: false, error: "Failed to create profile" };
      }

      profile = newProfile;
    } else if (!profile.organization_id || profile.organization_id !== organizationId) {
      // Update profile with organization_id
      const { data: updatedProfile, error: updateError } = await adminClient
        .from("profiles")
        .update({ organization_id: organizationId })
        .eq("id", user.id)
        .select()
        .single();

      if (!updateError && updatedProfile) {
        profile = updatedProfile;
      }
    }

    // Step 5: Ensure organization has enterprise subscription
    await ensureEnterpriseAccess(adminClient, organizationId!);

    return {
      success: true,
      profile,
      organization,
      organizationId,
    };
  } catch (error: any) {
    console.error("ensureUserHasOrganization error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Create enterprise subscription for organization
 */
async function createEnterpriseSubscription(
  adminClient: any,
  organizationId: string
) {
  try {
    // Check if plan exists
    let { data: plan } = await adminClient
      .from("plans")
      .select("*")
      .eq("slug", "enterprise")
      .single();

    if (!plan) {
      // Create enterprise plan
      const { data: newPlan } = await adminClient
        .from("plans")
        .insert({
          slug: "enterprise",
          name: "Enterprise",
          description: "Full access to all features",
          price_monthly: 0,
          price_yearly: 0,
          features: {
            creative_qc: true,
            bulk_qc: true,
            analytics: true,
            team_management: true,
            vendor_management: true,
            api_access: true,
            priority_support: true,
          },
          limits: {
            qc_jobs_per_month: -1,
            team_members: -1,
            storage_gb: -1,
          },
        })
        .select()
        .single();
      
      plan = newPlan;
    }

    if (plan) {
      // Create subscription
      await adminClient
        .from("organisation_subscriptions")
        .upsert({
          organisation_id: organizationId,
          plan_id: plan.id,
          plan_slug: "enterprise",
          status: "active",
          current_period_start: new Date().toISOString(),
          current_period_end: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        }, {
          onConflict: "organisation_id",
        });
    }
  } catch (error) {
    console.error("createEnterpriseSubscription error:", error);
  }
}

/**
 * Ensure organization has full enterprise access
 */
async function ensureEnterpriseAccess(
  adminClient: any,
  organizationId: string
) {
  try {
    // Update organization subscription tier
    await adminClient
      .from("organizations")
      .update({ subscription_tier: "enterprise" })
      .eq("id", organizationId);

    // Enable creative_qc_settings
    const { data: existing } = await adminClient
      .from("organizations")
      .select("creative_qc_settings")
      .eq("id", organizationId)
      .single();

    if (!existing?.creative_qc_settings) {
      await adminClient
        .from("organizations")
        .update({
          creative_qc_settings: {
            enabled: true,
            auto_analyze: true,
            quality_threshold: 80,
          },
        })
        .eq("id", organizationId);
    }

    // Enable feature flags
    const features = ["creative_qc", "bulk_qc", "analytics", "team_management", "vendor_management"];
    for (const feature of features) {
      await adminClient
        .from("feature_flags")
        .upsert({
          organisation_id: organizationId,
          feature_key: feature,
          enabled: true,
        }, {
          onConflict: "organisation_id,feature_key",
        });
    }
  } catch (error) {
    console.error("ensureEnterpriseAccess error:", error);
  }
}
