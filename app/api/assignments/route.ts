import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return null;
  }
  
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// Check if vendor exists in either vendors table or profiles table
async function findVendor(supabase: any, vendorId: string) {
  // Try vendors table first (new table)
  const { data: vendor, error: vendorError } = await supabase
    .from("vendors")
    .select("id, full_name")
    .eq("id", vendorId)
    .single();

  if (!vendorError && vendor) {
    return { vendor, source: 'vendors' };
  }

  // Fallback to profiles table (old approach)
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("id", vendorId)
    .eq("role", "vendor")
    .single();

  if (!profileError && profile) {
    return { vendor: profile, source: 'profiles' };
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const supabaseAdmin = getAdminClient();
    
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    const body = await request.json();
    const {
      vendorId,
      organizationId,
      assignedBy,
      driveLink,
      displayName,
      projectId,
      description,
      clientName,
      clientEmail,
      dueDate,
    } = body;

    // Validate required fields
    if (!vendorId || !organizationId || !driveLink || !displayName) {
      return NextResponse.json(
        { error: "Missing required fields: vendorId, organizationId, driveLink, displayName" },
        { status: 400 }
      );
    }

    // Verify the vendor exists (in either vendors or profiles table)
    const vendorResult = await findVendor(supabaseAdmin, vendorId);

    if (!vendorResult) {
      return NextResponse.json(
        { 
          error: "Vendor not found",
          details: "The selected vendor does not exist. Please refresh and try again."
        },
        { status: 400 }
      );
    }

    console.log(`Found vendor in ${vendorResult.source} table:`, vendorResult.vendor);

    // Build the insert data
    const insertData: Record<string, any> = {
      organization_id: organizationId,
      vendor_id: vendorId,
      original_drive_link: driveLink,
      display_name: displayName,
      status: "pending",
    };

    // Add optional fields
    if (assignedBy) insertData.assigned_by = assignedBy;
    if (projectId && projectId !== "none") insertData.project_id = projectId;
    if (description) insertData.description = description;
    if (clientName) insertData.client_name = clientName;
    if (clientEmail) insertData.client_email = clientEmail;
    if (dueDate) insertData.due_date = dueDate;

    // Create the assignment
    const { data: assignment, error: insertError } = await supabaseAdmin
      .from("drive_assignments")
      .insert(insertData)
      .select()
      .single();

    if (insertError) {
      console.error("Assignment insert error:", insertError);
      
      if (insertError.message.includes("foreign key")) {
        return NextResponse.json(
          { error: "Database constraint error. The vendor ID format may be incompatible." },
          { status: 400 }
        );
      }
      
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      );
    }

    // Fetch the vendor details to return
    const vendorInfo = vendorResult.vendor;

    return NextResponse.json({
      success: true,
      assignment: {
        ...assignment,
        vendor: vendorInfo
      },
    });
  } catch (error: any) {
    console.error("Assignment creation error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create assignment" },
      { status: 500 }
    );
  }
}

// GET: Fetch all assignments for an organization
export async function GET(request: NextRequest) {
  try {
    const supabaseAdmin = getAdminClient();
    
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get("organizationId");

    if (!organizationId) {
      return NextResponse.json(
        { error: "organizationId is required" },
        { status: 400 }
      );
    }

    // Get assignments
    const { data: assignments, error } = await supabaseAdmin
      .from("drive_assignments")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Fetch assignments error:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    // Fetch vendor details for each assignment
    const assignmentsWithVendors = await Promise.all(
      (assignments || []).map(async (assignment) => {
        const vendorResult = await findVendor(supabaseAdmin, assignment.vendor_id);
        return {
          ...assignment,
          vendor: vendorResult?.vendor || { id: assignment.vendor_id, full_name: 'Unknown Vendor' }
        };
      })
    );

    return NextResponse.json({ assignments: assignmentsWithVendors });
  } catch (error: any) {
    console.error("Assignments fetch error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch assignments" },
      { status: 500 }
    );
  }
}

// DELETE: Delete an assignment
export async function DELETE(request: NextRequest) {
  try {
    const supabaseAdmin = getAdminClient();
    
    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const assignmentId = searchParams.get("id");

    if (!assignmentId) {
      return NextResponse.json({ error: "Assignment ID is required" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("drive_assignments")
      .delete()
      .eq("id", assignmentId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH: Update assignment status
export async function PATCH(request: NextRequest) {
  try {
    const supabaseAdmin = getAdminClient();
    
    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const body = await request.json();
    const { id, status, ...otherUpdates } = body;

    if (!id) {
      return NextResponse.json({ error: "Assignment ID is required" }, { status: 400 });
    }

    const updateData: Record<string, any> = { ...otherUpdates };
    if (status) updateData.status = status;

    const { data, error } = await supabaseAdmin
      .from("drive_assignments")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, assignment: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
