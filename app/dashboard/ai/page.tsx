"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Brain,
  Sparkles,
  Shield,
  Layers,
  TrendingUp,
  Zap,
  Target,
  Users,
  FileVideo,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowRight,
  BarChart3,
  Wand2,
  MessageSquare,
  Command,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { VendorIntelligenceDashboard } from "@/components/ai/vendor-intelligence";

interface AIInsight {
  id: string;
  type: "prediction" | "recommendation" | "alert" | "optimization";
  title: string;
  description: string;
  impact: "high" | "medium" | "low";
  actionable: boolean;
  action?: string;
  actionHref?: string;
}

const AI_FEATURES = [
  {
    title: "AI Command Center",
    description: "Control everything with natural language. Press ⌘K to open.",
    icon: Command,
    color: "from-purple-500 to-blue-500",
    href: "#",
    action: "Open with ⌘K",
  },
  {
    title: "Compliance Checker",
    description: "Validate content for Netflix, Amazon, Disney+ and more.",
    icon: Shield,
    color: "from-blue-500 to-cyan-500",
    href: "/dashboard/ai/compliance",
    action: "Check Compliance",
  },
  {
    title: "Visual Diff",
    description: "Frame-by-frame comparison with difference detection.",
    icon: Layers,
    color: "from-green-500 to-emerald-500",
    href: "/dashboard/ai/diff",
    action: "Compare Files",
  },
  {
    title: "Quality Prediction",
    description: "Predict issues before they happen with AI analysis.",
    icon: TrendingUp,
    color: "from-orange-500 to-red-500",
    href: "#predictions",
    action: "View Predictions",
  },
];

