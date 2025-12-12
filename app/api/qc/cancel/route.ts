/**
 * POST /api/qc/cancel
 * 
 * Cancel/Pause one or more QC jobs
 * Works with jobs in any cancellable state (queued, pending, running)
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedSession, getAdminClient } from "@/lib/api/auth-helpers";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    // Use centralized auth
    const session = await getAuthenticatedSession();
    if (!session.success) {
      return NextResponse.json({ error: session.error || "Unauthorized" }, { status: 401 });
    }

    const { organizationId } = session.data!;

    const body = await request.json();
    const { jobIds, all } = body;

    // Allow cancelling all jobs if "all" is true
    if (!all && (!jobIds || !Array.isArray(jobIds) || jobIds.length === 0)) {
      return NextResponse.json(
        { error: "jobIds array is required (or pass all: true to cancel all)" },
        { status: 400 }
      );
    }

    const adminClient = getAdminClient();
    if (!adminClient) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    // Build query for cancellable jobs
    let query = adminClient
      .from("qc_jobs")
      .select("id, status, file_name")
      .eq("organisation_id", organizationId)
      .in("status", ["queued", "pending", "running"]);

    // Filter by specific job IDs if provided
    if (!all && jobIds && jobIds.length > 0) {
      query = query.in("id", jobIds);
    }

    const { data: jobs, error: selectError } = await query;

    if (selectError) {
      console.error("[CancelQC] Error selecting jobs:", selectError);
      return NextResponse.json({ error: "Failed to query jobs" }, { status: 500 });
    }

    if (!jobs || jobs.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No cancellable jobs found",
        cancelled: 0,
      });
    }

    const cancellableJobIds = jobs.map((j) => j.id);

    // Mark jobs as cancelled with timestamp
    const { data: updatedJobs, error: updateError } = await adminClient
      .from("qc_jobs")
      .update({
        status: "cancelled",
        error_message: "Cancelled by user",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .in("id", cancellableJobIds)
      .select("id, status, file_name");

    if (updateError) {
      console.error("[CancelQC] Error cancelling jobs:", updateError);
      return NextResponse.json({ error: "Failed to cancel jobs" }, { status: 500 });
    }

    // Also update any linked deliveries
    const deliveryUpdates = jobs.filter(j => j.id).map(async (job) => {
      try {
        await adminClient
          .from("deliveries")
          .update({ status: "cancelled", updated_at: new Date().toISOString() })
          .eq("id", job.id);
      } catch (e) {
        // Ignore delivery update errors
      }
    });
    await Promise.allSettled(deliveryUpdates);

    console.log(`[CancelQC] Cancelled ${updatedJobs?.length || 0} job(s):`, cancellableJobIds);

    return NextResponse.json({
      success: true,
      message: `Cancelled ${updatedJobs?.length || 0} job(s)`,
      cancelled: updatedJobs?.length || 0,
      jobs: updatedJobs || [],
    });
  } catch (error: any) {
    console.error("[CancelQC] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to cancel jobs" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/qc/cancel
 * 
 * Get list of cancellable jobs
 */
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

    const { data: jobs, error } = await adminClient
      .from("qc_jobs")
      .select("id, status, file_name, created_at")
      .eq("organisation_id", session.data!.organizationId)
      .in("status", ["queued", "pending", "running"])
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      cancellableJobs: jobs || [],
      count: jobs?.length || 0,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
