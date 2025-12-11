"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Download,
  RefreshCw,
  FileVideo,
  Volume2,
  Subtitles,
  Tv,
  Wand2,
  ExternalLink,
  Info,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { PLATFORM_SPECS, AUTO_FIX_SOLUTIONS } from "@/lib/ai/intelligence-engine";

interface ComplianceResult {
  file: string;
  project?: string;
  platform: string;
  overallStatus: "passed" | "failed" | "warning";
  score: number;
  checks: {
    category: "video" | "audio" | "subtitles" | "metadata";
    name: string;
    status: "passed" | "failed" | "warning" | "skipped";
    expected: string;
    actual: string;
    autoFixable: boolean;
    fixDescription?: string;
  }[];
}

const PLATFORM_ICONS: Record<string, string> = {
  netflix: "🔴",
  amazon: "📦",
  disney: "🏰",
  youtube: "▶️",
  apple: "🍎",
  hbo: "🎬",
};

const PLATFORM_COLORS: Record<string, string> = {
  netflix: "from-red-500 to-red-600",
  amazon: "from-blue-500 to-blue-600",
  disney: "from-blue-400 to-purple-500",
  youtube: "from-red-500 to-red-400",
  apple: "from-gray-600 to-gray-700",
  hbo: "from-purple-500 to-purple-600",
};