export default function AIHubPage() {
  const [loading, setLoading] = useState(true);
  const [insights, setInsights] = useState<AIInsight[]>([]);
  const [stats, setStats] = useState({
    predictionsAccuracy: 0,
    autoFixesSaved: 0,
    complianceScore: 0,
    vendorMatchRate: 0,
  });
  const [activeTab, setActiveTab] = useState<"overview" | "vendors">("overview");

  useEffect(() => {
    // Simulate loading AI insights
    const loadInsights = async () => {
      await new Promise(resolve => setTimeout(resolve, 1000));

      setInsights([
        {
          id: "1",
          type: "prediction",
          title: "High revision risk on 3 projects",
          description: "AI predicts elevated revision rates for projects with tight deadlines this week.",
          impact: "high",
          actionable: true,
          action: "View Projects",
          actionHref: "/dashboard/projects",
        },
        {
          id: "2",
          type: "optimization",
          title: "Workflow optimization available",
          description: "Parallelizing QC tasks could reduce turnaround by 35%.",
          impact: "medium",
          actionable: true,
          action: "Apply Optimization",
        },
        {
          id: "3",
          type: "recommendation",
          title: "Top performer identified",
          description: "Priya Studios has 98% quality score - consider priority assignments.",
          impact: "medium",
          actionable: true,
          action: "View Vendor",
          actionHref: "/dashboard/vendors",
        },
        {
          id: "4",
          type: "alert",
          title: "5 auto-fixable issues detected",
          description: "Audio loudness and subtitle timing issues can be fixed automatically.",
          impact: "high",
          actionable: true,
          action: "Auto-Fix All",
        },
      ]);

      setStats({
        predictionsAccuracy: 87,
        autoFixesSaved: 124,
        complianceScore: 94,
        vendorMatchRate: 91,
      });

      setLoading(false);
    };

    loadInsights();
  }, []);

  const getInsightIcon = (type: string) => {
    switch (type) {
      case "prediction": return TrendingUp;
      case "recommendation": return Sparkles;
      case "alert": return AlertTriangle;
      case "optimization": return Zap;
      default: return Brain;
    }
  };

  const getInsightColor = (type: string) => {
    switch (type) {
      case "prediction": return "text-blue-400 bg-blue-500/10";
      case "recommendation": return "text-purple-400 bg-purple-500/10";
      case "alert": return "text-yellow-400 bg-yellow-500/10";
      case "optimization": return "text-green-400 bg-green-500/10";
      default: return "text-zinc-400 bg-zinc-500/10";
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-white flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
              <Brain className="h-5 w-5 text-white" />
            </div>
            AI Intelligence Hub
          </h1>
          <p className="text-zinc-400 mt-1">
            AI-powered insights, predictions, and automation for your media workflow
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={activeTab === "overview" ? "default" : "outline"}
            onClick={() => setActiveTab("overview")}
            className={activeTab === "overview" ? "bg-purple-500" : "border-zinc-700"}
          >
            Overview
          </Button>
          <Button
            variant={activeTab === "vendors" ? "default" : "outline"}
            onClick={() => setActiveTab("vendors")}
            className={activeTab === "vendors" ? "bg-purple-500" : "border-zinc-700"}
          >
            <Users className="h-4 w-4 mr-2" />
            Vendor Intelligence
          </Button>
        </div>
      </div>

      {activeTab === "vendors" ? (
        <VendorIntelligenceDashboard />
      ) : (
        <>
          {/* AI Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <Card className="glass border-zinc-800/50 border-purple-500/20 bg-gradient-to-br from-purple-500/5 to-transparent">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-zinc-500">Prediction Accuracy</p>
                      <p className="text-2xl font-bold text-white">{stats.predictionsAccuracy}%</p>
                    </div>
                    <div className="h-10 w-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                      <Target className="h-5 w-5 text-purple-400" />
                    </div>
                  </div>
                  <Progress value={stats.predictionsAccuracy} className="h-1 mt-3" />
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <Card className="glass border-zinc-800/50 border-green-500/20 bg-gradient-to-br from-green-500/5 to-transparent">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-zinc-500">Hours Saved</p>
                      <p className="text-2xl font-bold text-white">{stats.autoFixesSaved}h</p>
                    </div>
                    <div className="h-10 w-10 rounded-lg bg-green-500/20 flex items-center justify-center">
                      <Wand2 className="h-5 w-5 text-green-400" />
                    </div>
                  </div>
                  <p className="text-xs text-green-400 mt-2">Via auto-fixes this month</p>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <Card className="glass border-zinc-800/50 border-blue-500/20 bg-gradient-to-br from-blue-500/5 to-transparent">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-zinc-500">Compliance Score</p>
                      <p className="text-2xl font-bold text-white">{stats.complianceScore}%</p>
                    </div>
                    <div className="h-10 w-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                      <Shield className="h-5 w-5 text-blue-400" />
                    </div>
                  </div>
                  <Progress value={stats.complianceScore} className="h-1 mt-3" />
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <Card className="glass border-zinc-800/50 border-orange-500/20 bg-gradient-to-br from-orange-500/5 to-transparent">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-zinc-500">Vendor Match Rate</p>
                      <p className="text-2xl font-bold text-white">{stats.vendorMatchRate}%</p>
                    </div>
                    <div className="h-10 w-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
                      <Users className="h-5 w-5 text-orange-400" />
                    </div>
                  </div>
                  <Progress value={stats.vendorMatchRate} className="h-1 mt-3" />
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* AI Features Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {AI_FEATURES.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 * index }}
              >
                <Link href={feature.href}>
                  <Card className="glass border-zinc-800/50 hover:border-zinc-700/50 transition-all cursor-pointer group h-full">
                    <CardContent className="p-5">
                      <div className={cn(
                        "h-12 w-12 rounded-xl bg-gradient-to-br flex items-center justify-center mb-4",
                        feature.color
                      )}>
                        <feature.icon className="h-6 w-6 text-white" />
                      </div>
                      <h3 className="text-white font-semibold mb-2">{feature.title}</h3>
                      <p className="text-sm text-zinc-400 mb-4">{feature.description}</p>
                      <div className="flex items-center text-sm text-purple-400 group-hover:text-purple-300">
                        {feature.action}
                        <ArrowRight className="h-4 w-4 ml-1 group-hover:translate-x-1 transition-transform" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </motion.div>
            ))}
          </div>

          {/* AI Insights */}
          <Card className="glass border-zinc-800/50">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-purple-400" />
                AI Insights & Recommendations
              </CardTitle>
              <CardDescription>
                Personalized insights based on your workflow patterns
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {insights.map((insight, index) => {
                  const Icon = getInsightIcon(insight.type);
                  const colorClass = getInsightColor(insight.type);

                  return (
                    <motion.div
                      key={insight.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.1 * index }}
                      className="flex items-start gap-4 p-4 rounded-lg bg-zinc-800/30 hover:bg-zinc-800/50 transition-colors"
                    >
                      <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center shrink-0", colorClass)}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="text-white font-medium">{insight.title}</h4>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px]",
                              insight.impact === "high" && "border-red-500/30 text-red-400",
                              insight.impact === "medium" && "border-yellow-500/30 text-yellow-400",
                              insight.impact === "low" && "border-green-500/30 text-green-400"
                            )}
                          >
                            {insight.impact} impact
                          </Badge>
                        </div>
                        <p className="text-sm text-zinc-400">{insight.description}</p>
                      </div>
                      {insight.actionable && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0 border-zinc-700/50 hover:bg-purple-500/10 hover:border-purple-500/30 hover:text-purple-400"
                          asChild={!!insight.actionHref}
                        >
                          {insight.actionHref ? (
                            <Link href={insight.actionHref}>{insight.action}</Link>
                          ) : (
                            <span>{insight.action}</span>
                          )}
                        </Button>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Command Center Promo */}
          <Card className="glass border-zinc-800/50 border-purple-500/20 bg-gradient-to-r from-purple-500/10 via-transparent to-blue-500/10 overflow-hidden">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
                    <Brain className="h-7 w-7 text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-white mb-1">
                      Try the AI Command Center
                    </h3>
                    <p className="text-zinc-400">
                      Control everything with natural language. Just press{" "}
                      <kbd className="px-2 py-0.5 text-xs bg-zinc-800 rounded border border-zinc-700">⌘K</kbd>
                    </p>
                  </div>
                </div>
                <div className="hidden md:flex items-center gap-2 text-sm text-zinc-500">
                  <MessageSquare className="h-4 w-4" />
                  "Show all failed QC results" • "Predict issues for project X" • "Auto-fix audio issues"
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
