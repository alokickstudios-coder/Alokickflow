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
  { params }: { params: { projectId: string; stageId: string } }
) {
  try {
    const supabase: SupabaseClient | null = getAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    // Get stage to verify it exists and get assignment info
    const { data: stage, error: stageError } = await supabase
      .from("project_stages")
      .select("assigned_to, assigned_to_profile:profiles!project_stages_assigned_to_fkey(id, full_name, email)")
      .eq("id", params.stageId)
      .eq("project_id", params.projectId)
      .single();

    if (stageError || !stage) {
      return NextResponse.json({ error: "Stage not found" }, { status: 404 });
    }

    return NextResponse.json({
      assigned_to: stage.assigned_to,
      assigned_profile: stage.assigned_to_profile,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { projectId: string; stageId: string } }
) {
  try {
    const supabase: SupabaseClient | null = getAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const body = await request.json();
    const { assigned_to } = body;

    // Verify stage exists
    const { data: existingStage, error: checkError } = await supabase
      .from("project_stages")
      .select("id")
      .eq("id", params.stageId)
      .eq("project_id", params.projectId)
      .single();

    if (checkError || !existingStage) {
      return NextResponse.json({ error: "Stage not found" }, { status: 404 });
    }

    // If assigned_to is provided, verify the user exists
    if (assigned_to) {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", assigned_to)
        .single();

      if (profileError || !profile) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }
    }

    const { data, error } = await supabase
      .from("project_stages")
      .update({ assigned_to: assigned_to || null })
      .eq("id", params.stageId)
      .eq("project_id", params.projectId)
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

