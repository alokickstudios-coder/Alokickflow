/**
 * Projects Data API
 * 
 * GET - List all projects with stats
 * POST - Create a new project
 * PATCH - Update project
 * DELETE - Delete project
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
    .select("organization_id, role")
    .eq("id", user.id)
    .single();

  if (!profile?.organization_id) return null;

  return { user, profile, organizationId: profile.organization_id };
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

    // Fetch projects
    const { data: projects, error } = await adminClient
      .from("projects")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    // Fetch QC jobs for stats
    const { data: qcJobs } = await adminClient
      .from("qc_jobs")
      .select("project_id, status, result")
      .eq("organisation_id", organizationId);

    // Calculate stats per project
    const projectStats: Record<string, { total: number; passed: number; failed: number; processing: number; scores: number[] }> = {};
    (qcJobs || []).forEach((job: any) => {
      if (!job.project_id) return;
      if (!projectStats[job.project_id]) {
        projectStats[job.project_id] = { total: 0, passed: 0, failed: 0, processing: 0, scores: [] };
      }
      projectStats[job.project_id].total++;
      if (job.status === "completed" && job.result?.status === "passed") {
        projectStats[job.project_id].passed++;
      } else if (job.status === "failed" || (job.status === "completed" && job.result?.status === "failed")) {
        projectStats[job.project_id].failed++;
      } else if (["queued", "running", "processing"].includes(job.status)) {
        projectStats[job.project_id].processing++;
      }
      if (job.result?.summary?.score) {
        projectStats[job.project_id].scores.push(job.result.summary.score);
      }
    });

    // Enrich projects
    const enrichedProjects = (projects || []).map((project: any) => {
      const stats = projectStats[project.id] || { total: 0, passed: 0, failed: 0, processing: 0, scores: [] };
      return {
        ...project,
        fileCount: stats.total,
        passedCount: stats.passed,
        failedCount: stats.failed,
        processingCount: stats.processing,
        avgScore: stats.scores.length > 0 
          ? Math.round(stats.scores.reduce((a, b) => a + b, 0) / stats.scores.length) 
          : undefined,
      };
    });

    // Fetch project stages
    const { data: stages } = await adminClient
      .from("project_stages")
      .select("*")
      .eq("organization_id", organizationId);

    const groupedStages: Record<string, any[]> = {};
    (stages || []).forEach((stage: any) => {
      if (!groupedStages[stage.project_id]) groupedStages[stage.project_id] = [];
      groupedStages[stage.project_id].push(stage);
    });

    // Fetch team members
    const { data: teamMembers } = await adminClient
      .from("profiles")
      .select("id, full_name, role")
      .eq("organization_id", organizationId)
      .neq("role", "vendor");

    // Fetch organization subscription tier
    const { data: org } = await adminClient
      .from("organizations")
      .select("subscription_tier")
      .eq("id", organizationId)
      .single();

    return NextResponse.json({
      projects: enrichedProjects,
      stages: groupedStages,
      teamMembers: teamMembers || [],
      subscriptionTier: org?.subscription_tier || "free",
      organizationId,
    });
  } catch (error: any) {
    console.error("Projects API error:", error);
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
    const { code, name, vendorId } = body;

    if (!code || !name) {
      return NextResponse.json({ error: "Code and name are required" }, { status: 400 });
    }

    const { data: newProject, error } = await adminClient
      .from("projects")
      .insert({
        organization_id: session.organizationId,
        code: code.toUpperCase().trim(),
        name: name.trim(),
        naming_convention_regex: "^([A-Z0-9_]+)[-_]?EP[_-]?(\\d{1,4})[_-]?([A-Za-z]+)[_-]?(.+)$",
      })
      .select()
      .single();

    if (error) throw error;

    // Assign vendor if provided
    if (vendorId && vendorId !== "none" && newProject) {
      const { data: vendor } = await adminClient
        .from("profiles")
        .select("full_name, company_name")
        .eq("id", vendorId)
        .single();

      await adminClient
        .from("project_vendor_assignments")
        .upsert({
          project_id: newProject.id,
          vendor_id: vendorId,
          vendor_name: vendor?.full_name || vendor?.company_name || null,
          organization_id: session.organizationId,
        });
    }

    return NextResponse.json({ project: newProject });
  } catch (error: any) {
    console.error("Create project error:", error);
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
    const { id, status } = body;

    if (!id) {
      return NextResponse.json({ error: "Project ID required" }, { status: 400 });
    }

    const { data, error } = await adminClient
      .from("projects")
      .update({ status })
      .eq("id", id)
      .eq("organization_id", session.organizationId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ project: data });
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
      return NextResponse.json({ error: "Project ID required" }, { status: 400 });
    }

    // Delete related records
    await adminClient.from("qc_jobs").delete().eq("project_id", id);
    await adminClient.from("project_stages").delete().eq("project_id", id);
    await adminClient.from("project_vendor_assignments").delete().eq("project_id", id);
    
    // Delete project
    const { error } = await adminClient
      .from("projects")
      .delete()
      .eq("id", id)
      .eq("organization_id", session.organizationId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
