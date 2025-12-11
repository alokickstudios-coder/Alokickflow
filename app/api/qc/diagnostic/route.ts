/**
 * GET /api/qc/diagnostic
 * 
 * Diagnostic endpoint to check QC system health
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { getFFmpegDiagnostics, isFFmpegAvailable, isFFprobeAvailable } from "@/lib/services/qc/ffmpegPaths";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getAdminClient() {
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

    // Check FFmpeg availability
    const ffmpegDiagnostics = getFFmpegDiagnostics();
    
    // Try to run ffmpeg version
    let ffmpegVersion = null;
    let ffmpegError = null;
    try {
      if (ffmpegDiagnostics.ffmpegPath) {
        const { stdout } = await execAsync(`"${ffmpegDiagnostics.ffmpegPath}" -version 2>&1 | head -1`);
        ffmpegVersion = stdout.trim();
      }
    } catch (err: any) {
      ffmpegError = err.message;
    }

    // Try to run ffprobe version
    let ffprobeVersion = null;
    let ffprobeError = null;
    try {
      if (ffmpegDiagnostics.ffprobePath) {
        const { stdout } = await execAsync(`"${ffmpegDiagnostics.ffprobePath}" -version 2>&1 | head -1`);
        ffprobeVersion = stdout.trim();
      }
    } catch (err: any) {
      ffprobeError = err.message;
    }

    // Get recent failed jobs
    let recentFailedJobs: any[] = [];
    if (adminClient) {
      const { data: jobs } = await adminClient
        .from("qc_jobs")
        .select("id, status, error_message, created_at, file_name, source_type")
        .eq("organisation_id", profile.organization_id)
        .eq("status", "failed")
        .order("created_at", { ascending: false })
        .limit(5);
      
      recentFailedJobs = jobs || [];
    }

    // Check environment
    const environment = {
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV,
      isVercel: !!process.env.VERCEL,
      region: process.env.VERCEL_REGION,
    };

    return NextResponse.json({
      success: true,
      ffmpeg: {
        ...ffmpegDiagnostics,
        ffmpegVersion,
        ffmpegError,
        ffprobeVersion,
        ffprobeError,
      },
      environment,
      recentFailedJobs: recentFailedJobs.map(job => ({
        id: job.id,
        fileName: job.file_name,
        sourceType: job.source_type,
        error: job.error_message,
        createdAt: job.created_at,
      })),
      supabase: {
        urlConfigured: !!supabaseUrl,
        serviceKeyConfigured: !!supabaseServiceKey,
      },
    });
  } catch (error: any) {
    console.error("[QC Diagnostic] Error:", error);
    return NextResponse.json(
      { 
        error: error.message || "Diagnostic failed",
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
