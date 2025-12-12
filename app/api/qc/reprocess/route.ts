/**
 * POST /api/qc/reprocess
 * 
 * Reprocess completed QC jobs that may have minimal results
 * Useful after fixing FFmpeg availability
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedSession } from "@/lib/api/auth-helpers";

export const dynamic = "force-dynamic";

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthenticatedSession();
    if (!session.success) {
      return NextResponse.json({ error: session.error || "Unauthorized" }, { status: 401 });
    }

    const adminClient = getAdminClient();
    if (!adminClient) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const { organizationId } = session.data!;
    const body = await request.json().catch(() => ({}));
    const { jobIds, all = false } = body;

    let query = adminClient
      .from("qc_jobs")
      .select("id, status, result_json")
      .eq("organisation_id", organizationId);

    // If specific job IDs provided, filter to those
    if (jobIds && Array.isArray(jobIds) && jobIds.length > 0) {
      query = query.in("id", jobIds);
    }

    // If "all", get jobs that might need reprocessing (completed with minimal results or failed)
    if (all) {
      query = query.in("status", ["completed", "failed"]);
    }

    const { data: jobs, error: fetchError } = await query;

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!jobs || jobs.length === 0) {
      return NextResponse.json({ message: "No jobs found to reprocess", requeued: 0 });
    }

    // Filter to jobs that need reprocessing (minimal results or failed)
    const jobsToReprocess = jobs.filter((job: any) => {
      // Failed jobs should be reprocessed
      if (job.status === "failed") return true;
      
      // Completed jobs with minimal/empty results
      const result = job.result_json;
      if (!result) return true;
      
      // Check if it's a minimal result (has skip messages)
      const hasMinimalResult = 
        result.basicQC?.audioMissing?.error?.includes("FFmpeg") ||
        result.basicQC?.loudness?.message?.includes("FFmpeg") ||
        result.basicQC?.loudness?.lufs === null ||
        !result.basicQC?.metadata?.duration;
      
      return hasMinimalResult;
    });

    if (jobsToReprocess.length === 0) {
      return NextResponse.json({ 
        message: "All jobs already have full results", 
        totalChecked: jobs.length,
        requeued: 0 
      });
    }

    // Reset these jobs to "queued" status
    const jobIdsToRequeue = jobsToReprocess.map((j: any) => j.id);
    
    const { error: updateError } = await adminClient
      .from("qc_jobs")
      .update({
        status: "queued",
        error_message: null,
        result_json: null,
        started_at: null,
        completed_at: null,
        updated_at: new Date().toISOString(),
      })
      .in("id", jobIdsToRequeue);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Trigger queue processing
    const { getAppBaseUrl } = await import("@/lib/config/platform");
    const baseUrl = getAppBaseUrl();
    fetch(`${baseUrl}/api/qc/process-queue`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-trigger": "true" },
      body: JSON.stringify({ limit: 5 }),
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      message: `${jobIdsToRequeue.length} job(s) requeued for processing`,
      totalChecked: jobs.length,
      requeued: jobIdsToRequeue.length,
      requeuedJobIds: jobIdsToRequeue,
    });
  } catch (error: any) {
    console.error("[QC Reprocess] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthenticatedSession();
    if (!session.success) {
      return NextResponse.json({ error: session.error || "Unauthorized" }, { status: 401 });
    }

    const adminClient = getAdminClient();
    if (!adminClient) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const { organizationId } = session.data!;

    // Get stats on jobs that might need reprocessing
    const { data: jobs, error } = await adminClient
      .from("qc_jobs")
      .select("id, status, result_json")
      .eq("organisation_id", organizationId)
      .in("status", ["completed", "failed"])
      .limit(100);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let needsReprocessing = 0;
    let hasFullResults = 0;
    let failed = 0;

    for (const job of jobs || []) {
      if (job.status === "failed") {
        failed++;
        needsReprocessing++;
      } else {
        const result = job.result_json;
        const hasMinimal = 
          !result ||
          result.basicQC?.audioMissing?.error?.includes("FFmpeg") ||
          result.basicQC?.loudness?.message?.includes("FFmpeg") ||
          result.basicQC?.loudness?.lufs === null ||
          !result.basicQC?.metadata?.duration;
        
        if (hasMinimal) {
          needsReprocessing++;
        } else {
          hasFullResults++;
        }
      }
    }

    return NextResponse.json({
      totalJobs: jobs?.length || 0,
      needsReprocessing,
      hasFullResults,
      failed,
      hint: needsReprocessing > 0 
        ? "POST to this endpoint with { all: true } to requeue jobs that need reprocessing"
        : "All jobs have full results",
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
