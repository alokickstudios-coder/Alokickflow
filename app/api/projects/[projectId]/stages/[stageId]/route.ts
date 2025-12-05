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

    const { data, error } = await supabase
      .from("project_stages")
      .select("*")
      .eq("id", params.stageId)
      .eq("project_id", params.projectId)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Stage not found" }, { status: 404 });
    }

    return NextResponse.json({ stage: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { projectId: string; stageId: string } }
) {
  try {
    const supabase: SupabaseClient | null = getAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const body = await request.json();
    const { status, assigned_to, notes } = body;

    const updates: Record<string, any> = {};

    if (status !== undefined) {
      const allowedStatus = ["pending", "in_progress", "completed"];
      if (!allowedStatus.includes(status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      updates.status = status;
      if (status === "completed") {
        updates.completed_at = new Date().toISOString();
      } else {
        updates.completed_at = null;
      }
    }

    if (assigned_to !== undefined) {
      updates.assigned_to = assigned_to || null;
    }

    if (notes !== undefined) {
      updates.notes = notes;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No updates provided" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("project_stages")
      .update(updates)
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

export async function DELETE(
  request: NextRequest,
  { params }: { params: { projectId: string; stageId: string } }
) {
  try {
    const supabase: SupabaseClient | null = getAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const { error } = await supabase
      .from("project_stages")
      .delete()
      .eq("id", params.stageId)
      .eq("project_id", params.projectId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

