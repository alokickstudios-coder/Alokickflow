/**
 * POST /api/qc/cancel
 * 
 * Cancel one or more QC jobs
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getAdminClient() {
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { jobIds } = body;

    if (!jobIds || !Array.isArray(jobIds) || jobIds.length === 0) {
      return NextResponse.json(
        { error: "jobIds array is required" },
        { status: 400 }
      );
    }

    // Get user's organization
    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 });
    }

    const adminClient = getAdminClient();
    if (!adminClient) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    // Check which jobs belong to this organization and can be cancelled
    const { data: jobs, error: selectError } = await adminClient
      .from("qc_jobs")
      .select("id, status")
      .in("id", jobIds)
      .eq("organisation_id", profile.organization_id)
      .in("status", ["queued", "pending", "running"]); // Only cancel jobs that aren't already finished

    if (selectError) {
      console.error("[CancelQC] Error selecting jobs:", selectError);
      return NextResponse.json(
        { error: "Failed to query jobs" },
        { status: 500 }
      );
    }

    if (!jobs || jobs.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No cancellable jobs found",
        cancelled: 0,
      });
    }

    const cancellableJobIds = jobs.map((j) => j.id);

    // Mark jobs as cancelled
    const { data: updatedJobs, error: updateError } = await adminClient
      .from("qc_jobs")
      .update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
      })
      .in("id", cancellableJobIds)
      .select("id, status");

    if (updateError) {
      console.error("[CancelQC] Error cancelling jobs:", updateError);
      return NextResponse.json(
        { error: "Failed to cancel jobs" },
        { status: 500 }
      );
    }

    console.log(`[CancelQC] Cancelled ${updatedJobs?.length || 0} job(s)`);

    return NextResponse.json({
      success: true,
      message: `Cancelled ${updatedJobs?.length || 0} job(s)`,
      cancelled: updatedJobs?.length || 0,
      jobIds: updatedJobs?.map((j) => j.id) || [],
    });
  } catch (error: any) {
    console.error("[CancelQC] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to cancel jobs" },
      { status: 500 }
    );
  }
}
