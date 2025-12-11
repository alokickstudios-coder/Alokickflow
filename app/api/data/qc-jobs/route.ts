/**
 * QC Jobs Data API
 * 
 * GET - List all QC jobs with project info
 * DELETE - Delete a QC job
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function getSessionData(supabase: any, adminClient: any) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await adminClient
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  if (!profile?.organization_id) return null;

  return { user, organizationId: profile.organization_id };
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const adminClient = getAdminClient();
    if (!adminClient) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const session = await getSessionData(supabase, adminClient);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { organizationId } = session;

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
    }));

    return NextResponse.json({ jobs: enrichedJobs, organizationId });
  } catch (error: any) {
    console.error("QC Jobs API error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const adminClient = getAdminClient();
    if (!adminClient) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const session = await getSessionData(supabase, adminClient);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
