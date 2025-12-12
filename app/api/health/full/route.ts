/**
 * GET /api/health/full
 * 
 * Comprehensive health check for ALL app services
 * Tests: Database, Auth, Storage, QC, Google Drive, Billing, etc.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getPlatformConfig } from "@/lib/config/platform";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

interface ServiceStatus {
  name: string;
  status: "ok" | "error" | "warning" | "not_configured";
  latency?: number;
  message?: string;
  details?: any;
}

async function checkService(
  name: string,
  testFn: () => Promise<{ ok: boolean; message?: string; details?: any }>
): Promise<ServiceStatus> {
  const start = Date.now();
  try {
    const result = await testFn();
    return {
      name,
      status: result.ok ? "ok" : "error",
      latency: Date.now() - start,
      message: result.message,
      details: result.details,
    };
  } catch (error: any) {
    return {
      name,
      status: "error",
      latency: Date.now() - start,
      message: error.message,
    };
  }
}

export async function GET(request: NextRequest) {
  const services: ServiceStatus[] = [];
  const platform = getPlatformConfig();

  // 1. Platform Info
  services.push({
    name: "platform",
    status: "ok",
    details: {
      name: platform.platform.name,
      tier: platform.platform.tier,
      memory: platform.platform.maxMemoryMB,
      maxFileSize: platform.limits.maxFileSizeMB,
      url: platform.appUrl,
    },
  });

  // 2. Database Connection
  services.push(await checkService("database", async () => {
    if (!supabaseUrl || !supabaseServiceKey) {
      return { ok: false, message: "Missing Supabase config" };
    }
    
    const client = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    
    const { data, error } = await client
      .from("organizations")
      .select("id")
      .limit(1);
    
    if (error) {
      return { ok: false, message: error.message };
    }
    return { ok: true, message: "Connected" };
  }));

  // 3. Storage (Deliveries Bucket)
  services.push(await checkService("storage", async () => {
    if (!supabaseUrl || !supabaseServiceKey) {
      return { ok: false, message: "Missing Supabase config" };
    }
    
    const client = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    
    const { data, error } = await client.storage.listBuckets();
    
    if (error) {
      return { ok: false, message: error.message };
    }
    
    const deliveriesBucket = data?.find(b => b.name === "deliveries");
    if (!deliveriesBucket) {
      return { ok: false, message: "Deliveries bucket not found" };
    }
    
    return { ok: true, details: { buckets: data?.map(b => b.name) } };
  }));

  // 4. QC Worker
  services.push(await checkService("qc_worker", async () => {
    if (!supabaseUrl || !supabaseServiceKey) {
      return { ok: false, message: "Missing config" };
    }
    
    const client = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    
    // Count jobs by status
    const statuses = ["queued", "running", "completed", "failed"];
    const counts: Record<string, number> = {};
    
    for (const status of statuses) {
      const { count } = await client
        .from("qc_jobs")
        .select("*", { count: "exact", head: true })
        .eq("status", status);
      counts[status] = count || 0;
    }
    
    // Check for stuck jobs
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { count: stuckCount } = await client
      .from("qc_jobs")
      .select("*", { count: "exact", head: true })
      .eq("status", "running")
      .lt("started_at", fiveMinAgo);
    
    return {
      ok: (counts.running || 0) <= 5 && (stuckCount || 0) === 0,
      message: stuckCount ? `${stuckCount} stuck job(s)` : undefined,
      details: { ...counts, stuck: stuckCount || 0 },
    };
  }));

  // 5. FFmpeg
  services.push(await checkService("ffmpeg", async () => {
    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const execAsync = promisify(exec);
    
    try {
      const { stdout } = await execAsync("ffmpeg -version", { timeout: 5000 });
      return { ok: true, details: { version: stdout.split("\n")[0] } };
    } catch (e: any) {
      return { ok: false, message: "FFmpeg not available" };
    }
  }));

  // 6. Groq API (Transcription + LLM)
  services.push(await checkService("groq_api", async () => {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return { ok: false, message: "GROQ_API_KEY not configured" };
    }
    
    const response = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10000),
    });
    
    if (!response.ok) {
      return { ok: false, message: `HTTP ${response.status}` };
    }
    
    const data = await response.json();
    const models = data.data?.map((m: any) => m.id).filter((id: string) => 
      id.includes("whisper") || id.includes("llama")
    ).slice(0, 5);
    
    return { ok: true, details: { models } };
  }));

  // 7. DeepSeek API (SPI Analysis)
  services.push(await checkService("deepseek_api", async () => {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return { ok: false, message: "Not configured (optional)" };
    }
    
    // Just verify key format - don't make actual request
    return { ok: apiKey.startsWith("sk-"), message: "Configured" };
  }));

  // 8. Google OAuth
  services.push(await checkService("google_oauth", async () => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      return { ok: false, message: "Google OAuth not configured" };
    }
    
    return { ok: true, message: "Configured" };
  }));

  // 9. Stripe (Billing)
  services.push(await checkService("stripe", async () => {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      return { ok: false, message: "Not configured (optional)" };
    }
    
    return { ok: true, message: "Configured" };
  }));

  // 10. Email (Resend)
  services.push(await checkService("email", async () => {
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      return { ok: false, message: "Not configured (optional)" };
    }
    
    return { ok: true, message: "Configured" };
  }));

  // Calculate overall status
  const criticalServices = ["database", "storage", "ffmpeg"];
  const criticalFailed = services.filter(
    s => criticalServices.includes(s.name) && s.status === "error"
  );
  
  const overallStatus = criticalFailed.length > 0 ? "degraded" : "healthy";
  
  // Count statuses
  const statusCounts = {
    ok: services.filter(s => s.status === "ok").length,
    error: services.filter(s => s.status === "error").length,
    warning: services.filter(s => s.status === "warning").length,
    not_configured: services.filter(s => s.status === "not_configured").length,
  };

  return NextResponse.json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    summary: statusCounts,
    services,
    recommendations: criticalFailed.length > 0
      ? criticalFailed.map(s => `Fix ${s.name}: ${s.message}`)
      : undefined,
  });
}
