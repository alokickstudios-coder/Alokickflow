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
    // Optional: Add authentication for manual triggers
    // For cron, Vercel handles auth
    const authHeader = request.headers.get("authorization");
    const cronSecret = request.headers.get("x-cron-secret");
    
    // Allow if:
    // - Has valid auth token (for manual/admin triggers)
    // - Has cron secret (for scheduled invocations)
    // - Or in development
    const isDev = process.env.NODE_ENV === "development";
    const hasAuth = authHeader === `Bearer ${process.env.WORKER_AUTH_TOKEN}`;
    const hasCronSecret = cronSecret === process.env.CRON_SECRET;

    if (!isDev && !hasAuth && !hasCronSecret) {
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

