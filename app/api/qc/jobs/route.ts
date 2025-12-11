/**
 * GET /api/qc/jobs
 * 
 * Fetch QC jobs for the current user's organization
 * Uses admin client to bypass RLS issues
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return null;
  }

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

    const adminClient = getAdminClient();
    if (!adminClient) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    // Get user's organization
    const { data: profile } = await adminClient
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ jobs: [], deliveries: [] });
    }

    const organizationId = profile.organization_id;

    // Fetch both deliveries and qc_jobs
    const [deliveriesRes, qcJobsRes] = await Promise.all([
      adminClient
        .from("deliveries")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(200),
      adminClient
        .from("qc_jobs")
        .select(`
          *,
          project:projects(id, code, name)
        `)
        .eq("organisation_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

    const deliveries = deliveriesRes.data || [];
    const qcJobs = qcJobsRes.data || [];

    // Merge results
    const allResults = new Map();

    deliveries.forEach((d: any) => {
      allResults.set(d.id, {
        ...d,
        progress: d.status === "qc_passed" || d.status === "qc_failed" ? 100 :
                  d.status === "processing" ? 50 : 0,
      });
    });

    qcJobs.forEach((job: any) => {
      const existing = allResults.get(job.delivery_id) || {};
      allResults.set(job.delivery_id || job.id, {
        id: job.delivery_id || job.id,
        file_name: job.file_name || existing.file_name || "",
        storage_path: existing.storage_path || job.storage_path || "",
        original_file_name: job.file_name || existing.original_file_name || "",
        status: job.status === "completed" ? "qc_passed" :
                job.status === "failed" ? "qc_failed" : job.status,
        drive_link: job.drive_link,
        drive_file_id: job.drive_file_id,
        qc_report: job.result || existing.qc_report,
        qc_errors: job.result?.errors || existing.qc_errors || [],
        created_at: job.created_at,
        updated_at: job.updated_at,
        progress: job.status === "completed" || job.status === "failed" ? 100 :
                  job.status === "running" ? Math.min(95, (job.progress || 50)) :
                  job.status === "queued" ? 10 : 0,
        score: job.result?.summary?.score,
        project_id: job.project_id || existing.project_id,
        project: job.project,
        // Creative QC fields
        creative_qc_status: job.creative_qc_status,
        creative_qc_overall_score: job.creative_qc_overall_score,
        creative_qc_overall_risk_score: job.creative_qc_overall_risk_score,
        creative_qc_overall_brand_fit_score: job.creative_qc_overall_brand_fit_score,
        creative_qc_summary: job.creative_qc_summary,
        creative_qc_error: job.creative_qc_error,
      });
    });

    const results = Array.from(allResults.values());

    // Fetch project details for any missing
    const projectIds = [...new Set(results.map((r: any) => r.project_id).filter(Boolean))];
    let projects: any[] = [];
    
    if (projectIds.length > 0) {
      const { data } = await adminClient
        .from("projects")
        .select("id, code, name")
        .in("id", projectIds);
      projects = data || [];
    }

    results.forEach((result: any) => {
      if (result.project_id && !result.project) {
        result.project = projects.find((p) => p.id === result.project_id);
      }
    });

    return NextResponse.json({
      jobs: results,
      count: results.length,
    });
  } catch (error: any) {
    console.error("GET /api/qc/jobs error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch QC jobs" },
      { status: 500 }
    );
  }
}
