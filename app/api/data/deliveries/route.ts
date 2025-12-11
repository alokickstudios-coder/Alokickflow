/**
 * Deliveries Data API
 * 
 * GET - List all deliveries and QC jobs merged
 * POST - Create delivery
 * PATCH - Update delivery
 * DELETE - Delete delivery
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

    // Fetch deliveries and QC jobs in parallel
    const [deliveriesRes, qcJobsRes] = await Promise.all([
      adminClient
        .from("deliveries")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(200),
      adminClient
        .from("qc_jobs")
        .select("*")
        .eq("organisation_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

    const deliveries = deliveriesRes.data || [];
    const qcJobs = qcJobsRes.data || [];

    // Merge results
    const allResults = new Map<string, any>();

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
                  job.status === "running" ? Math.min(95, job.progress || 50) :
                  job.status === "queued" ? 10 : 0,
        score: job.result?.summary?.score,
        project_id: job.project_id || existing.project_id,
      });
    });

    const resultArray = Array.from(allResults.values());

    // Fetch project details
    const projectIds = [...new Set(resultArray.map((r: any) => r.project_id).filter(Boolean))];
    if (projectIds.length > 0) {
      const { data: projects } = await adminClient
        .from("projects")
        .select("id, code, name")
        .in("id", projectIds);

      resultArray.forEach((result: any) => {
        if (result.project_id) {
          result.project = projects?.find((p: any) => p.id === result.project_id);
        }
      });
    }

    return NextResponse.json({ results: resultArray, organizationId });
  } catch (error: any) {
    console.error("Deliveries API error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
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

    const body = await request.json();

    const { data: delivery, error } = await adminClient
      .from("deliveries")
      .insert({
        organization_id: session.organizationId,
        ...body,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ delivery });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
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

    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: "Delivery ID required" }, { status: 400 });
    }

    const { data, error } = await adminClient
      .from("deliveries")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ delivery: data });
  } catch (error: any) {
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
      return NextResponse.json({ error: "Delivery ID required" }, { status: 400 });
    }

    await adminClient.from("deliveries").delete().eq("id", id);
    await adminClient.from("qc_jobs").delete().eq("delivery_id", id);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
