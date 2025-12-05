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

const DEFAULT_STAGES = ["translation", "dubbing", "mixing", "subtitling"] as const;
const ALLOWED_STATUS = ["pending", "in_progress", "completed"] as const;

type Stage = (typeof DEFAULT_STAGES)[number];
type StageStatus = (typeof ALLOWED_STATUS)[number];

async function ensureDefaultStages(
  supabase: SupabaseClient,
  organizationId: string
) {
  if (!supabase) return;
  
  // fetch projects
  const { data: projects } = await supabase
    .from("projects")
    .select("id")
    .eq("organization_id", organizationId);

  if (!projects) return;

  const projectIds = projects.map((p: any) => p.id);
  if (projectIds.length === 0) return;

  const { data: existing } = await supabase
    .from("project_stages")
    .select("project_id, stage")
    .in("project_id", projectIds);

  const existingMap = new Map<string, Set<Stage>>();
  (existing || []).forEach((row: any) => {
    if (!existingMap.has(row.project_id)) {
      existingMap.set(row.project_id, new Set());
    }
    existingMap.get(row.project_id)!.add(row.stage);
  });

  const inserts: any[] = [];
  for (const projectId of projectIds) {
    const set = existingMap.get(projectId) || new Set<Stage>();
    DEFAULT_STAGES.forEach((stage) => {
      if (!set.has(stage)) {
        inserts.push({
          organization_id: organizationId,
          project_id: projectId,
          stage,
          status: "pending",
        });
      }
    });
  }

  if (inserts.length > 0) {
    await supabase.from("project_stages").insert(inserts);
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase: SupabaseClient | null = getAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get("organizationId");
    const projectId = searchParams.get("projectId");

    if (!organizationId) {
      return NextResponse.json({ error: "organizationId is required" }, { status: 400 });
    }

    // Ensure defaults for all projects in org
    await ensureDefaultStages(supabase, organizationId);

    let query = supabase
      .from("project_stages")
      .select("*")
      .eq("organization_id", organizationId);

    if (projectId) {
      query = query.eq("project_id", projectId);
    }

    const { data, error } = await query.order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ stages: data || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase: SupabaseClient | null = getAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const body = await request.json();
    const { projectId, organizationId, stage } = body;

    if (!projectId || !organizationId || !stage) {
      return NextResponse.json(
        { error: "projectId, organizationId, and stage are required" },
        { status: 400 }
      );
    }

    if (!DEFAULT_STAGES.includes(stage)) {
      return NextResponse.json({ error: "Invalid stage" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("project_stages")
      .upsert(
        {
          project_id: projectId,
          organization_id: organizationId,
          stage,
          status: "pending",
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

export async function PATCH(request: NextRequest) {
  try {
    const supabase: SupabaseClient | null = getAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const body = await request.json();
    const { id, projectId, stage, status, assignedTo, notes } = body;

    if (!id && !(projectId && stage)) {
      return NextResponse.json(
        { error: "id or (projectId and stage) is required" },
        { status: 400 }
      );
    }

    const updates: Record<string, any> = {};

    if (status) {
      if (!ALLOWED_STATUS.includes(status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      updates.status = status;
      if (status === "completed") {
        updates.completed_at = new Date().toISOString();
      } else {
        updates.completed_at = null;
      }
    }

    if (assignedTo !== undefined) {
      updates.assigned_to = assignedTo || null;
    }

    if (notes !== undefined) {
      updates.notes = notes;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No updates provided" }, { status: 400 });
    }

    let query = supabase.from("project_stages").update(updates);

    if (id) {
      query = query.eq("id", id);
    } else {
      query = query.eq("project_id", projectId).eq("stage", stage);
    }

    const { data, error } = await query.select().single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, stage: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}


