"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Brain,
  TrendingUp,
  TrendingDown,
  Star,
  Clock,
  CheckCircle2,
  XCircle,
  Award,
  Target,
  Zap,
  Users,
  BarChart3,
  ArrowRight,
  Sparkles,
  AlertTriangle,
  ThumbsUp,
  ThumbsDown,
  Calendar,
  Globe,
  MessageSquare,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  calculateVendorScore,
  predictQualityIssues,
  type VendorMetrics,
  type PredictionFactors,
} from "@/lib/ai/intelligence-engine";

interface VendorProfile {
  id: string;
  name: string;
  company?: string;
  specializations: string[];
  metrics: VendorMetrics;
  recentProjects: Array<{
    name: string;
    score: number;
    date: string;
  }>;
  availability: "available" | "busy" | "unavailable";
  preferredLanguages: string[];
  timezone: string;
}

interface SmartRecommendation {
  vendorId: string;
  score: number;
  matchReasons: string[];
  riskFactors: string[];
  estimatedCompletion: string;
  confidenceLevel: number;
}

export function VendorIntelligenceDashboard() {
  const [vendors, setVendors] = useState<VendorProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVendor, setSelectedVendor] = useState<VendorProfile | null>(null);
  const [recommendations, setRecommendations] = useState<SmartRecommendation[]>([]);
  const [projectRequirements, setProjectRequirements] = useState({
    type: "series",
    complexity: 7,
    deadline: 5, // days
    languages: ["Hindi", "Tamil"],
    stages: ["dubbing", "mixing"],
  });

  useEffect(() => {
    fetchVendorData();
  }, []);

  const fetchVendorData = async () => {
    setLoading(true);
    try {
      // Simulated vendor data - in real implementation, fetch from API
      const mockVendors: VendorProfile[] = [
        {
          id: "1",
          name: "Priya Studios",
          company: "Priya Media Works",
          specializations: ["dubbing", "mixing", "subtitling"],
          metrics: {
            qualityScore: 94,
            onTimeDelivery: 98,
            revisionRate: 5,
            responseTime: 2,
            specializations: ["dubbing", "mixing"],
            totalDeliveries: 156,
            recentTrend: "improving",
          },
          recentProjects: [
            { name: "Project Alpha EP01-10", score: 96, date: "2024-01-15" },
            { name: "Series Beta Full Season", score: 92, date: "2024-01-10" },
            { name: "Film Gamma", score: 95, date: "2024-01-05" },
          ],
          availability: "available",
          preferredLanguages: ["Hindi", "Tamil", "Telugu"],
          timezone: "Asia/Kolkata",
        },
        {
          id: "2",
          name: "SoundWave Audio",
          company: "SoundWave Productions",
          specializations: ["mixing", "mastering"],
          metrics: {
            qualityScore: 89,
            onTimeDelivery: 92,
            revisionRate: 12,
            responseTime: 4,
            specializations: ["mixing"],
            totalDeliveries: 78,
            recentTrend: "stable",
          },
          recentProjects: [
            { name: "Documentary Delta", score: 88, date: "2024-01-12" },
            { name: "Commercial Pack", score: 91, date: "2024-01-08" },
          ],
          availability: "busy",
          preferredLanguages: ["Hindi", "English"],
          timezone: "Asia/Kolkata",
        },
        {
          id: "3",
          name: "VoxDub International",
          company: "VoxDub",
          specializations: ["dubbing", "voice casting", "direction"],
          metrics: {
            qualityScore: 97,
            onTimeDelivery: 95,
            revisionRate: 3,
            responseTime: 1,
            specializations: ["dubbing"],
            totalDeliveries: 234,
            recentTrend: "improving",
          },
          recentProjects: [
            { name: "Blockbuster Film", score: 98, date: "2024-01-14" },
            { name: "Anime Series S2", score: 96, date: "2024-01-11" },
            { name: "Kids Show Collection", score: 97, date: "2024-01-06" },
          ],
          availability: "available",
          preferredLanguages: ["Hindi", "Tamil", "Telugu", "Malayalam", "Bengali"],
          timezone: "Asia/Kolkata",
        },
      ];

      setVendors(mockVendors);

      // Generate AI recommendations
      generateRecommendations(mockVendors);
    } catch (error) {
      console.error("Error fetching vendor data:", error);
    } finally {
      setLoading(false);
    }
  };

  const generateRecommendations = (vendorList: VendorProfile[]) => {
    const recs: SmartRecommendation[] = vendorList
      .map((vendor) => {
        const overallScore = calculateVendorScore(vendor.metrics);

        // Check language match
        const languageMatch = projectRequirements.languages.some(
          (lang) => vendor.preferredLanguages.includes(lang)
        );

        // Check specialization match
        const specMatch = projectRequirements.stages.some(
          (stage) => vendor.specializations.includes(stage)
        );

        // Calculate match score
        let matchScore = overallScore;
        if (languageMatch) matchScore += 5;
        if (specMatch) matchScore += 10;
        if (vendor.availability === "available") matchScore += 5;
        if (vendor.metrics.recentTrend === "improving") matchScore += 3;

        const matchReasons: string[] = [];
        const riskFactors: string[] = [];

        if (languageMatch) matchReasons.push("Preferred language expertise");
        if (specMatch) matchReasons.push("Specialization match");
        if (vendor.metrics.qualityScore >= 95) matchReasons.push("Top-tier quality track record");
        if (vendor.metrics.onTimeDelivery >= 95) matchReasons.push("Excellent delivery reliability");
        if (vendor.availability === "available") matchReasons.push("Currently available");

        if (vendor.metrics.revisionRate > 10) riskFactors.push("Higher revision rate");
        if (vendor.metrics.responseTime > 4) riskFactors.push("Slower response time");
        if (vendor.availability === "busy") riskFactors.push("Currently busy with other projects");

        // Estimate completion
        const baseTime = projectRequirements.stages.length * 2;
        const vendorFactor = vendor.metrics.qualityScore >= 90 ? 0.9 : 1.1;
        const estimatedDays = Math.ceil(baseTime * vendorFactor);

        return {
          vendorId: vendor.id,
          score: Math.min(100, matchScore),
          matchReasons,
          riskFactors,
          estimatedCompletion: `${estimatedDays} days`,
          confidenceLevel: matchReasons.length >= 3 ? 0.9 : matchReasons.length >= 2 ? 0.75 : 0.6,
        };
      })
      .sort((a, b) => b.score - a.score);

    setRecommendations(recs);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const getVendorById = (id: string) => vendors.find((v) => v.id === id);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-white flex items-center gap-3">
            <Brain className="h-8 w-8 text-purple-400" />
            Vendor Intelligence
          </h1>
          <p className="text-zinc-400 mt-1">
            AI-powered vendor matching, scoring, and performance analytics
          </p>
        </div>
        <Button onClick={fetchVendorData} variant="outline" className="border-zinc-700">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh Analysis
        </Button>
      </div>

      {/* AI Recommendations */}
      <Card className="glass border-zinc-800/50 border-purple-500/20 bg-gradient-to-br from-purple-500/5 to-transparent">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-400" />
            AI Smart Recommendations
          </CardTitle>
          <CardDescription>
            Based on project requirements, quality history, and current availability
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            {recommendations.slice(0, 3).map((rec, index) => {
              const vendor = getVendorById(rec.vendorId);
              if (!vendor) return null;

              return (
                <motion.div
                  key={rec.vendorId}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className={cn(
                    "relative p-4 rounded-xl border transition-all cursor-pointer",
                    index === 0
                      ? "bg-gradient-to-br from-yellow-500/10 to-amber-500/5 border-yellow-500/30"
                      : "bg-zinc-800/30 border-zinc-700/30 hover:border-zinc-600/50"
                  )}
                  onClick={() => setSelectedVendor(vendor)}
                >
                  {index === 0 && (
                    <div className="absolute -top-2 -right-2">
                      <Badge className="bg-yellow-500 text-black text-[10px]">
                        <Award className="h-3 w-3 mr-1" />
                        TOP PICK
                      </Badge>
                    </div>
                  )}

                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white font-bold">
                      {vendor.name.charAt(0)}
                    </div>
                    <div>
                      <h4 className="text-white font-medium">{vendor.name}</h4>
                      <p className="text-xs text-zinc-500">{vendor.company}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-zinc-400">Match Score</span>
                        <span className="text-sm font-bold text-white">{rec.score}%</span>
                      </div>
                      <Progress value={rec.score} className="h-2" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    {rec.matchReasons.slice(0, 3).map((reason, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <CheckCircle2 className="h-3 w-3 text-green-400" />
                        <span className="text-zinc-300">{reason}</span>
                      </div>
                    ))}
                    {rec.riskFactors.slice(0, 1).map((risk, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <AlertTriangle className="h-3 w-3 text-yellow-400" />
                        <span className="text-zinc-400">{risk}</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-zinc-700/30">
                    <div className="flex items-center gap-1 text-xs text-zinc-400">
                      <Clock className="h-3 w-3" />
                      Est: {rec.estimatedCompletion}
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px]",
                        rec.confidenceLevel >= 0.85
                          ? "border-green-500/30 text-green-400"
                          : rec.confidenceLevel >= 0.7
                          ? "border-yellow-500/30 text-yellow-400"
                          : "border-zinc-500/30 text-zinc-400"
                      )}
                    >
                      {Math.round(rec.confidenceLevel * 100)}% confidence
                    </Badge>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Vendor Performance Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {vendors.map((vendor, index) => (
          <motion.div
            key={vendor.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
          >
            <Card
              className={cn(
                "glass border-zinc-800/50 hover:border-zinc-700/50 transition-all cursor-pointer h-full",
                selectedVendor?.id === vendor.id && "border-purple-500/50 bg-purple-500/5"
              )}
              onClick={() => setSelectedVendor(vendor)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white font-bold text-lg">
                      {vendor.name.charAt(0)}
                    </div>
                    <div>
                      <CardTitle className="text-white text-lg">{vendor.name}</CardTitle>
                      <p className="text-xs text-zinc-500">{vendor.company}</p>
                    </div>
                  </div>
                  <Badge
                    className={cn(
                      "text-[10px]",
                      vendor.availability === "available"
                        ? "bg-green-500/20 text-green-400"
                        : vendor.availability === "busy"
                        ? "bg-yellow-500/20 text-yellow-400"
                        : "bg-red-500/20 text-red-400"
                    )}
                  >
                    {vendor.availability}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Overall Score */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/30">
                  <div className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-purple-400" />
                    <span className="text-sm text-zinc-300">AI Score</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold text-white">
                      {calculateVendorScore(vendor.metrics)}
                    </span>
                    {vendor.metrics.recentTrend === "improving" && (
                      <TrendingUp className="h-4 w-4 text-green-400" />
                    )}
                    {vendor.metrics.recentTrend === "declining" && (
                      <TrendingDown className="h-4 w-4 text-red-400" />
                    )}
                  </div>
                </div>

                {/* Key Metrics */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 rounded bg-zinc-800/20 text-center">
                    <p className="text-xs text-zinc-500">Quality</p>
                    <p className="text-lg font-bold text-green-400">{vendor.metrics.qualityScore}%</p>
                  </div>
                  <div className="p-2 rounded bg-zinc-800/20 text-center">
                    <p className="text-xs text-zinc-500">On-Time</p>
                    <p className="text-lg font-bold text-blue-400">{vendor.metrics.onTimeDelivery}%</p>
                  </div>
                  <div className="p-2 rounded bg-zinc-800/20 text-center">
                    <p className="text-xs text-zinc-500">Revisions</p>
                    <p className="text-lg font-bold text-yellow-400">{vendor.metrics.revisionRate}%</p>
                  </div>
                  <div className="p-2 rounded bg-zinc-800/20 text-center">
                    <p className="text-xs text-zinc-500">Response</p>
                    <p className="text-lg font-bold text-cyan-400">{vendor.metrics.responseTime}h</p>
                  </div>
                </div>

                {/* Specializations */}
                <div>
                  <p className="text-xs text-zinc-500 mb-2">Specializations</p>
                  <div className="flex flex-wrap gap-1">
                    {vendor.specializations.map((spec) => (
                      <Badge key={spec} variant="outline" className="text-[10px] border-zinc-700/50">
                        {spec}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Languages */}
                <div>
                  <p className="text-xs text-zinc-500 mb-2">Languages</p>
                  <div className="flex flex-wrap gap-1">
                    {vendor.preferredLanguages.map((lang) => (
                      <Badge
                        key={lang}
                        variant="outline"
                        className="text-[10px] border-purple-500/30 text-purple-400"
                      >
                        <Globe className="h-2.5 w-2.5 mr-1" />
                        {lang}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Recent Performance */}
                <div>
                  <p className="text-xs text-zinc-500 mb-2">Recent Projects</p>
                  <div className="space-y-1">
                    {vendor.recentProjects.slice(0, 2).map((project, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="text-zinc-400 truncate max-w-[150px]">{project.name}</span>
                        <div className="flex items-center gap-2">
                          <Star className="h-3 w-3 text-yellow-400" />
                          <span className="text-white">{project.score}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="flex items-center gap-2 pt-2 border-t border-zinc-800/50">
                  <Button size="sm" variant="outline" className="flex-1 text-xs border-zinc-700/50">
                    <MessageSquare className="h-3 w-3 mr-1" />
                    Contact
                  </Button>
                  <Button size="sm" className="flex-1 text-xs bg-purple-500 hover:bg-purple-600">
                    <Zap className="h-3 w-3 mr-1" />
                    Assign Work
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Quality Prediction Panel */}
      {selectedVendor && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className="glass border-zinc-800/50 border-blue-500/20 bg-gradient-to-br from-blue-500/5 to-transparent">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Brain className="h-5 w-5 text-blue-400" />
                Quality Prediction for {selectedVendor.name}
              </CardTitle>
              <CardDescription>
                AI-predicted outcomes based on historical data and current project requirements
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(() => {
                const prediction = predictQualityIssues({
                  vendorScore: calculateVendorScore(selectedVendor.metrics),
                  projectComplexity: projectRequirements.complexity,
                  deadlinePressure: 10 - projectRequirements.deadline,
                  previousIssuesCount: Math.round(selectedVendor.metrics.revisionRate / 5),
                  contentType: projectRequirements.type as any,
                  languagePair: `en-${projectRequirements.languages[0]?.toLowerCase() || "hi"}`,
                });

                return (
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="p-4 rounded-lg bg-zinc-800/30">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-zinc-400">Risk Level</span>
                        <Badge
                          className={cn(
                            prediction.overallRisk === "low"
                              ? "bg-green-500/20 text-green-400"
                              : prediction.overallRisk === "medium"
                              ? "bg-yellow-500/20 text-yellow-400"
                              : prediction.overallRisk === "high"
                              ? "bg-orange-500/20 text-orange-400"
                              : "bg-red-500/20 text-red-400"
                          )}
                        >
                          {prediction.overallRisk.toUpperCase()}
                        </Badge>
                      </div>
                      <div className="text-3xl font-bold text-white mb-1">
                        {prediction.riskScore}/100
                      </div>
                      <p className="text-xs text-zinc-500">
                        Expected revisions: {prediction.estimatedRevisions}
                      </p>
                    </div>

                    <div className="p-4 rounded-lg bg-zinc-800/30">
                      <h4 className="text-sm text-zinc-400 mb-2">Likely Issues</h4>
                      <div className="space-y-2">
                        {prediction.likelyIssues.slice(0, 3).map((issue, i) => (
                          <div key={i} className="flex items-center justify-between">
                            <span className="text-xs text-zinc-300">{issue.type}</span>
                            <span className="text-xs text-yellow-400">
                              {Math.round(issue.probability * 100)}%
                            </span>
                          </div>
                        ))}
                        {prediction.likelyIssues.length === 0 && (
                          <p className="text-xs text-green-400">No significant risks predicted</p>
                        )}
                      </div>
                    </div>

                    <div className="p-4 rounded-lg bg-zinc-800/30">
                      <h4 className="text-sm text-zinc-400 mb-2">Recommendations</h4>
                      <div className="space-y-2">
                        {prediction.recommendations.slice(0, 3).map((rec, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <Zap className="h-3 w-3 text-purple-400 mt-0.5 shrink-0" />
                            <span className="text-xs text-zinc-300">{rec}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
