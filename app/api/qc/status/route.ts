/**
 * GET /api/qc/status
 * 
 * Diagnostic endpoint to check QC system status
 * Helps debug FFmpeg availability, worker configuration, etc.
 */

import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

export const dynamic = "force-dynamic";

const execAsync = promisify(exec);

export async function GET(request: NextRequest) {
  const diagnostics: Record<string, any> = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    platform: {
      isRender: !!process.env.RENDER,
      isVercel: !!process.env.VERCEL,
      isRailway: !!process.env.RAILWAY_ENVIRONMENT,
    },
    ffmpeg: {
      available: false,
      version: null,
      path: null,
      error: null,
    },
    ffprobe: {
      available: false,
      version: null,
      path: null,
      error: null,
    },
    qcWorker: {
      configured: false,
      url: null,
      reachable: false,
      error: null,
    },
    groqApi: {
      configured: !!process.env.GROQ_API_KEY,
    },
    supabase: {
      urlConfigured: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      serviceKeyConfigured: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    },
  };

  // Check FFmpeg
  try {
    const { stdout: ffmpegVersion } = await execAsync("ffmpeg -version", { timeout: 5000 });
    diagnostics.ffmpeg.available = true;
    diagnostics.ffmpeg.version = ffmpegVersion.split("\n")[0];
    
    try {
      const { stdout: ffmpegPath } = await execAsync("which ffmpeg");
      diagnostics.ffmpeg.path = ffmpegPath.trim();
    } catch {}
  } catch (error: any) {
    diagnostics.ffmpeg.error = error.message;
  }

  // Check FFprobe
  try {
    const { stdout: ffprobeVersion } = await execAsync("ffprobe -version", { timeout: 5000 });
    diagnostics.ffprobe.available = true;
    diagnostics.ffprobe.version = ffprobeVersion.split("\n")[0];
    
    try {
      const { stdout: ffprobePath } = await execAsync("which ffprobe");
      diagnostics.ffprobe.path = ffprobePath.trim();
    } catch {}
  } catch (error: any) {
    diagnostics.ffprobe.error = error.message;
  }

  // Check QC Worker
  if (process.env.QC_WORKER_URL && process.env.QC_WORKER_SECRET) {
    diagnostics.qcWorker.configured = true;
    diagnostics.qcWorker.url = process.env.QC_WORKER_URL;
    
    try {
      const response = await fetch(`${process.env.QC_WORKER_URL}/health`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${process.env.QC_WORKER_SECRET}`,
        },
        signal: AbortSignal.timeout(5000),
      });
      diagnostics.qcWorker.reachable = response.ok;
      if (!response.ok) {
        diagnostics.qcWorker.error = `Status ${response.status}`;
      }
    } catch (error: any) {
      diagnostics.qcWorker.error = error.message;
    }
  }

  // Overall status
  const canProcessQC = diagnostics.ffmpeg.available || diagnostics.qcWorker.reachable;
  
  return NextResponse.json({
    success: canProcessQC,
    message: canProcessQC 
      ? "QC system is operational" 
      : "QC system cannot process videos - FFmpeg not available and QC Worker not reachable",
    diagnostics,
    recommendations: !canProcessQC ? [
      !diagnostics.ffmpeg.available && "Install FFmpeg in the Docker container or use a runtime that includes FFmpeg",
      !diagnostics.qcWorker.configured && "Configure QC_WORKER_URL and QC_WORKER_SECRET environment variables",
      diagnostics.qcWorker.configured && !diagnostics.qcWorker.reachable && "Verify QC Worker service is running and accessible",
    ].filter(Boolean) : [],
  });
}
