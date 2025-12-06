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

// GET - Fetch work for current user (either as admin or vendor)
export async function GET(request: NextRequest) {
  try {
    const supabase = getAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const userEmail = searchParams.get("userEmail");
    const organizationId = searchParams.get("organizationId");
    const role = searchParams.get("role"); // 'admin' or 'vendor'
    const vendorId = searchParams.get("vendorId"); // Direct vendor ID if known

    // If vendorId is provided, fetch assignments for that vendor
    if (vendorId) {
      const { data: assignments, error } = await supabase
        .from("drive_assignments")
        .select(`
          id,
          display_name,
          description,
          original_drive_link,
          status,
          due_date,
          created_at,
          project_id
        `)
        .eq("vendor_id", vendorId)
        .order("created_at", { ascending: false });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // Fetch project details separately
      const projectIds = [...new Set(assignments?.filter(a => a.project_id).map(a => a.project_id))];
      let projectsMap: Record<string, any> = {};
      
      if (projectIds.length > 0) {
        const { data: projects } = await supabase
          .from("projects")
          .select("id, name, code")
          .in("id", projectIds);
        
        if (projects) {
          projectsMap = Object.fromEntries(projects.map(p => [p.id, p]));
        }
      }

      const enrichedAssignments = (assignments || []).map(a => ({
        ...a,
        project: a.project_id ? projectsMap[a.project_id] || null : null
      }));

      return NextResponse.json({ 
        assignments: enrichedAssignments,
        vendorId,
        mode: 'vendor'
      });
    }

    // If admin, fetch all assignments for the organization
    if (role === 'admin' && organizationId) {
      const { data: assignments, error } = await supabase
        .from("drive_assignments")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // Fetch vendor and project details
      const vendorIds = [...new Set(assignments?.filter(a => a.vendor_id).map(a => a.vendor_id))];
      const projectIds = [...new Set(assignments?.filter(a => a.project_id).map(a => a.project_id))];
      
      let vendorsMap: Record<string, any> = {};
      let projectsMap: Record<string, any> = {};

      if (vendorIds.length > 0) {
        const { data: vendors } = await supabase
          .from("vendors")
          .select("id, full_name, email")
          .in("id", vendorIds);
        
        if (vendors) {
          vendorsMap = Object.fromEntries(vendors.map(v => [v.id, v]));
        }
      }

      if (projectIds.length > 0) {
        const { data: projects } = await supabase
          .from("projects")
          .select("id, name, code")
          .in("id", projectIds);
        
        if (projects) {
          projectsMap = Object.fromEntries(projects.map(p => [p.id, p]));
        }
      }

      const enrichedAssignments = (assignments || []).map(a => ({
        ...a,
        vendor: a.vendor_id ? vendorsMap[a.vendor_id] || null : null,
        project: a.project_id ? projectsMap[a.project_id] || null : null
      }));

      return NextResponse.json({ 
        assignments: enrichedAssignments,
        mode: 'admin'
      });
    }

    // Try to find vendor by email
    if (userEmail) {
      const { data: vendor } = await supabase
        .from("vendors")
        .select("id, full_name")
        .eq("email", userEmail)
        .single();

      if (vendor) {
        const { data: assignments, error } = await supabase
          .from("drive_assignments")
          .select(`
            id,
            display_name,
            description,
            original_drive_link,
            status,
            due_date,
            created_at,
            project_id
          `)
          .eq("vendor_id", vendor.id)
          .order("created_at", { ascending: false });

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ 
          assignments: assignments || [],
          vendorId: vendor.id,
          vendorName: vendor.full_name,
          mode: 'vendor'
        });
      }
    }

    return NextResponse.json({ 
      assignments: [],
      message: "No vendor found for this user. Contact admin to be added as a vendor."
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST - Update assignment status (vendor action)
export async function POST(request: NextRequest) {
  try {
    const supabase = getAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const body = await request.json();
    const { assignmentId, status, vendorId } = body;

    if (!assignmentId || !status) {
      return NextResponse.json(
        { error: "assignmentId and status are required" },
        { status: 400 }
      );
    }

    // Verify the vendor owns this assignment (if vendorId provided)
    if (vendorId) {
      const { data: assignment } = await supabase
        .from("drive_assignments")
        .select("vendor_id")
        .eq("id", assignmentId)
        .single();

      if (assignment?.vendor_id !== vendorId) {
        return NextResponse.json(
          { error: "You don't have permission to update this assignment" },
          { status: 403 }
        );
      }
    }

    const { data, error } = await supabase
      .from("drive_assignments")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", assignmentId)
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




