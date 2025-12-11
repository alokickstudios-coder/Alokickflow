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

    // Enrich with progress info
    const enrichedJobs = (jobs || []).map((job: any) => ({
      ...job,
      progress: job.status === "completed" || job.status === "failed" ? 100 :
                job.status === "running" ? Math.min(95, job.progress || 50) :
                job.status === "queued" ? 10 : 0,
      result: job.result_json, // Alias for compatibility
    }));

    // If there are queued jobs, trigger processing (non-blocking)
    const queuedCount = enrichedJobs.filter((j: any) => j.status === "queued" || j.status === "pending").length;
    if (queuedCount > 0) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
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

    const adminClient = getAdminClient();
    if (!adminClient) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Job ID required" }, { status: 400 });
    }

    // Get job to find delivery_id
    const { data: job } = await adminClient
      .from("qc_jobs")
      .select("delivery_id")
      .eq("id", id)
      .single();

    // Delete job
    await adminClient.from("qc_jobs").delete().eq("id", id);

    // Delete associated delivery if exists
    if (job?.delivery_id) {
      await adminClient.from("deliveries").delete().eq("id", job.delivery_id);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
