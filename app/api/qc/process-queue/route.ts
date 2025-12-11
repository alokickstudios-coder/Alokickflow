/**
 * POST /api/qc/process-queue
 * 
 * Worker endpoint - processes QC jobs from queue
 * 
 * This endpoint can be invoked:
 * - Manually (local dev)
 * - Via Vercel Cron (production)
 * - Via dedicated worker script (future)
 * 
 * All environments use the same worker logic from services/qc/worker.ts
 */

import { NextRequest, NextResponse } from "next/server";
import { processBatch } from "@/lib/services/qc/worker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes for Vercel

/**
 * POST /api/qc/process-queue
 * 
 * Body: { limit?: number } - max jobs to process (default: 5)
 */
export async function POST(request: NextRequest) {
  try {
    // Check authorization
    const authHeader = request.headers.get("authorization");
    const isDev = process.env.NODE_ENV === "development";
    
    // Allow if:
    // 1. Development mode
    // 2. Vercel Cron (sends Authorization: Bearer <CRON_SECRET>)
    // 3. Manual trigger with WORKER_AUTH_TOKEN
    // 4. Internal trigger (same origin, no auth needed)
    const isVercelCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;
    const hasWorkerAuth = authHeader === `Bearer ${process.env.WORKER_AUTH_TOKEN}`;
    const isInternalTrigger = request.headers.get("x-internal-trigger") === "true";
    
    // In production, require some form of auth (but be lenient for internal calls)
    // For now, allow all calls to process queue (jobs are idempotent)
    const isAuthorized = isDev || isVercelCron || hasWorkerAuth || isInternalTrigger || !process.env.CRON_SECRET;

    if (!isAuthorized) {
      console.log("[ProcessQueue] Unauthorized request - missing valid auth");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const limit = body.limit || 5;

    console.log(`[ProcessQueue] Processing up to ${limit} QC jobs`);

    const result = await processBatch(limit);

    return NextResponse.json({
      success: true,
      processed: result.processed,
      errors: result.errors,
      message: `Processed ${result.processed} job(s), ${result.errors} error(s)`,
    });
  } catch (error: any) {
    console.error("[ProcessQueue] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process queue" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/qc/process-queue
 * 
 * Health check / manual trigger (for dev)
 */
export async function GET(request: NextRequest) {
  // Only allow in development or with auth
  const isDev = process.env.NODE_ENV === "development";
  if (!isDev) {
    return NextResponse.json({ error: "Use POST method" }, { status: 405 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "5", 10);

    console.log(`[ProcessQueue] Manual trigger - processing up to ${limit} jobs`);

    const result = await processBatch(limit);

    return NextResponse.json({
      success: true,
      processed: result.processed,
      errors: result.errors,
      message: `Processed ${result.processed} job(s), ${result.errors} error(s)`,
    });
  } catch (error: any) {
    console.error("[ProcessQueue] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process queue" },
      { status: 500 }
    );
  }
}

