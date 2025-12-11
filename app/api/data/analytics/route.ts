/**
 * Analytics Data API
 * 
 * GET - Returns comprehensive analytics for the organization
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const adminClient = getAdminClient();
    
    if (!adminClient) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await adminClient
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 });
    }

    const orgId = profile.organization_id;

    // Fetch all data in parallel
    const [deliveriesRes, projectsRes, vendorsRes, monthlyRes] = await Promise.all([
      adminClient
        .from("deliveries")
        .select("id, status, created_at")
        .eq("organization_id", orgId),
      adminClient
        .from("projects")
        .select("id, status")
        .eq("organization_id", orgId),
      adminClient
        .from("profiles")
        .select("id")
        .eq("organization_id", orgId)
        .eq("role", "vendor"),
      adminClient
        .from("deliveries")
        .select("id, created_at")
        .eq("organization_id", orgId)
        .gte("created_at", new Date(new Date().setDate(1)).toISOString()),
    ]);

    const deliveries = deliveriesRes.data || [];
    const projects = projectsRes.data || [];
    const vendors = vendorsRes.data || [];
    const monthlyDeliveries = monthlyRes.data || [];

    // Calculate QC stats
    const qcPassed = deliveries.filter((d: any) => d.status === "qc_passed").length;
    const qcFailed = deliveries.filter((d: any) => d.status === "qc_failed").length;
    const qcTotal = qcPassed + qcFailed;
    const qcPassRate = qcTotal > 0 ? Math.round((qcPassed / qcTotal) * 100) : 0;

    // Calculate trend
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    const lastMonthDeliveries = deliveries.filter(
      (d: any) => new Date(d.created_at) >= lastMonth
    ).length;
    const trend = lastMonthDeliveries > 0
      ? Math.round(((monthlyDeliveries.length - lastMonthDeliveries) / lastMonthDeliveries) * 100)
      : 0;

    // Recent activity
    const recentActivity = deliveries
      .slice(0, 5)
      .map((d: any) => ({
        id: d.id,
        type: "delivery",
        message: `File ${d.status === "qc_passed" ? "passed" : d.status === "qc_failed" ? "failed" : "processed"} QC`,
        timestamp: d.created_at,
      }));

    return NextResponse.json({
      totalDeliveries: deliveries.length,
      deliveriesThisMonth: monthlyDeliveries.length,
      deliveriesTrend: trend,
      totalProjects: projects.length,
      activeProjects: projects.filter((p: any) => p.status === "active" || !p.status).length,
      totalVendors: vendors.length,
      qcPassRate,
      qcPassed,
      qcFailed,
      storageUsed: `${(deliveries.length * 50).toFixed(1)} MB`,
      recentActivity,
    });
  } catch (error: any) {
    console.error("Analytics API error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
