/**
 * File Upload API
 * 
 * POST - Create delivery record and get signed upload URL
 * PATCH - Update delivery after upload
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

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const adminClient = getAdminClient();
    
    if (!adminClient) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await adminClient
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 });
    }

    const body = await request.json();
    const { fileName, fileSize, fileType, projectId } = body;

    if (!fileName) {
      return NextResponse.json({ error: "fileName required" }, { status: 400 });
    }

    // Get first project if none specified
    let targetProjectId = projectId;
    if (!targetProjectId) {
      const { data: projects } = await adminClient
        .from("projects")
        .select("id")
        .eq("organization_id", profile.organization_id)
        .limit(1);

      if (!projects || projects.length === 0) {
        return NextResponse.json({ error: "No project found. Create a project first." }, { status: 400 });
      }
      targetProjectId = projects[0].id;
    }

    // Create storage path
    const timestamp = Date.now();
    const storagePath = `${profile.organization_id}/${targetProjectId}/${timestamp}-${fileName}`;

    // Create delivery record
    const { data: delivery, error: deliveryError } = await adminClient
      .from("deliveries")
      .insert({
        organization_id: profile.organization_id,
        project_id: targetProjectId,
        vendor_id: user.id,
        file_name: fileName,
        original_file_name: fileName,
        status: "processing",
        storage_path: storagePath,
        file_size: fileSize || 0,
        file_type: fileType?.startsWith("video/") ? "video" : "audio",
      })
      .select()
      .single();

    if (deliveryError) {
      throw new Error(deliveryError.message);
    }

    // Create signed upload URL
    const { data: uploadData, error: uploadError } = await adminClient.storage
      .from("deliveries")
      .createSignedUploadUrl(storagePath);

    if (uploadError) {
      // Rollback delivery creation
      await adminClient.from("deliveries").delete().eq("id", delivery.id);
      throw new Error(uploadError.message);
    }

    return NextResponse.json({
      delivery,
      uploadUrl: uploadData.signedUrl,
      storagePath,
      projectId: targetProjectId,
    });
  } catch (error: any) {
    console.error("Upload API error:", error);
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

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { deliveryId, status, qc_report, qc_errors } = body;

    if (!deliveryId) {
      return NextResponse.json({ error: "deliveryId required" }, { status: 400 });
    }

    const updates: any = {};
    if (status) updates.status = status;
    if (qc_report) updates.qc_report = qc_report;
    if (qc_errors) updates.qc_errors = qc_errors;

    const { data, error } = await adminClient
      .from("deliveries")
      .update(updates)
      .eq("id", deliveryId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ delivery: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
