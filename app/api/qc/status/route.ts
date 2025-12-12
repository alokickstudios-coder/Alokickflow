/**
 * GET /api/qc/status
 * 
 * Diagnostic endpoint to check QC system status
 * Helps debug FFmpeg availability, worker configuration, Creative QC providers, etc.
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
    creativeQC: {
      groqConfigured: !!process.env.GROQ_API_KEY,
      deepseekConfigured: !!process.env.DEEPSEEK_API_KEY,
      primaryProvider: null as string | null,
      transcriptionProvider: "groq-whisper",
      spiProvider: null as string | null,
      ready: false,
    },
    supabase: {
      urlConfigured: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      serviceKeyConfigured: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    },
  };

  // Determine Creative QC providers
  if (process.env.DEEPSEEK_API_KEY) {
    diagnostics.creativeQC.spiProvider = "deepseek";
    diagnostics.creativeQC.primaryProvider = "DeepSeek (best quality)";
  } else if (process.env.GROQ_API_KEY) {
    diagnostics.creativeQC.spiProvider = "groq-llama-3.3-70b";
    diagnostics.creativeQC.primaryProvider = "Groq LLaMA 3.3 70B";
  }
  diagnostics.creativeQC.ready = !!(process.env.GROQ_API_KEY || process.env.DEEPSEEK_API_KEY);

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

  // Test Groq API connectivity if configured
  if (process.env.GROQ_API_KEY) {
    try {
      const groqResponse = await fetch("https://api.groq.com/openai/v1/models", {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        },
        signal: AbortSignal.timeout(10000),
      });

      if (groqResponse.ok) {
        const modelsData = await groqResponse.json();
        const modelIds = modelsData.data?.map((m: any) => m.id) || [];
        diagnostics.creativeQC.groqConnected = true;
        diagnostics.creativeQC.availableModels = modelIds.filter((id: string) => 
          id.includes("llama") || id.includes("mixtral")
        ).slice(0, 10);
        diagnostics.creativeQC.hasLlama33 = modelIds.includes("llama-3.3-70b-versatile");
      } else {
        diagnostics.creativeQC.groqConnected = false;
        diagnostics.creativeQC.groqError = `HTTP ${groqResponse.status}`;
      }
    } catch (error: any) {
      diagnostics.creativeQC.groqConnected = false;
      diagnostics.creativeQC.groqError = error.message;
    }
  }

  // Overall status
  const canProcessQC = diagnostics.ffmpeg.available || diagnostics.qcWorker.reachable;
  const canProcessCreativeQC = diagnostics.creativeQC.ready;
  
  const recommendations: string[] = [];
  if (!canProcessQC) {
    if (!diagnostics.ffmpeg.available) {
      recommendations.push("Install FFmpeg in the Docker container");
    }
    if (!diagnostics.qcWorker.configured) {
      recommendations.push("Configure QC_WORKER_URL and QC_WORKER_SECRET");
    }
    if (diagnostics.qcWorker.configured && !diagnostics.qcWorker.reachable) {
      recommendations.push("Verify QC Worker service is accessible");
    }
  }
  if (!canProcessCreativeQC) {
    recommendations.push("Add GROQ_API_KEY for Creative QC (SPI) analysis");
  }
  
  return NextResponse.json({
    success: canProcessQC,
    message: canProcessQC 
      ? canProcessCreativeQC
        ? "QC system fully operational (Basic QC + Creative QC)"
        : "Basic QC operational, Creative QC requires GROQ_API_KEY"
      : "QC system cannot process videos - FFmpeg not available",
    diagnostics,
    capabilities: {
      basicQC: canProcessQC,
      creativeQC: canProcessCreativeQC,
      transcription: !!process.env.GROQ_API_KEY,
      aiAnalysis: canProcessCreativeQC,
    },
    recommendations: recommendations.length > 0 ? recommendations : undefined,
  });
}
