import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getAdminClient() {
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// GET - List deliveries
export async function GET(request: NextRequest) {
  try {
    const supabase = getAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get("organizationId");
    const projectId = searchParams.get("projectId");
    const status = searchParams.get("status");

    let query = supabase.from("deliveries").select("*");

    if (organizationId) {
      query = query.eq("organization_id", organizationId);
    }
    if (projectId) {
      query = query.eq("project_id", projectId);
    }
    if (status) {
      query = query.eq("status", status);
    }

    const { data: deliveries, error } = await query.order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ deliveries: deliveries || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST - Create a new delivery
export async function POST(request: NextRequest) {
  try {
    const supabase = getAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const body = await request.json();
    const {
      organizationId,
      projectId,
      assignmentId,
      fileName,
      fileSize,
      mimeType,
      storagePath,
      uploadedBy,
    } = body;

    if (!organizationId || !fileName || !projectId) {
      return NextResponse.json(
        { error: "organizationId, projectId, and fileName are required" },
        { status: 400 }
      );
    }

    // Build insert data with all required fields
    const insertData: Record<string, any> = {
      organization_id: organizationId,
      project_id: projectId,
      file_name: fileName,
      original_file_name: fileName, // Required column
      storage_path: storagePath || `uploads/${organizationId}/${Date.now()}_${fileName}`,
      status: 'uploading',
      file_size: fileSize || 0,
    };

    const { data: delivery, error } = await supabase
      .from("deliveries")
      .insert(insertData)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, delivery });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH - Update delivery status
export async function PATCH(request: NextRequest) {
  try {
    const supabase = getAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const body = await request.json();
    const { id, status, qcReport, ...otherUpdates } = body;

    if (!id) {
      return NextResponse.json({ error: "Delivery ID is required" }, { status: 400 });
    }

    const updateData: Record<string, any> = { ...otherUpdates };
    if (status) updateData.status = status;
    if (qcReport) updateData.qc_report = qcReport;

    const { data, error } = await supabase
      .from("deliveries")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, delivery: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE - Delete a delivery
export async function DELETE(request: NextRequest) {
  try {
    const supabase = getAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const deliveryId = searchParams.get("id");

    if (!deliveryId) {
      return NextResponse.json({ error: "Delivery ID is required" }, { status: 400 });
    }

    const { error } = await supabase
      .from("deliveries")
      .delete()
      .eq("id", deliveryId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

