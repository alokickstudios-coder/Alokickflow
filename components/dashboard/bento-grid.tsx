"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Upload, CheckCircle2, XCircle, HardDrive, FolderKanban, Users, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase/client";

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: {
    value: string;
    isPositive: boolean;
  };
  className?: string;
  loading?: boolean;
  onClick?: () => void;
}

interface DashboardStats {
  totalDeliveries: number;
  recentDeliveries: number;
  qcPassed: number;
  qcFailed: number;
  totalProjects: number;
  totalVendors: number;
  pendingQC: number;
  storageUsed: number;
}

function MetricCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  className,
  loading,
  onClick,
}: MetricCardProps) {
  if (loading) {
    return (
      <Card className={cn("glass border-zinc-800/50", className)}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-zinc-400">
            {title}
          </CardTitle>
          <div className="text-zinc-600">{icon}</div>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-8 w-24 mb-2" />
          {subtitle && <Skeleton className="h-4 w-32" />}
        </CardContent>
      </Card>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card 
        className={cn(
          "glass border-zinc-800/50 hover:border-zinc-700/50 transition-colors",
          onClick && "cursor-pointer",
          className
        )}
        onClick={onClick}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-zinc-400">
            {title}
          </CardTitle>
          <div className="text-zinc-600">{icon}</div>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold text-white mb-1">{value}</div>
          {subtitle && (
            <p className="text-xs text-zinc-500">{subtitle}</p>
          )}
          {trend && (
            <p
              className={cn(
                "text-xs mt-2",
                trend.isPositive ? "text-green-400" : "text-red-400"
              )}
            >
              {trend.isPositive ? "↑" : "↓"} {trend.value}
            </p>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

export function BentoGrid() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    totalDeliveries: 0,
    recentDeliveries: 0,
    qcPassed: 0,
    qcFailed: 0,
    totalProjects: 0,
    totalVendors: 0,
    pendingQC: 0,
    storageUsed: 0,
  });

  useEffect(() => {
    fetchStats();
    
    // Set up real-time subscription for deliveries
    const channel = supabase
      .channel("dashboard-stats")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "deliveries" },
        () => {
          fetchStats(); // Refresh stats when deliveries change
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchStats = async () => {
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
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      // Fetch all stats in parallel
      const [
        deliveriesResult,
        recentResult,
        passedResult,
        failedResult,
        projectsResult,
        vendorsResult,
        pendingResult,
      ] = await Promise.all([
        // Total deliveries
        supabase
          .from("deliveries")
          .select("*", { count: "exact", head: true })
          .eq("organization_id", orgId),
        // Recent deliveries (last 7 days)
        supabase
          .from("deliveries")
          .select("*", { count: "exact", head: true })
          .eq("organization_id", orgId)
          .gte("created_at", sevenDaysAgo.toISOString()),
        // QC Passed
        supabase
          .from("deliveries")
          .select("*", { count: "exact", head: true })
          .eq("organization_id", orgId)
          .eq("status", "qc_passed"),
        // QC Failed
        supabase
          .from("deliveries")
          .select("*", { count: "exact", head: true })
          .eq("organization_id", orgId)
          .eq("status", "qc_failed"),
        // Total projects
        supabase
          .from("projects")
          .select("*", { count: "exact", head: true })
          .eq("organization_id", orgId),
        // Total vendors
        supabase
          .from("profiles")
          .select("*", { count: "exact", head: true })
          .eq("organization_id", orgId)
          .eq("role", "vendor"),
        // Pending QC
        supabase
          .from("deliveries")
          .select("*", { count: "exact", head: true })
          .eq("organization_id", orgId)
          .in("status", ["processing", "uploading"]),
      ]);

      // Calculate storage used (sum of file_size)
      const { data: storageData } = await supabase
        .from("deliveries")
        .select("file_size")
        .eq("organization_id", orgId);

      const totalStorage = (storageData || []).reduce(
        (sum, d) => sum + (d.file_size || 0),
        0
      );

      setStats({
        totalDeliveries: deliveriesResult.count || 0,
        recentDeliveries: recentResult.count || 0,
        qcPassed: passedResult.count || 0,
        qcFailed: failedResult.count || 0,
        totalProjects: projectsResult.count || 0,
        totalVendors: vendorsResult.count || 0,
        pendingQC: pendingResult.count || 0,
        storageUsed: totalStorage,
      });
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatStorage = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  const calculatePassRate = (): string => {
    const total = stats.qcPassed + stats.qcFailed;
    if (total === 0) return "N/A";
    return ((stats.qcPassed / total) * 100).toFixed(1) + "%";
  };

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <MetricCard
        title="Total Deliveries"
        value={stats.totalDeliveries}
        subtitle={`${stats.recentDeliveries} in last 7 days`}
        icon={<Upload className="h-4 w-4" />}
        loading={loading}
      />
      <MetricCard
        title="QC Pass Rate"
        value={calculatePassRate()}
        subtitle={`${stats.qcPassed} passed, ${stats.qcFailed} failed`}
        icon={<CheckCircle2 className="h-4 w-4" />}
        trend={
          stats.qcPassed > 0
            ? { value: "Based on all QC runs", isPositive: true }
            : undefined
        }
        loading={loading}
      />
      <MetricCard
        title="Pending QC"
        value={stats.pendingQC}
        subtitle="Awaiting analysis"
        icon={<Clock className="h-4 w-4" />}
        loading={loading}
      />
      <MetricCard
        title="Failed QC"
        value={stats.qcFailed}
        subtitle="Requires attention"
        icon={<XCircle className="h-4 w-4" />}
        className={stats.qcFailed > 0 ? "border-red-500/20" : ""}
        loading={loading}
      />
      <MetricCard
        title="Active Projects"
        value={stats.totalProjects}
        subtitle="Total projects"
        icon={<FolderKanban className="h-4 w-4" />}
        loading={loading}
      />
      <MetricCard
        title="Vendors"
        value={stats.totalVendors}
        subtitle="Active vendors"
        icon={<Users className="h-4 w-4" />}
        loading={loading}
      />
      <MetricCard
        title="Storage Used"
        value={formatStorage(stats.storageUsed)}
        subtitle="Total file storage"
        icon={<HardDrive className="h-4 w-4" />}
        loading={loading}
        className="lg:col-span-2"
      />
    </div>
  );
}
