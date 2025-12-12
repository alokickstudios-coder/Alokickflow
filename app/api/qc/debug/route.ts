/**
 * GET /api/qc/debug
 * 
 * Debug endpoint for QC system - shows current state and can fix stuck jobs
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedSession, getAdminClient } from "@/lib/api/auth-helpers";
import { getPlatformConfig } from "@/lib/config/platform";

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

    // Get platform config
    const platform = getPlatformConfig();

    // Get all jobs grouped by status
    const { data: allJobs, error: jobsError } = await adminClient
      .from("qc_jobs")
      .select("id, status, progress, file_name, created_at, updated_at, started_at, completed_at, error_message")
      .eq("organisation_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (jobsError) {
      return NextResponse.json({ error: jobsError.message }, { status: 500 });
    }

    const jobs = allJobs || [];
    
    // Group by status
    const byStatus: Record<string, typeof jobs> = {};
    for (const job of jobs) {
      const status = job.status || "unknown";
      if (!byStatus[status]) byStatus[status] = [];
      byStatus[status].push(job);
    }

    // Find stuck jobs (running for > 2 minutes or queued for > 10 minutes)
    const now = Date.now();
    const stuckJobs = jobs.filter(job => {
      if (job.status === "running") {
        const startTime = job.started_at ? new Date(job.started_at).getTime() : new Date(job.created_at).getTime();
        return (now - startTime) > 2 * 60 * 1000; // 2 minutes
      }
      if (job.status === "queued" || job.status === "pending") {
        const createTime = new Date(job.created_at).getTime();
        return (now - createTime) > 10 * 60 * 1000; // 10 minutes
      }
      return false;
    });

    // Count by status
    const counts: Record<string, number> = {};
    for (const status of Object.keys(byStatus)) {
      counts[status] = byStatus[status].length;
    }

    return NextResponse.json({
      success: true,
      platform: {
        name: platform.platform.name,
        tier: platform.platform.tier,
        maxFileSizeMB: platform.limits.maxFileSizeMB,
        maxConcurrentJobs: platform.limits.maxConcurrentJobs,
      },
      jobs: {
        total: jobs.length,
        counts,
        stuckCount: stuckJobs.length,
        stuckJobs: stuckJobs.map(j => ({
          id: j.id,
          status: j.status,
          fileName: j.file_name,
          progress: j.progress,
          error: j.error_message,
          age: Math.floor((now - new Date(j.created_at).getTime()) / 1000 / 60) + " minutes",
        })),
      },
      recentActive: byStatus["running"]?.slice(0, 5).map(j => ({
        id: j.id,
        fileName: j.file_name,
        progress: j.progress,
        startedAt: j.started_at,
      })),
      recentQueued: byStatus["queued"]?.slice(0, 5).map(j => ({
        id: j.id,
        fileName: j.file_name,
        createdAt: j.created_at,
      })),
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/qc/debug
 * 
 * Fix stuck jobs
 * Body: { action: "retry_stuck" | "cancel_stuck" | "trigger_worker" }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getAuthenticatedSession();
    if (!session.success) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { organizationId } = session.data!;
    const body = await request.json();
    const { action, jobIds } = body;

    const adminClient = getAdminClient();
    if (!adminClient) {
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }

    if (action === "retry_stuck") {
      // Find stuck jobs and reset them
      const now = Date.now();
      const { data: stuckJobs } = await adminClient
        .from("qc_jobs")
        .select("id, status, created_at, started_at")
        .eq("organisation_id", organizationId)
        .in("status", ["running", "queued", "pending"]);

      const jobsToRetry = (stuckJobs || []).filter(job => {
        if (job.status === "running") {
          const startTime = job.started_at ? new Date(job.started_at).getTime() : new Date(job.created_at).getTime();
          return (now - startTime) > 10 * 60 * 1000;
        }
        if (job.status === "queued" || job.status === "pending") {
          return (now - new Date(job.created_at).getTime()) > 30 * 60 * 1000;
        }
        return false;
      });

      if (jobsToRetry.length === 0) {
        return NextResponse.json({ success: true, message: "No stuck jobs found", retried: 0 });
      }

      // Reset to queued
      const { data: updated, error } = await adminClient
        .from("qc_jobs")
        .update({
          status: "queued",
          progress: 0,
          error_message: null,
          started_at: null,
          updated_at: new Date().toISOString(),
        })
        .in("id", jobsToRetry.map(j => j.id))
        .select("id");

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // Trigger worker
      try {
        const { getAppBaseUrl } = await import("@/lib/config/platform");
        fetch(`${getAppBaseUrl()}/api/qc/process-queue`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-internal-trigger": "true" },
          body: JSON.stringify({ limit: 5 }),
        }).catch((fetchErr) => {
          console.warn("[QCDebug] Failed to trigger worker after retry_stuck:", fetchErr.message);
        });
      } catch (triggerError: any) {
        console.warn("[QCDebug] Failed to trigger worker:", triggerError.message);
      }

      return NextResponse.json({
        success: true,
        message: `Reset ${updated?.length || 0} stuck jobs to queued`,
        retried: updated?.length || 0,
        jobIds: updated?.map(j => j.id) || [],
      });
    }

    if (action === "cancel_stuck") {
      // Cancel all stuck jobs
      const now = Date.now();
      const { data: stuckJobs } = await adminClient
        .from("qc_jobs")
        .select("id, status, created_at, started_at")
        .eq("organisation_id", organizationId)
        .in("status", ["running", "queued", "pending"]);

      const jobsToCancel = (stuckJobs || []).filter(job => {
        if (job.status === "running") {
          const startTime = job.started_at ? new Date(job.started_at).getTime() : new Date(job.created_at).getTime();
          return (now - startTime) > 10 * 60 * 1000;
        }
        if (job.status === "queued" || job.status === "pending") {
          return (now - new Date(job.created_at).getTime()) > 30 * 60 * 1000;
        }
        return false;
      });

      if (jobsToCancel.length === 0) {
        return NextResponse.json({ success: true, message: "No stuck jobs found", cancelled: 0 });
      }

      const { data: updated, error } = await adminClient
        .from("qc_jobs")
        .update({
          status: "failed",
          error_message: "Cancelled - job was stuck",
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .in("id", jobsToCancel.map(j => j.id))
        .select("id");

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: `Cancelled ${updated?.length || 0} stuck jobs`,
        cancelled: updated?.length || 0,
      });
    }

    if (action === "trigger_worker") {
      // Just trigger the worker
      try {
        const { getAppBaseUrl } = await import("@/lib/config/platform");
        const baseUrl = getAppBaseUrl();
        
        const response = await fetch(`${baseUrl}/api/qc/process-queue`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-internal-trigger": "true" },
          body: JSON.stringify({ limit: 5 }),
        });

        const result = await response.json();
        
        return NextResponse.json({
          success: true,
          message: "Worker triggered",
          workerResponse: result,
          baseUrl,
        });
      } catch (e: any) {
        return NextResponse.json({
          success: false,
          message: "Failed to trigger worker",
          error: e.message,
        });
      }
    }

    if (action === "retry_specific" && jobIds && jobIds.length > 0) {
      // Retry specific jobs
      const { data: updated, error } = await adminClient
        .from("qc_jobs")
        .update({
          status: "queued",
          progress: 0,
          error_message: null,
          started_at: null,
          updated_at: new Date().toISOString(),
        })
        .in("id", jobIds)
        .eq("organisation_id", organizationId)
        .select("id");

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // Trigger worker
      try {
        const { getAppBaseUrl } = await import("@/lib/config/platform");
        fetch(`${getAppBaseUrl()}/api/qc/process-queue`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ limit: 5 }),
        }).catch((fetchErr) => {
          console.warn("[QCDebug] Failed to trigger worker after retry_specific:", fetchErr.message);
        });
      } catch (triggerError: any) {
        console.warn("[QCDebug] Failed to trigger worker for retry:", triggerError.message);
      }

      return NextResponse.json({
        success: true,
        message: `Retried ${updated?.length || 0} jobs`,
        retried: updated?.length || 0,
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
