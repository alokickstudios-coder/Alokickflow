"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  TrendingUp,
  TrendingDown,
  FileVideo,
  Users,
  FolderKanban,
  CheckCircle2,
  XCircle,
  Clock,
  HardDrive,
  BarChart3,
  Activity,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface Analytics {
  totalDeliveries: number;
  deliveriesThisMonth: number;
  deliveriesTrend: number;
  totalProjects: number;
  activeProjects: number;
  totalVendors: number;
  qcPassRate: number;
  qcPassed: number;
  qcFailed: number;
  storageUsed: string;
  recentActivity: ActivityItem[];
}

interface ActivityItem {
  id: string;
  type: "delivery" | "project" | "vendor" | "qc";
  message: string;
  timestamp: string;
}

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", user.id)
        .single();

      if (!profile?.organization_id) return;

      const orgId = profile.organization_id;

      // Fetch all data in parallel
      const [
        deliveriesResult,
        projectsResult,
        vendorsResult,
        monthlyResult,
      ] = await Promise.all([
        supabase
          .from("deliveries")
          .select("id, status, created_at")
          .eq("organization_id", orgId),
        supabase
          .from("projects")
          .select("id, status")
          .eq("organization_id", orgId),
        supabase
          .from("profiles")
          .select("id")
          .eq("organization_id", orgId)
          .eq("role", "vendor"),
        supabase
          .from("deliveries")
          .select("id, created_at")
          .eq("organization_id", orgId)
          .gte("created_at", new Date(new Date().setDate(1)).toISOString()),
      ]);

      const deliveries = deliveriesResult.data || [];
      const projects = projectsResult.data || [];
      const vendors = vendorsResult.data || [];
      const monthlyDeliveries = monthlyResult.data || [];

      // Calculate QC stats
      const qcPassed = deliveries.filter((d) => d.status === "qc_passed").length;
      const qcFailed = deliveries.filter((d) => d.status === "qc_failed").length;
      const qcTotal = qcPassed + qcFailed;
      const qcPassRate = qcTotal > 0 ? Math.round((qcPassed / qcTotal) * 100) : 0;

      // Calculate trend (simplified - comparing to last month)
      const lastMonth = new Date();
      lastMonth.setMonth(lastMonth.getMonth() - 1);
      const lastMonthDeliveries = deliveries.filter(
        (d) => new Date(d.created_at) >= lastMonth
      ).length;
      const trend = lastMonthDeliveries > 0
        ? Math.round(((monthlyDeliveries.length - lastMonthDeliveries) / lastMonthDeliveries) * 100)
        : 0;

      // Generate recent activity
      const recentActivity: ActivityItem[] = deliveries
        .slice(0, 5)
        .map((d) => ({
          id: d.id,
          type: "delivery" as const,
          message: `File ${d.status === "qc_passed" ? "passed" : d.status === "qc_failed" ? "failed" : "processed"} QC`,
          timestamp: d.created_at,
        }));

      setAnalytics({
        totalDeliveries: deliveries.length,
        deliveriesThisMonth: monthlyDeliveries.length,
        deliveriesTrend: trend,
        totalProjects: projects.length,
        activeProjects: projects.filter((p) => p.status === "active").length,
        totalVendors: vendors.length,
        qcPassRate,
        qcPassed,
        qcFailed,
        storageUsed: `${(deliveries.length * 50).toFixed(1)} MB`, // Estimated
        recentActivity,
      });
    } catch (error) {
      console.error("Error fetching analytics:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-semibold text-white">Analytics</h1>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(8)].map((_, i) => (
            <Card key={i} className="glass border-zinc-800/50">
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-zinc-400">Unable to load analytics</p>
      </div>
    );
  }

  const stats = [
    {
      title: "Total Deliveries",
      value: analytics.totalDeliveries,
      icon: FileVideo,
      trend: analytics.deliveriesTrend,
      color: "text-blue-400",
    },
    {
      title: "This Month",
      value: analytics.deliveriesThisMonth,
      icon: Activity,
      color: "text-purple-400",
    },
    {
      title: "Active Projects",
      value: `${analytics.activeProjects}/${analytics.totalProjects}`,
      icon: FolderKanban,
      color: "text-green-400",
    },
    {
      title: "Total Vendors",
      value: analytics.totalVendors,
      icon: Users,
      color: "text-orange-400",
    },
    {
      title: "QC Pass Rate",
      value: `${analytics.qcPassRate}%`,
      icon: CheckCircle2,
      color: analytics.qcPassRate >= 80 ? "text-green-400" : "text-yellow-400",
    },
    {
      title: "QC Passed",
      value: analytics.qcPassed,
      icon: CheckCircle2,
      color: "text-green-400",
    },
    {
      title: "QC Failed",
      value: analytics.qcFailed,
      icon: XCircle,
      color: "text-red-400",
    },
    {
      title: "Storage Used",
      value: analytics.storageUsed,
      icon: HardDrive,
      color: "text-cyan-400",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold text-white">Analytics</h1>
        <div className="text-sm text-zinc-400">
          Last updated: {new Date().toLocaleTimeString()}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.05 }}
          >
            <Card className="glass border-zinc-800/50 hover:border-zinc-700/50 transition-colors">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-zinc-400">
                  {stat.title}
                </CardTitle>
                <stat.icon className={cn("h-4 w-4", stat.color)} />
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <div className="text-2xl font-bold text-white">{stat.value}</div>
                  {stat.trend !== undefined && (
                    <div
                      className={cn(
                        "flex items-center text-xs",
                        stat.trend >= 0 ? "text-green-400" : "text-red-400"
                      )}
                    >
                      {stat.trend >= 0 ? (
                        <TrendingUp className="h-3 w-3 mr-1" />
                      ) : (
                        <TrendingDown className="h-3 w-3 mr-1" />
                      )}
                      {Math.abs(stat.trend)}%
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Charts Section */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* QC Results Chart */}
        <Card className="glass border-zinc-800/50">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-zinc-400" />
              QC Results Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-zinc-400">Passed</span>
                  <span className="text-green-400">{analytics.qcPassed}</span>
                </div>
                <div className="h-3 bg-zinc-900/50 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{
                      width: `${(analytics.qcPassed / (analytics.qcPassed + analytics.qcFailed || 1)) * 100}%`,
                    }}
                    transition={{ duration: 0.5, delay: 0.2 }}
                    className="h-full bg-green-500/70 rounded-full"
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-zinc-400">Failed</span>
                  <span className="text-red-400">{analytics.qcFailed}</span>
                </div>
                <div className="h-3 bg-zinc-900/50 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{
                      width: `${(analytics.qcFailed / (analytics.qcPassed + analytics.qcFailed || 1)) * 100}%`,
                    }}
                    transition={{ duration: 0.5, delay: 0.3 }}
                    className="h-full bg-red-500/70 rounded-full"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="glass border-zinc-800/50">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Clock className="h-5 w-5 text-zinc-400" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {analytics.recentActivity.length === 0 ? (
                <p className="text-zinc-400 text-sm text-center py-8">
                  No recent activity
                </p>
              ) : (
                analytics.recentActivity.map((activity, index) => (
                  <motion.div
                    key={activity.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-900/30 transition-colors"
                  >
                    <div className="h-2 w-2 rounded-full bg-blue-400" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">
                        {activity.message}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {new Date(activity.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

