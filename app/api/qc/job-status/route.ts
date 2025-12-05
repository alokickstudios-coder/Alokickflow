/**
 * GET /api/qc/job-status
 * 
 * Get status of QC jobs for polling
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

/**
 * GET /api/qc/job-status?jobId=xxx
 * GET /api/qc/job-status?jobIds=xxx,yyy,zzz
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get("jobId");
    const jobIds = searchParams.get("jobIds");

    if (!jobId && !jobIds) {
      return NextResponse.json(
        { error: "jobId or jobIds parameter required" },
        { status: 400 }
      );
    }

    const adminClient = getAdminClient();
    if (!adminClient) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
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

    // Build query - get result_json to extract summary
    let query = adminClient
      .from("qc_jobs")
      .select("id, status, error_message, result_json, created_at, updated_at, file_name, delivery_id")
      .eq("organisation_id", profile.organization_id);

    if (jobId) {
      query = query.eq("id", jobId);
    } else if (jobIds) {
      const ids = jobIds.split(",").map(id => id.trim()).filter(Boolean);
      query = query.in("id", ids);
    }

    const { data: jobs, error } = await query;

    if (error) {
      throw error;
    }

    // Format response
    const formatted = (jobs || []).map((job: any) => {
      const result = job.result_json || {};
      // Extract status from result_json if available
      const qcStatus = result.status || (result.basicQC ? "needs_review" : "processing");
      const score = result.score || 0;
      const errors = result.errors || [];
      
      // Determine if passed based on status and score
      const passed = qcStatus === "passed" || (qcStatus === "needs_review" && score >= 70);
      
      return {
        id: job.id,
        fileName: job.file_name,
        status: job.status, // Job status: queued, running, completed, failed
        error: job.error_message,
        summary: {
          passed: passed,
          score: score,
          hasErrors: errors.length > 0,
          errorCount: errors.length,
          status: qcStatus, // QC result status: passed, failed, needs_review
        },
        result: result, // Include full result for frontend
        createdAt: job.created_at,
        updatedAt: job.updated_at,
      };
    });

    return NextResponse.json({
      success: true,
      jobs: formatted,
    });
  } catch (error: any) {
    console.error("[JobStatus] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to get job status" },
      { status: 500 }
    );
  }
}

