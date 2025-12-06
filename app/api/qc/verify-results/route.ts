/**
 * GET /api/qc/verify-results
 * 
 * Debug endpoint to verify QC results are being saved correctly
 * Only available in development or for admins
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getAdminClient() {
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");

    const adminClient = getAdminClient();
    if (!adminClient) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    // Get user's organization
    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 });
    }

    // Build query
    let query = adminClient
      .from("deliveries")
      .select("id, file_name, original_file_name, status, qc_report, qc_errors, created_at, project_id")
      .eq("organization_id", profile.organization_id);

    if (projectId) {
      query = query.eq("project_id", projectId);
    }

    const { data: deliveries, error } = await query.order("created_at", { ascending: false }).limit(50);

    if (error) {
      throw error;
    }

    // Analyze QC data
    const analysis = {
      total: deliveries?.length || 0,
      withQCReport: 0,
      withQCErrors: 0,
      qcPassed: 0,
      qcFailed: 0,
      needsReview: 0,
      processing: 0,
      sampleQCReports: [] as any[],
    };

    deliveries?.forEach((delivery: any) => {
      if (delivery.qc_report && typeof delivery.qc_report === 'object' && Object.keys(delivery.qc_report).length > 0) {
        analysis.withQCReport++;
        
        // Store sample reports
        if (analysis.sampleQCReports.length < 3) {
          analysis.sampleQCReports.push({
            deliveryId: delivery.id,
            fileName: delivery.original_file_name || delivery.file_name,
            qcReport: delivery.qc_report,
            qcErrors: delivery.qc_errors,
          });
        }
      }
      
      if (Array.isArray(delivery.qc_errors) && delivery.qc_errors.length > 0) {
        analysis.withQCErrors++;
      }

      switch (delivery.status) {
        case "qc_passed":
          analysis.qcPassed++;
          break;
        case "qc_failed":
          analysis.qcFailed++;
          break;
        case "needs_review":
          analysis.needsReview++;
          break;
        case "processing":
          analysis.processing++;
          break;
      }
    });

    return NextResponse.json({
      success: true,
      analysis,
      deliveries: deliveries?.map((d: any) => ({
        id: d.id,
        fileName: d.original_file_name || d.file_name,
        status: d.status,
        hasQCReport: !!(d.qc_report && Object.keys(d.qc_report).length > 0),
        hasQCErrors: Array.isArray(d.qc_errors) && d.qc_errors.length > 0,
        qcReportKeys: d.qc_report ? Object.keys(d.qc_report) : [],
        qcErrorCount: Array.isArray(d.qc_errors) ? d.qc_errors.length : 0,
        createdAt: d.created_at,
      })),
    });
  } catch (error: any) {
    console.error("[VerifyQCResults] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to verify QC results" },
      { status: 500 }
    );
  }
}

