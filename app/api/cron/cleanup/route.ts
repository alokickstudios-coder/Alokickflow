/**
 * Cron Job: Cleanup Old Data
 * Runs daily to clean up old notifications, temp files, etc.
 * 
 * Vercel Cron Schedule: 0 3 * * * (3 AM daily)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { rmdir, readdir, stat, unlink } from "fs/promises";
import { join } from "path";
import { createLogger } from "@/lib/logging";

const logger = createLogger("cron-cleanup");

// Create admin Supabase client
function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Supabase credentials not configured");
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

export async function GET(request: NextRequest) {
  // Verify cron secret (for Vercel Cron)
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  logger.info("Starting cleanup cron job");
  const results: Record<string, any> = {};

  try {
    const supabase = getAdminClient();

    // 1. Clean old read notifications (older than 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: deletedNotifications, error: notifError } = await supabase
      .from("notifications")
      .delete()
      .lt("created_at", thirtyDaysAgo.toISOString())
      .eq("read", true)
      .select("id");

    if (notifError) {
      logger.warn("Error cleaning notifications", { error: notifError.message });
    }
    results.notifications = {
      deleted: deletedNotifications?.length || 0,
    };

    // 2. Clean old audit logs (older than 90 days)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const { data: deletedAuditLogs, error: auditError } = await supabase
      .from("audit_logs")
      .delete()
      .lt("created_at", ninetyDaysAgo.toISOString())
      .select("id");

    if (auditError) {
      logger.warn("Error cleaning audit logs", { error: auditError.message });
    }
    results.auditLogs = {
      deleted: deletedAuditLogs?.length || 0,
    };

    // 3. Clean temporary upload files
    const tempDirs = [
      join(process.cwd(), "tmp", "qc-uploads"),
      join(process.cwd(), "tmp", "qc-processing"),
      join(process.cwd(), "tmp", "ai-qc"),
    ];

    let tempFilesDeleted = 0;
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

    for (const dir of tempDirs) {
      try {
        const files = await readdir(dir);
        for (const file of files) {
          const filePath = join(dir, file);
          const fileStat = await stat(filePath);
          
          // Delete files older than 24 hours
          if (fileStat.mtimeMs < oneDayAgo) {
            await unlink(filePath);
            tempFilesDeleted++;
          }
        }
      } catch (e) {
        // Directory doesn't exist or can't be read
      }
    }
    results.tempFiles = {
      deleted: tempFilesDeleted,
    };

    // 4. Mark stale processing jobs as failed
    // Increased timeout to 24 hours to account for large file uploads and long processing jobs
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

    const { data: staleDeliveries, error: staleError } = await supabase
      .from("deliveries")
      .update({
        status: "qc_failed",
        qc_report: {
          status: "failed",
          errors: [{ type: "Timeout", message: "Processing/Upload timed out after 24 hours" }],
        },
      })
      .in("status", ["processing", "uploading"])
      .lt("updated_at", twentyFourHoursAgo.toISOString())
      .select("id");

    if (staleError) {
      logger.warn("Error updating stale deliveries", { error: staleError.message });
    }
    results.staleDeliveries = {
      updated: staleDeliveries?.length || 0,
    };

    // 5. Clean orphaned storage files (files without delivery records)
    // Note: This is a more complex operation that should be done carefully
    // For now, we'll just log a summary

    logger.info("Cleanup cron job completed", results);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      results,
    });

  } catch (error: any) {
    logger.error("Cleanup cron job failed", error);
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}

// Also allow POST for manual triggering
export async function POST(request: NextRequest) {
  return GET(request);
}