export function ComplianceChecker() {
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(["netflix"]);
  const [isChecking, setIsChecking] = useState(false);
  const [results, setResults] = useState<ComplianceResult[]>([]);
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState("overview");

  const togglePlatform = (platform: string) => {
    setSelectedPlatforms(prev =>
      prev.includes(platform)
        ? prev.filter(p => p !== platform)
        : [...prev, platform]
    );
  };

  const runComplianceCheck = async () => {
    setIsChecking(true);
    try {
      // Simulate compliance check
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Generate mock results
      const mockResults: ComplianceResult[] = selectedPlatforms.flatMap(platform => ([
        {
          file: "EP01_MIX_Final.wav",
          project: "PRT",
          platform,
          overallStatus: "warning" as const,
          score: 85,
          checks: [
            {
              category: "audio" as const,
              name: "Loudness Level",
              status: "failed" as const,
              expected: `${PLATFORM_SPECS[platform as keyof typeof PLATFORM_SPECS]?.audio.loudness.target} LUFS`,
              actual: "-31 LUFS",
              autoFixable: true,
              fixDescription: "Normalize to target loudness",
            },
            {
              category: "audio" as const,
              name: "Sample Rate",
              status: "passed" as const,
              expected: "48kHz",
              actual: "48kHz",
              autoFixable: false,
            },
            {
              category: "audio" as const,
              name: "Bit Depth",
              status: "passed" as const,
              expected: "24-bit",
              actual: "24-bit",
              autoFixable: false,
            },
            {
              category: "audio" as const,
              name: "True Peak",
              status: "passed" as const,
              expected: "-2 dBTP",
              actual: "-2.5 dBTP",
              autoFixable: false,
            },
          ],
        },
        {
          file: "EP01_SUB.srt",
          project: "PRT",
          platform,
          overallStatus: "failed" as const,
          score: 65,
          checks: [
            {
              category: "subtitles" as const,
              name: "Characters Per Second",
              status: "failed" as const,
              expected: `${PLATFORM_SPECS[platform as keyof typeof PLATFORM_SPECS]?.subtitles.maxCps} CPS max`,
              actual: "22 CPS",
              autoFixable: true,
              fixDescription: "Split long subtitles into multiple lines",
            },
            {
              category: "subtitles" as const,
              name: "Max Lines",
              status: "passed" as const,
              expected: "2 lines max",
              actual: "2 lines",
              autoFixable: false,
            },
            {
              category: "subtitles" as const,
              name: "Format",
              status: "warning" as const,
              expected: PLATFORM_SPECS[platform as keyof typeof PLATFORM_SPECS]?.subtitles.formats.join(", "),
              actual: "SRT",
              autoFixable: true,
              fixDescription: "Convert to TTML format",
            },
          ],
        },
        {
          file: "EP01_VIDEO.mov",
          project: "PRT",
          platform,
          overallStatus: "passed" as const,
          score: 100,
          checks: [
            {
              category: "video" as const,
              name: "Codec",
              status: "passed" as const,
              expected: "ProRes 422 HQ",
              actual: "ProRes 422 HQ",
              autoFixable: false,
            },
            {
              category: "video" as const,
              name: "Resolution",
              status: "passed" as const,
              expected: "3840x2160",
              actual: "3840x2160",
              autoFixable: false,
            },
            {
              category: "video" as const,
              name: "Frame Rate",
              status: "passed" as const,
              expected: "23.976 fps",
              actual: "23.976 fps",
              autoFixable: false,
            },
            {
              category: "video" as const,
              name: "Color Space",
              status: "passed" as const,
              expected: "Rec. 709",
              actual: "Rec. 709",
              autoFixable: false,
            },
          ],
        },
      ]));

      setResults(mockResults);
    } catch (error) {
      console.error("Compliance check error:", error);
    } finally {
      setIsChecking(false);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedResults(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "video": return <Tv className="h-4 w-4" />;
      case "audio": return <Volume2 className="h-4 w-4" />;
      case "subtitles": return <Subtitles className="h-4 w-4" />;
      default: return <FileVideo className="h-4 w-4" />;
    }
  };

  const totalPassed = results.filter(r => r.overallStatus === "passed").length;
  const totalWarning = results.filter(r => r.overallStatus === "warning").length;
  const totalFailed = results.filter(r => r.overallStatus === "failed").length;
  const autoFixableCount = results.reduce((sum, r) => 
    sum + r.checks.filter(c => c.autoFixable && c.status !== "passed").length, 0
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-white flex items-center gap-3">
            <Shield className="h-7 w-7 text-blue-400" />
            Universal Compliance Checker
          </h2>
          <p className="text-zinc-400 mt-1">
            Validate content against streaming platform specifications
          </p>
        </div>
        <Button
          onClick={runComplianceCheck}
          disabled={isChecking || selectedPlatforms.length === 0}
          className="bg-blue-500 hover:bg-blue-600"
        >
          {isChecking ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Shield className="h-4 w-4 mr-2" />
          )}
          {isChecking ? "Checking..." : "Run Compliance Check"}
        </Button>
      </div>

      {/* Platform Selector */}
      <Card className="glass border-zinc-800/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-white text-lg">Target Platforms</CardTitle>
          <CardDescription>
            Select platforms to validate against their delivery specifications
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {Object.entries(PLATFORM_SPECS).map(([key, platform]) => (
              <motion.button
                key={key}
                onClick={() => togglePlatform(key)}
                className={cn(
                  "relative p-4 rounded-xl border transition-all text-left",
                  selectedPlatforms.includes(key)
                    ? "border-blue-500/50 bg-blue-500/10"
                    : "border-zinc-700/50 bg-zinc-800/30 hover:bg-zinc-800/50"
                )}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {selectedPlatforms.includes(key) && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute top-2 right-2"
                  >
                    <CheckCircle2 className="h-4 w-4 text-blue-400" />
                  </motion.div>
                )}
                <div className="text-2xl mb-2">{PLATFORM_ICONS[key]}</div>
                <h4 className="text-sm font-medium text-white">{platform.name}</h4>
                <p className="text-[10px] text-zinc-500 mt-1">
                  {platform.video.resolution.preferred}
                </p>
              </motion.button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {results.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="glass border-zinc-800/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-zinc-500">Total Checked</p>
                    <p className="text-2xl font-bold text-white">{results.length}</p>
                  </div>
                  <FileVideo className="h-8 w-8 text-zinc-600" />
                </div>
              </CardContent>
            </Card>

            <Card className="glass border-green-500/20 bg-green-500/5">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-zinc-500">Passed</p>
                    <p className="text-2xl font-bold text-green-400">{totalPassed}</p>
                  </div>
                  <CheckCircle2 className="h-8 w-8 text-green-500/50" />
                </div>
              </CardContent>
            </Card>

            <Card className="glass border-yellow-500/20 bg-yellow-500/5">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-zinc-500">Warnings</p>
                    <p className="text-2xl font-bold text-yellow-400">{totalWarning}</p>
                  </div>
                  <AlertTriangle className="h-8 w-8 text-yellow-500/50" />
                </div>
              </CardContent>
            </Card>

            <Card className="glass border-red-500/20 bg-red-500/5">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-zinc-500">Failed</p>
                    <p className="text-2xl font-bold text-red-400">{totalFailed}</p>
                  </div>
                  <XCircle className="h-8 w-8 text-red-500/50" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Auto-Fix Banner */}
          {autoFixableCount > 0 && (
            <Card className="glass border-purple-500/20 bg-gradient-to-r from-purple-500/10 to-blue-500/10">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
                      <Wand2 className="h-5 w-5 text-purple-400" />
                    </div>
                    <div>
                      <h4 className="text-white font-medium">
                        {autoFixableCount} issues can be auto-fixed
                      </h4>
                      <p className="text-xs text-zinc-400">
                        AI can automatically resolve loudness, format, and timing issues
                      </p>
                    </div>
                  </div>
                  <Button className="bg-purple-500 hover:bg-purple-600">
                    <Wand2 className="h-4 w-4 mr-2" />
                    Auto-Fix All
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Detailed Results */}
          <Card className="glass border-zinc-800/50">
            <CardHeader>
              <CardTitle className="text-white">Detailed Results</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-zinc-800/50">
                {results.map((result, index) => {
                  const resultId = `${result.file}-${result.platform}-${index}`;
                  const isExpanded = expandedResults.has(resultId);

                  return (
                    <motion.div
                      key={resultId}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <button
                        onClick={() => toggleExpand(resultId)}
                        className="w-full p-4 flex items-center justify-between hover:bg-zinc-800/30 transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-zinc-400" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-zinc-400" />
                          )}
                          
                          <div className="flex items-center gap-3">
                            {result.overallStatus === "passed" && (
                              <CheckCircle2 className="h-5 w-5 text-green-400" />
                            )}
                            {result.overallStatus === "warning" && (
                              <AlertTriangle className="h-5 w-5 text-yellow-400" />
                            )}
                            {result.overallStatus === "failed" && (
                              <XCircle className="h-5 w-5 text-red-400" />
                            )}
                            
                            <div className="text-left">
                              <p className="text-sm text-white font-medium">{result.file}</p>
                              <p className="text-xs text-zinc-500">
                                {result.project} • {PLATFORM_SPECS[result.platform as keyof typeof PLATFORM_SPECS]?.name}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-xs text-zinc-500">Compliance Score</p>
                            <p className={cn(
                              "text-lg font-bold",
                              result.score >= 90 ? "text-green-400" :
                              result.score >= 70 ? "text-yellow-400" :
                              "text-red-400"
                            )}>
                              {result.score}%
                            </p>
                          </div>
                          <Badge
                            className={cn(
                              "text-[10px]",
                              `bg-gradient-to-r ${PLATFORM_COLORS[result.platform]} text-white`
                            )}
                          >
                            {PLATFORM_ICONS[result.platform]} {result.platform.toUpperCase()}
                          </Badge>
                        </div>
                      </button>

                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="p-4 pt-0 pl-12 space-y-2">
                              {result.checks.map((check, i) => (
                                <div
                                  key={i}
                                  className={cn(
                                    "flex items-center justify-between p-3 rounded-lg",
                                    check.status === "passed" && "bg-green-500/5",
                                    check.status === "warning" && "bg-yellow-500/5",
                                    check.status === "failed" && "bg-red-500/5",
                                    check.status === "skipped" && "bg-zinc-800/30"
                                  )}
                                >
                                  <div className="flex items-center gap-3">
                                    <div className={cn(
                                      "h-8 w-8 rounded-lg flex items-center justify-center",
                                      check.status === "passed" && "bg-green-500/20 text-green-400",
                                      check.status === "warning" && "bg-yellow-500/20 text-yellow-400",
                                      check.status === "failed" && "bg-red-500/20 text-red-400",
                                      check.status === "skipped" && "bg-zinc-700/50 text-zinc-400"
                                    )}>
                                      {getCategoryIcon(check.category)}
                                    </div>
                                    <div>
                                      <p className="text-sm text-white">{check.name}</p>
                                      <p className="text-xs text-zinc-500">
                                        Expected: {check.expected} • Actual: {check.actual}
                                      </p>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    {check.autoFixable && check.status !== "passed" && (
                                      <Button size="sm" variant="outline" className="text-xs border-purple-500/30 text-purple-400">
                                        <Wand2 className="h-3 w-3 mr-1" />
                                        Fix
                                      </Button>
                                    )}
                                    <Badge
                                      variant="outline"
                                      className={cn(
                                        "text-[10px]",
                                        check.status === "passed" && "border-green-500/30 text-green-400",
                                        check.status === "warning" && "border-yellow-500/30 text-yellow-400",
                                        check.status === "failed" && "border-red-500/30 text-red-400",
                                        check.status === "skipped" && "border-zinc-500/30 text-zinc-400"
                                      )}
                                    >
                                      {check.status}
                                    </Badge>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Export Options */}
          <div className="flex items-center justify-end gap-3">
            <Button variant="outline" className="border-zinc-700">
              <Download className="h-4 w-4 mr-2" />
              Export Report
            </Button>
            <Button variant="outline" className="border-zinc-700">
              <ExternalLink className="h-4 w-4 mr-2" />
              Share Results
            </Button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
