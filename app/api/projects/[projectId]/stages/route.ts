import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getAdminClient(): SupabaseClient | null {
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const supabase: SupabaseClient | null = getAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const { data, error } = await supabase
      .from("project_stages")
      .select("*")
      .eq("project_id", params.projectId)
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ stages: data || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const supabase: SupabaseClient | null = getAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const body = await request.json();
    const { stage, status, assigned_to } = body;

    if (!stage) {
      return NextResponse.json({ error: "stage is required" }, { status: 400 });
    }

    // Get project to get organization_id
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("organization_id")
      .eq("id", params.projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const { data, error } = await supabase
      .from("project_stages")
      .upsert(
        {
          project_id: params.projectId,
          organization_id: project.organization_id,
          stage,
          status: status || "pending",
          assigned_to: assigned_to || null,
        },
        { onConflict: "project_id,stage" }
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, stage: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

