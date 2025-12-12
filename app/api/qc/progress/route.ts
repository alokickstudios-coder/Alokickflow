/**
 * GET /api/qc/progress
 * 
 * Lightweight endpoint for real-time progress polling
 * Only returns job IDs and their progress - no heavy data
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedSession, getAdminClient } from "@/lib/api/auth-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthenticatedSession();
    if (!session.success) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { organizationId } = session.data!;
    const adminClient = getAdminClient();
    if (!adminClient) {
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }

    // Get job IDs from query param (optional - for specific jobs)
    const jobIdsParam = request.nextUrl.searchParams.get("jobIds");
    const jobIds = jobIdsParam ? jobIdsParam.split(",") : null;

    // Build query for active jobs
    let query = adminClient
      .from("qc_jobs")
      .select("id, status, progress, error_message, updated_at")
      .eq("organisation_id", organizationId)
      .order("updated_at", { ascending: false });

    if (jobIds && jobIds.length > 0) {
      // Only get specific jobs
      query = query.in("id", jobIds);
    } else {
      // Only get active jobs (queued, running, paused)
      query = query.in("status", ["queued", "pending", "running", "paused"]).limit(50);
    }

    const { data: jobs, error } = await query;

    if (error) {
      console.error("[Progress] Error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Return minimal data for fast polling
    const progress = (jobs || []).map(job => ({
      id: job.id,
      status: job.status,
      progress: job.progress || 0,
      error: job.error_message,
    }));

    // Also return counts for UI
    const counts = {
      queued: progress.filter(p => p.status === "queued" || p.status === "pending").length,
      running: progress.filter(p => p.status === "running").length,
      paused: progress.filter(p => p.status === "paused").length,
    };

    return NextResponse.json({
      success: true,
      progress,
      counts,
      timestamp: Date.now(),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/qc/progress
 * 
 * Get progress for specific job IDs (for bulk tracking)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getAuthenticatedSession();
    if (!session.success) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { organizationId } = session.data!;
    const body = await request.json();
    const { jobIds } = body;

    if (!jobIds || !Array.isArray(jobIds) || jobIds.length === 0) {
      return NextResponse.json({ error: "jobIds required" }, { status: 400 });
    }

    const adminClient = getAdminClient();
    if (!adminClient) {
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }

    const { data: jobs, error } = await adminClient
      .from("qc_jobs")
      .select("id, status, progress, error_message, file_name, result_json")
      .eq("organisation_id", organizationId)
      .in("id", jobIds);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const progress = (jobs || []).map(job => ({
      id: job.id,
      status: job.status,
      progress: job.progress || 0,
      error: job.error_message,
      fileName: job.file_name,
      hasResult: !!job.result_json,
    }));

    return NextResponse.json({
      success: true,
      progress,
      timestamp: Date.now(),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
