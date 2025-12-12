/**
 * DLQ Admin API
 * 
 * Endpoints for managing the Dead Letter Queue.
 * Requires admin role.
 * 
 * GET /api/admin/dlq - List DLQ entries
 * POST /api/admin/dlq - Retry or resolve entries
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedSession, getAdminClient } from "@/lib/api/auth-helpers";
import { isFeatureEnabled } from "@/lib/config/feature-flags";
import {
  getDLQEntries,
  getDLQEntry,
  retryDLQEntry,
  resolveDLQEntry,
  getDLQStats,
  purgeDLQ,
} from "@/lib/services/dlq";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/dlq
 * 
 * Query params:
 * - status: 'pending' | 'retrying' | 'resolved' | 'abandoned'
 * - limit: number (default 50)
 * - offset: number (default 0)
 * - stats: 'true' to get stats instead of entries
 */
export async function GET(request: NextRequest) {
  try {
    // Check feature flag
    if (!isFeatureEnabled('DLQ_ENABLED')) {
      return NextResponse.json(
        { error: "DLQ feature is disabled", featureFlag: "DLQ_ENABLED" },
        { status: 503 }
      );
    }

    // Check authentication
    const session = await getAuthenticatedSession();
    if (!session.success) {
      return NextResponse.json({ error: session.error || "Unauthorized" }, { status: 401 });
    }

    const { organizationId, profile } = session.data!;
    const role = profile?.role;

    // Require admin role
    if (role !== "admin" && role !== "super_admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const statsOnly = searchParams.get("stats") === "true";

    if (statsOnly) {
      const stats = await getDLQStats(organizationId);
      return NextResponse.json({ success: true, stats });
    }

    const status = searchParams.get("status") as any;
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const result = await getDLQEntries(organizationId, { status, limit, offset });

    return NextResponse.json({
      success: true,
      entries: result.entries,
      total: result.total,
      pagination: {
        limit,
        offset,
        hasMore: offset + result.entries.length < result.total,
      },
    });
  } catch (error: any) {
    console.error("[DLQ API] GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/admin/dlq
 * 
 * Body:
 * - action: 'retry' | 'resolve' | 'purge'
 * - id: string (entry ID, required for retry/resolve)
 * - dryRun: boolean (for retry)
 * - notes: string (for resolve)
 * - olderThanDays: number (for purge)
 */
export async function POST(request: NextRequest) {
  try {
    // Check feature flag
    if (!isFeatureEnabled('DLQ_ENABLED')) {
      return NextResponse.json(
        { error: "DLQ feature is disabled", featureFlag: "DLQ_ENABLED" },
        { status: 503 }
      );
    }

    // Check authentication
    const session = await getAuthenticatedSession();
    if (!session.success) {
      return NextResponse.json({ error: session.error || "Unauthorized" }, { status: 401 });
    }

    const { organizationId, user, profile } = session.data!;
    const userId = user.id;
    const role = profile?.role;

    // Require admin role
    if (role !== "admin" && role !== "super_admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const body = await request.json();
    const { action, id, dryRun, notes, olderThanDays } = body;

    if (!action) {
      return NextResponse.json({ error: "action is required" }, { status: 400 });
    }

    switch (action) {
      case 'retry': {
        if (!id) {
          return NextResponse.json({ error: "id is required for retry" }, { status: 400 });
        }

        // Verify entry belongs to org
        const entry = await getDLQEntry(id);
        if (!entry || entry.organisation_id !== organizationId) {
          return NextResponse.json({ error: "Entry not found" }, { status: 404 });
        }

        const result = await retryDLQEntry(id, { dryRun: !!dryRun });
        return NextResponse.json({
          success: result.success,
          message: result.message,
          newJobId: result.newJobId,
          dryRun: !!dryRun,
        });
      }

      case 'resolve': {
        if (!id) {
          return NextResponse.json({ error: "id is required for resolve" }, { status: 400 });
        }

        // Verify entry belongs to org
        const entry = await getDLQEntry(id);
        if (!entry || entry.organisation_id !== organizationId) {
          return NextResponse.json({ error: "Entry not found" }, { status: 404 });
        }

        const success = await resolveDLQEntry(id, userId!, notes);
        return NextResponse.json({
          success,
          message: success ? "Entry resolved" : "Failed to resolve entry",
        });
      }

      case 'purge': {
        // Only super_admin can purge
        if (role !== "super_admin") {
          return NextResponse.json({ error: "Super admin access required for purge" }, { status: 403 });
        }

        const count = await purgeDLQ({ olderThanDays: olderThanDays || 30 });
        return NextResponse.json({
          success: true,
          message: `Purged ${count} entries`,
          purged: count,
        });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error: any) {
    console.error("[DLQ API] POST error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
