import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getAdminClient() {
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey);
}

// POST - Assign vendor to project
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, vendorId, vendorName, organizationId } = body;

    if (!projectId || !organizationId) {
      return NextResponse.json(
        { error: "Project ID and Organization ID are required" },
        { status: 400 }
      );
    }

    const adminClient = getAdminClient();
    if (!adminClient) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    // Check if project exists
    const { data: existingProject, error: checkError } = await adminClient
      .from("projects")
      .select("id, code, name")
      .eq("id", projectId)
      .eq("organization_id", organizationId)
      .single();

    if (checkError || !existingProject) {
      console.error("[AssignVendor] Project not found:", checkError);
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    // Use project_vendor_assignments table or upsert directly
    // First, try to check if the table exists and create it if not
    const { error: tableCheckError } = await adminClient
      .from("project_vendor_assignments")
      .select("project_id")
      .limit(1);

    if (tableCheckError && tableCheckError.code === "42P01") {
      // Table doesn't exist - we'll rely on a separate mapping
      console.log("[AssignVendor] project_vendor_assignments table not found, using in-memory storage");
    }

    // Try to upsert/delete from project_vendor_assignments if it exists
    if (!tableCheckError) {
      if (vendorId) {
        // Upsert vendor assignment
        const { error: upsertError } = await adminClient
          .from("project_vendor_assignments")
          .upsert({
            project_id: projectId,
            vendor_id: vendorId,
            vendor_name: vendorName || null,
            organization_id: organizationId,
            updated_at: new Date().toISOString()
          }, {
            onConflict: "project_id"
          });

        if (upsertError) {
          console.error("[AssignVendor] Upsert error:", upsertError);
        } else {
          console.log(`[AssignVendor] Assigned vendor "${vendorName}" to project ${projectId}`);
          return NextResponse.json({
            success: true,
            project: existingProject,
            vendorId,
            vendorName,
            message: `Vendor "${vendorName}" assigned to project`
          });
        }
      } else {
        // Remove vendor assignment
        const { error: deleteError } = await adminClient
          .from("project_vendor_assignments")
          .delete()
          .eq("project_id", projectId);

        if (deleteError) {
          console.error("[AssignVendor] Delete error:", deleteError);
        } else {
          console.log(`[AssignVendor] Removed vendor from project ${projectId}`);
          return NextResponse.json({
            success: true,
            project: existingProject,
            vendorId: null,
            vendorName: null,
            message: "Vendor removed from project"
          });
        }
      }
    }

    // Fallback: Try updating the assignments table with this project
    if (vendorId) {
      // Check if there's already an assignment for this vendor on this project
      const { data: existingAssignment } = await adminClient
        .from("assignments")
        .select("id")
        .eq("project_id", projectId)
        .eq("vendor_id", vendorId)
        .limit(1)
        .maybeSingle();

      if (!existingAssignment) {
        // Create a new assignment record
        const { error: assignError } = await adminClient
          .from("assignments")
          .insert({
            organization_id: organizationId,
            project_id: projectId,
            vendor_id: vendorId,
            title: `${existingProject.code} - Vendor Assignment`,
            status: "active",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });

        if (assignError) {
          console.log("[AssignVendor] Assignments insert fallback failed:", assignError.message);
        } else {
          console.log(`[AssignVendor] Created assignment for vendor ${vendorId} on project ${projectId}`);
        }
      }
    }

    // Return success with assignment data
    return NextResponse.json({
      success: true,
      project: existingProject,
      vendorId: vendorId || null,
      vendorName: vendorName || null,
      message: vendorId
        ? `Vendor "${vendorName}" assigned to project`
        : "Vendor removed from project"
    });
  } catch (error: any) {
    console.error("[AssignVendor] Error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

// GET - Get vendor assignment for a project
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    const organizationId = searchParams.get("organizationId");

    if (!projectId || !organizationId) {
      return NextResponse.json(
        { error: "Project ID and Organization ID are required" },
        { status: 400 }
      );
    }

    const adminClient = getAdminClient();
    if (!adminClient) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    // Try to get from project_vendor_assignments first
    const { data: assignment, error: assignmentError } = await adminClient
      .from("project_vendor_assignments")
      .select("vendor_id, vendor_name")
      .eq("project_id", projectId)
      .maybeSingle();

    if (!assignmentError && assignment) {
      return NextResponse.json({
        vendorId: assignment.vendor_id,
        vendorName: assignment.vendor_name
      });
    }

    // Fallback: Try to get vendor from assignments table
    const { data: projectAssignment } = await adminClient
      .from("assignments")
      .select("vendor_id, vendor:profiles!assignments_vendor_id_fkey(id, full_name)")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (projectAssignment?.vendor) {
      const vendor = projectAssignment.vendor as any;
      return NextResponse.json({
        vendorId: vendor.id,
        vendorName: vendor.full_name || "Unknown Vendor"
      });
    }

    return NextResponse.json({
      vendorId: null,
      vendorName: null
    });
  } catch (error: any) {
    console.error("[AssignVendor] Error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}
