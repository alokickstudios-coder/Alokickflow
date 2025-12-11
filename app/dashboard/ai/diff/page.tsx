"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Layers,
  Upload,
  FileVideo,
  ArrowRight,
  Play,
  AlertTriangle,
  CheckCircle2,
  Info,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { VisualDiffViewer } from "@/components/ai/visual-diff-viewer";

interface ComparisonPair {
  id: string;
  sourceName: string;
  compareName: string;
  sourceUrl?: string;
  compareUrl?: string;
  status: "pending" | "analyzing" | "ready" | "error";
  differencesCount?: number;
}

export default function VisualDiffPage() {
  const [pairs, setPairs] = useState<ComparisonPair[]>([]);
  const [selectedPair, setSelectedPair] = useState<ComparisonPair | null>(null);
  const [showViewer, setShowViewer] = useState(false);

  // Demo differences for the viewer
  const demoDifferences = [
    {
      frame: 1245,
      timestamp: "00:51:21",
      type: "visual" as const,
      severity: "major" as const,
      description: "Color grading difference detected",
      region: { x: 20, y: 30, width: 40, height: 30 },
    },
    {
      frame: 2890,
      timestamp: "02:00:12",
      type: "audio" as const,
      severity: "critical" as const,
      description: "Audio level mismatch (-3dB)",
    },
    {
      frame: 4521,
      timestamp: "03:08:05",
      type: "subtitle" as const,
      severity: "minor" as const,
      description: "Subtitle timing offset (+0.3s)",
    },
  ];

  const handleFileUpload = (type: "source" | "compare") => {
    // In real implementation, this would handle file upload
    const newPair: ComparisonPair = {
      id: `pair-${Date.now()}`,
      sourceName: "EP01_v1_Master.mov",
      compareName: "EP01_v2_Master.mov",
      status: "ready",
      differencesCount: 3,
    };
    setPairs([newPair]);
  };

  const openViewer = (pair: ComparisonPair) => {
    setSelectedPair(pair);
    setShowViewer(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-semibold text-white flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center">
            <Layers className="h-5 w-5 text-white" />
          </div>
          Visual Diff Engine
        </h1>
        <p className="text-zinc-400 mt-1">
          Frame-by-frame comparison with AI-powered difference detection
        </p>
      </div>

      {/* Upload Area */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card className="glass border-zinc-800/50 border-dashed">
          <CardContent className="p-6">
            <div className="text-center">
              <div className="h-16 w-16 rounded-2xl bg-zinc-800/50 flex items-center justify-center mx-auto mb-4">
                <FileVideo className="h-8 w-8 text-zinc-400" />
              </div>
              <h3 className="text-white font-medium mb-2">Source File</h3>
              <p className="text-sm text-zinc-500 mb-4">
                Upload the original/reference file
              </p>
              <Button
                variant="outline"
                className="border-zinc-700"
                onClick={() => handleFileUpload("source")}
              >
                <Upload className="h-4 w-4 mr-2" />
                Select File
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="glass border-zinc-800/50 border-dashed">
          <CardContent className="p-6">
            <div className="text-center">
              <div className="h-16 w-16 rounded-2xl bg-zinc-800/50 flex items-center justify-center mx-auto mb-4">
                <FileVideo className="h-8 w-8 text-zinc-400" />
              </div>
              <h3 className="text-white font-medium mb-2">Compare File</h3>
              <p className="text-sm text-zinc-500 mb-4">
                Upload the file to compare against
              </p>
              <Button
                variant="outline"
                className="border-zinc-700"
                onClick={() => handleFileUpload("compare")}
              >
                <Upload className="h-4 w-4 mr-2" />
                Select File
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Features */}
      <Card className="glass border-zinc-800/50">
        <CardHeader>
          <CardTitle className="text-white">AI-Powered Comparison Features</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-zinc-800/30">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-10 w-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                  <Layers className="h-5 w-5 text-blue-400" />
                </div>
                <h4 className="text-white font-medium">Pixel-Level Analysis</h4>
              </div>
              <p className="text-sm text-zinc-400">
                Detect even the smallest visual differences between frames with sub-pixel accuracy.
              </p>
            </div>

            <div className="p-4 rounded-lg bg-zinc-800/30">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-10 w-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-purple-400" />
                </div>
                <h4 className="text-white font-medium">Smart Detection</h4>
              </div>
              <p className="text-sm text-zinc-400">
                AI categorizes differences by type: visual, audio, timing, metadata, and more.
              </p>
            </div>

            <div className="p-4 rounded-lg bg-zinc-800/30">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-10 w-10 rounded-lg bg-green-500/20 flex items-center justify-center">
                  <CheckCircle2 className="h-5 w-5 text-green-400" />
                </div>
                <h4 className="text-white font-medium">Frame Annotations</h4>
              </div>
              <p className="text-sm text-zinc-400">
                Add comments and flag issues at specific frames for team collaboration.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Comparison Pairs */}
      {pairs.length > 0 && (
        <Card className="glass border-zinc-800/50">
          <CardHeader>
            <CardTitle className="text-white">Comparison Results</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pairs.map((pair) => (
                <motion.div
                  key={pair.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-between p-4 rounded-lg bg-zinc-800/30"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <FileVideo className="h-5 w-5 text-zinc-400" />
                      <span className="text-white">{pair.sourceName}</span>
                    </div>
                    <ArrowRight className="h-4 w-4 text-zinc-500" />
                    <div className="flex items-center gap-2">
                      <FileVideo className="h-5 w-5 text-zinc-400" />
                      <span className="text-white">{pair.compareName}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {pair.status === "ready" && pair.differencesCount !== undefined && (
                      <Badge
                        variant="outline"
                        className={
                          pair.differencesCount === 0
                            ? "border-green-500/30 text-green-400"
                            : "border-yellow-500/30 text-yellow-400"
                        }
                      >
                        {pair.differencesCount} differences
                      </Badge>
                    )}
                    <Button
                      onClick={() => openViewer(pair)}
                      className="bg-green-500 hover:bg-green-600"
                    >
                      <Play className="h-4 w-4 mr-2" />
                      View Comparison
                    </Button>
                  </div>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Demo Button */}
      {pairs.length === 0 && (
        <div className="text-center py-8">
          <Button
            size="lg"
            className="bg-gradient-to-r from-green-500 to-emerald-500"
            onClick={() => {
              setPairs([{
                id: "demo",
                sourceName: "Demo_Source.mp4",
                compareName: "Demo_Compare.mp4",
                status: "ready",
                differencesCount: 3,
              }]);
            }}
          >
            <Play className="h-5 w-5 mr-2" />
            Try Demo Comparison
          </Button>
          <p className="text-sm text-zinc-500 mt-3">
            See the Visual Diff Engine in action with sample files
          </p>
        </div>
      )}

      {/* Visual Diff Viewer */}
      {showViewer && selectedPair && (
        <VisualDiffViewer
          sourceUrl=""
          compareUrl=""
          differences={demoDifferences}
          onClose={() => setShowViewer(false)}
        />
      )}
    </div>
  );
}
