/**
 * POST /api/qc/pause
 * 
 * Pause or resume QC jobs
 * Paused jobs stay in the queue but won't be processed until resumed
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedSession, getAdminClient } from "@/lib/api/auth-helpers";

export const dynamic = "force-dynamic";

/**
 * POST /api/qc/pause
 * 
 * Body: { jobIds: string[], action: "pause" | "resume" }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getAuthenticatedSession();
    if (!session.success) {
      return NextResponse.json({ error: session.error || "Unauthorized" }, { status: 401 });
    }

    const { organizationId } = session.data!;
    const body = await request.json();
    const { jobIds, action = "pause" } = body;

    if (!jobIds || !Array.isArray(jobIds) || jobIds.length === 0) {
      return NextResponse.json({ error: "jobIds array is required" }, { status: 400 });
    }

    if (action !== "pause" && action !== "resume") {
      return NextResponse.json({ error: "action must be 'pause' or 'resume'" }, { status: 400 });
    }

    const adminClient = getAdminClient();
    if (!adminClient) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    if (action === "pause") {
      // Pause: Change status to "paused" for queued/running jobs
      const { data: jobs, error: selectError } = await adminClient
        .from("qc_jobs")
        .select("id, status")
        .in("id", jobIds)
        .eq("organisation_id", organizationId)
        .in("status", ["queued", "pending", "running"]);

      if (selectError) {
        return NextResponse.json({ error: selectError.message }, { status: 500 });
      }

      if (!jobs || jobs.length === 0) {
        return NextResponse.json({ success: true, message: "No pausable jobs found", affected: 0 });
      }

      const { data: updated, error: updateError } = await adminClient
        .from("qc_jobs")
        .update({
          status: "paused",
          updated_at: new Date().toISOString(),
        })
        .in("id", jobs.map(j => j.id))
        .select("id, status, file_name");

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      console.log(`[PauseQC] Paused ${updated?.length || 0} job(s)`);

      return NextResponse.json({
        success: true,
        action: "paused",
        affected: updated?.length || 0,
        jobs: updated || [],
      });

    } else {
      // Resume: Change status back to "queued" for paused jobs
      const { data: jobs, error: selectError } = await adminClient
        .from("qc_jobs")
        .select("id, status")
        .in("id", jobIds)
        .eq("organisation_id", organizationId)
        .eq("status", "paused");

      if (selectError) {
        return NextResponse.json({ error: selectError.message }, { status: 500 });
      }

      if (!jobs || jobs.length === 0) {
        return NextResponse.json({ success: true, message: "No paused jobs found", affected: 0 });
      }

      const { data: updated, error: updateError } = await adminClient
        .from("qc_jobs")
        .update({
          status: "queued",
          updated_at: new Date().toISOString(),
        })
        .in("id", jobs.map(j => j.id))
        .select("id, status, file_name");

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      console.log(`[PauseQC] Resumed ${updated?.length || 0} job(s)`);

      // Trigger worker to process resumed jobs DIRECTLY (no HTTP)
      try {
        const { processBatch } = await import("@/lib/services/qc/worker");
        processBatch(5).then(result => {
          console.log(`[PauseQC] Worker processed ${result.processed} job(s) after resume`);
        }).catch((err) => {
          console.warn("[PauseQC] Worker error after resume:", err.message);
        });
      } catch (triggerError: any) {
        console.warn("[PauseQC] Failed to trigger worker:", triggerError.message);
      }

      return NextResponse.json({
        success: true,
        action: "resumed",
        affected: updated?.length || 0,
        jobs: updated || [],
      });
    }
  } catch (error: any) {
    console.error("[PauseQC] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * GET /api/qc/pause
 * 
 * Get list of paused jobs
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
      .select("id, status, file_name, created_at, updated_at")
      .eq("organisation_id", session.data!.organizationId)
      .eq("status", "paused")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      pausedJobs: jobs || [],
      count: jobs?.length || 0,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
