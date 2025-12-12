/**
 * QC Jobs Data API
 * 
 * GET - List all QC jobs with project info
 * DELETE - Delete a QC job
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedSession, getAdminClient } from "@/lib/api/auth-helpers";

export const dynamic = "force-dynamic";

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

    // Fetch QC jobs with project info
    const { data: jobs, error } = await adminClient
      .from("qc_jobs")
      .select(`
        *,
        project:projects(id, code, name)
      `)
      .eq("organisation_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) throw error;

    // Enrich with progress info - use ACTUAL progress from database
    const enrichedJobs = (jobs || []).map((job: any) => ({
      ...job,
      // Use real progress value from DB, only set defaults for undefined
      progress: job.progress !== undefined && job.progress !== null 
        ? job.progress 
        : (job.status === "completed" || job.status === "failed" ? 100 :
           job.status === "queued" || job.status === "pending" ? 0 : 
           job.status === "running" ? 5 : 0),
      result: job.result_json, // Alias for compatibility
    }));

    // If there are queued jobs, trigger processing (non-blocking)
    const queuedCount = enrichedJobs.filter((j: any) => j.status === "queued" || j.status === "pending").length;
    if (queuedCount > 0) {
      const { getAppBaseUrl } = await import("@/lib/config/platform");
      const baseUrl = getAppBaseUrl();
      fetch(`${baseUrl}/api/qc/process-queue`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-internal-trigger": "true" },
        body: JSON.stringify({ limit: 3 }),
      }).catch(() => {}); // Fire and forget
    }

    return NextResponse.json({ jobs: enrichedJobs, organizationId });
  } catch (error: any) {
    console.error("QC Jobs API error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getAuthenticatedSession();
    if (!session.success) {
      return NextResponse.json({ error: session.error || "Unauthorized" }, { status: 401 });
    }

    const { organizationId } = session.data!;
    const adminClient = getAdminClient();
    if (!adminClient) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const ids = searchParams.get("ids"); // Support multiple IDs

    const jobIds = ids ? ids.split(",") : id ? [id] : [];

    if (jobIds.length === 0) {
      return NextResponse.json({ error: "Job ID(s) required" }, { status: 400 });
    }

    console.log(`[QC-Jobs] Deleting ${jobIds.length} job(s):`, jobIds);

    let deleted = 0;
    for (const jobId of jobIds) {
      // Get job to verify ownership and find delivery_id
      const { data: job, error: jobError } = await adminClient
        .from("qc_jobs")
        .select("id, delivery_id, organisation_id, status")
        .eq("id", jobId)
        .single();

      if (jobError || !job) {
        console.warn(`[QC-Jobs] Job ${jobId} not found`);
        continue;
      }

      // Verify ownership
      if (job.organisation_id !== organizationId) {
        console.warn(`[QC-Jobs] Job ${jobId} belongs to different org`);
        continue;
      }

      // If job is running, cancel it first
      if (job.status === "running" || job.status === "queued" || job.status === "pending") {
        await adminClient
          .from("qc_jobs")
          .update({ 
            status: "cancelled", 
            error_message: "Deleted by user",
            completed_at: new Date().toISOString() 
          })
          .eq("id", jobId);
      }

      // Delete job
      const { error: deleteError } = await adminClient
        .from("qc_jobs")
        .delete()
        .eq("id", jobId);

      if (deleteError) {
        console.error(`[QC-Jobs] Delete error for ${jobId}:`, deleteError);
        continue;
      }

      // Delete associated delivery if exists
      if (job.delivery_id) {
        try {
          await adminClient
            .from("deliveries")
            .delete()
            .eq("id", job.delivery_id);
        } catch {
          // Ignore delivery delete errors
        }
      }

      deleted++;
    }

    console.log(`[QC-Jobs] Successfully deleted ${deleted}/${jobIds.length} job(s)`);

    return NextResponse.json({ 
      success: true, 
      deleted, 
      requested: jobIds.length 
    });
  } catch (error: any) {
    console.error("[QC-Jobs DELETE] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
