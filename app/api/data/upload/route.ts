/**
 * File Upload API
 * 
 * POST - Create delivery record and get signed upload URL
 * PATCH - Update delivery after upload
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedSession, getAdminClient } from "@/lib/api/auth-helpers";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthenticatedSession();
    
    if (!session.success) {
      return NextResponse.json({ error: session.error || "Unauthorized" }, { status: 401 });
    }

    const adminClient = getAdminClient();
    if (!adminClient) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const { user, organizationId } = session.data!;

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
        .eq("organization_id", organizationId)
        .limit(1);

      if (!projects || projects.length === 0) {
        // Auto-create a default project
        const { data: newProject } = await adminClient
          .from("projects")
          .insert({
            organization_id: organizationId,
            name: "Default Project",
            code: "DEFAULT",
            status: "active",
          })
          .select()
          .single();
        
        if (newProject) {
          targetProjectId = newProject.id;
        } else {
          return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
        }
      } else {
        targetProjectId = projects[0].id;
      }
    }

    // Create storage path
    const timestamp = Date.now();
    const storagePath = `${organizationId}/${targetProjectId}/${timestamp}-${fileName}`;

    // Create delivery record
    const { data: delivery, error: deliveryError } = await adminClient
      .from("deliveries")
      .insert({
        organization_id: organizationId,
        project_id: targetProjectId,
        vendor_id: user.id as string,
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
    const session = await getAuthenticatedSession();
    
    if (!session.success) {
      return NextResponse.json({ error: session.error || "Unauthorized" }, { status: 401 });
    }

    const adminClient = getAdminClient();
    if (!adminClient) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
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
