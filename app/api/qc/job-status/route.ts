/**
 * GET /api/qc/job-status
 * 
 * Get status of QC jobs for polling
 * Also triggers processing of queued jobs (polling-based worker)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { processNextQcJob } from "@/lib/services/qc/worker";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Allow time for processing

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

    const { data: initialJobs, error } = await query;

    if (error) {
      throw error;
    }

    let jobs = initialJobs || [];

    // Check if any of the requested jobs are queued/pending
    const queuedJobs = jobs.filter((job: any) => 
      job.status === "queued" || job.status === "pending"
    );
    
    // Process queued jobs synchronously (polling-based worker)
    // This ensures jobs progress when frontend polls for status
    if (queuedJobs.length > 0) {
      console.log(`[JobStatus] Found ${queuedJobs.length} queued job(s), processing...`);
      try {
        // Process the first queued job synchronously
        const processedJob = await processNextQcJob();
        if (processedJob) {
          console.log(`[JobStatus] Processed job ${processedJob.id}`);
          // Re-fetch job status after processing
          const { data: updatedJobs } = await adminClient
            .from("qc_jobs")
            .select("id, status, error_message, result_json, created_at, updated_at, file_name, delivery_id")
            .eq("organisation_id", profile.organization_id)
            .in("id", jobs.map((j: any) => j.id));
          
          if (updatedJobs) {
            jobs = updatedJobs;
          }
        }
      } catch (err: any) {
        console.error("[JobStatus] Processing error:", err.message);
        // Continue with returning current status even if processing failed
      }
    }

    // Format response
    const formatted = jobs.map((job: any) => {
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

