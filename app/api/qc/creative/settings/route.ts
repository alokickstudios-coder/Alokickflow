/**
 * Creative QC (SPI) Settings API
 * 
 * GET - Fetch Creative QC settings and availability
 * POST - Update Creative QC settings (toggle, config)
 * 
 * Enterprise only - requires creative_qc_spi feature
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isCreativeQCAvailable,
  getCreativeQCSettings,
  updateCreativeQCSettings,
  getCreativeQCProviderStatus,
} from "@/lib/services/spi/engine";
import {
  CREATIVE_QC_PARAMETERS,
  CREATIVE_QC_CATEGORIES,
  getParametersByCategory,
  DEFAULT_CREATIVE_QC_SETTINGS,
  CreativeQCSettings,
} from "@/config/creativeQcConfig";

function getAdminClient(): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createAdminClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * GET /api/qc/creative/settings
 * 
 * Returns Creative QC availability, settings, and parameter definitions
 */
export async function GET(request: NextRequest) {
  try {
    const supabase: SupabaseClient = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get user's organization
    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id, role")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    const organizationId = profile.organization_id;

    // Check if Creative QC is available for this organization
    const availability = await isCreativeQCAvailable(organizationId);
    
    // Get current settings
    const settings = await getCreativeQCSettings(organizationId) || DEFAULT_CREATIVE_QC_SETTINGS;

    // Get parameter definitions grouped by category
    const parametersByCategory = getParametersByCategory();

    // Get provider status
    const providerStatus = getCreativeQCProviderStatus();

    return NextResponse.json({
      available: availability.available,
      availabilityReason: availability.reason,
      settings,
      categories: CREATIVE_QC_CATEGORIES,
      parametersByCategory,
      totalParameters: CREATIVE_QC_PARAMETERS.length,
      providers: {
        transcription: providerStatus.transcription,
        spi: providerStatus.spi,
      },
    });
  } catch (error: any) {
    console.error("[Creative QC Settings API] GET error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch Creative QC settings" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/qc/creative/settings
 * 
 * Update Creative QC settings for the organization
 * Body: Partial<CreativeQCSettings>
 */
export async function POST(request: NextRequest) {
  try {
    const supabase: SupabaseClient = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get user's organization and role
    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id, role")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    // Only admins can update Creative QC settings
    if (profile.role !== "admin" && profile.role !== "owner") {
      return NextResponse.json(
        { error: "Only admins can update Creative QC settings" },
        { status: 403 }
      );
    }

    const organizationId = profile.organization_id;

    // Check if Creative QC is available
    const availability = await isCreativeQCAvailable(organizationId);
    if (!availability.available) {
      return NextResponse.json(
        { error: availability.reason || "Creative QC is not available for this organization" },
        { status: 403 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const settingsUpdate: Partial<CreativeQCSettings> = {};

    // Validate and extract settings
    if (typeof body.enabled === "boolean") {
      settingsUpdate.enabled = body.enabled;
    }

    if (typeof body.betaAccepted === "boolean") {
      settingsUpdate.betaAccepted = body.betaAccepted;
    }

    if (body.customParameters && Array.isArray(body.customParameters)) {
      // Validate parameter keys
      const validKeys = CREATIVE_QC_PARAMETERS.map((p) => p.key);
      const invalidKeys = body.customParameters.filter((k: string) => !validKeys.includes(k));
      if (invalidKeys.length > 0) {
        return NextResponse.json(
          { error: `Invalid parameter keys: ${invalidKeys.join(", ")}` },
          { status: 400 }
        );
      }
      settingsUpdate.customParameters = body.customParameters;
    }

    if (typeof body.targetAudience === "string") {
      settingsUpdate.targetAudience = body.targetAudience;
    }

    if (typeof body.brandGuidelines === "string") {
      settingsUpdate.brandGuidelines = body.brandGuidelines;
    }

    if (body.platformType && ["long_form", "short_form", "episodic", "social", "corporate"].includes(body.platformType)) {
      settingsUpdate.platformType = body.platformType;
    }

    // Update settings
    const success = await updateCreativeQCSettings(organizationId, settingsUpdate);

    if (!success) {
      return NextResponse.json(
        { error: "Failed to update Creative QC settings" },
        { status: 500 }
      );
    }

    // Log the settings change (ignore errors)
    const adminClient = getAdminClient();
    if (adminClient) {
      try {
        await adminClient.from("creative_qc_audit_log").insert({
          organization_id: organizationId,
          action: "settings_updated",
          details: settingsUpdate,
          performed_by: user.id,
        });
      } catch {
        // Ignore audit log errors
      }
    }

    // Fetch and return updated settings
    const updatedSettings = await getCreativeQCSettings(organizationId);

    return NextResponse.json({
      success: true,
      settings: updatedSettings,
      message: settingsUpdate.enabled 
        ? "Creative QC (SPI) has been enabled"
        : "Creative QC settings updated",
    });
  } catch (error: any) {
    console.error("[Creative QC Settings API] POST error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update Creative QC settings" },
      { status: 500 }
    );
  }
}

