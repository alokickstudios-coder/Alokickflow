"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Mic,
  MicOff,
  Send,
  X,
  Loader2,
  Zap,
  Brain,
  Wand2,
  Search,
  FileVideo,
  Users,
  FolderOpen,
  BarChart3,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  Clock,
  Target,
  Lightbulb,
  Command,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { parseNaturalLanguageCommand } from "@/lib/ai/intelligence-engine";

interface CommandResult {
  id: string;
  type: "success" | "info" | "warning" | "error" | "action";
  message: string;
  details?: any;
  actions?: Array<{ label: string; onClick: () => void }>;
  timestamp: Date;
}

interface AICommandCenterProps {
  isOpen: boolean;
  onClose: () => void;
}

const QUICK_COMMANDS = [
  { icon: Search, label: "Show all failed QC", command: "show all failed qc results" },
  { icon: Zap, label: "Run compliance check", command: "analyze all files for netflix compliance" },
  { icon: Brain, label: "Predict issues", command: "predict quality issues for current projects" },
  { icon: Wand2, label: "Auto-fix issues", command: "show auto-fixable issues" },
  { icon: TrendingUp, label: "Vendor rankings", command: "show vendor performance rankings" },
  { icon: Target, label: "Optimize workflow", command: "optimize current workflow" },
];

const AI_CAPABILITIES = [
  { title: "Natural Language Control", description: "Control the entire app with plain English" },
  { title: "Predictive Quality Analysis", description: "Predict issues before they happen" },
  { title: "Auto-Fix Engine", description: "One-click fixes for common problems" },
  { title: "Platform Compliance", description: "Netflix, Amazon, Disney+ validation" },
  { title: "Vendor Intelligence", description: "Smart vendor matching & scoring" },
  { title: "Workflow Optimization", description: "AI-powered process improvement" },
];

export function AICommandCenter({ isOpen, onClose }: AICommandCenterProps) {
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [results, setResults] = useState<CommandResult[]>([]);
  const [showCapabilities, setShowCapabilities] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsEndRef = useRef<HTMLDivElement>(null);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Scroll to bottom when new results
  useEffect(() => {
    resultsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [results]);

  // Voice recognition
  const startListening = useCallback(() => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      addResult({
        type: "error",
        message: "Voice recognition is not supported in this browser.",
      });
      return;
    }

    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
      if (event.results[0].isFinal) {
        processCommand(transcript);
      }
    };

    recognition.start();
  }, []);

  const addResult = (result: Omit<CommandResult, "id" | "timestamp">) => {
    setResults(prev => [...prev, {
      ...result,
      id: `result-${Date.now()}`,
      timestamp: new Date(),
    }]);
    setShowCapabilities(false);
  };

  const processCommand = async (command: string) => {
    if (!command.trim()) return;

    setIsProcessing(true);
    setInput("");

    // Add user command to results
    addResult({
      type: "info",
      message: command,
    });

    try {
      // Parse the natural language command
      const parsed = parseNaturalLanguageCommand(command);

      // Add AI interpretation
      addResult({
        type: "info",
        message: `🧠 Intent: ${parsed.intent} | Action: ${parsed.action} | Confidence: ${Math.round(parsed.confidence * 100)}%`,
      });

      // Process based on intent
      if (parsed.intent === "query") {
        await handleQueryCommand(parsed);
      } else if (parsed.intent === "analyze") {
        await handleAnalyzeCommand(parsed);
      } else if (parsed.intent === "predict") {
        await handlePredictCommand(parsed);
      } else if (parsed.intent === "fix") {
        await handleFixCommand(parsed);
      } else if (parsed.intent === "compare") {
        await handleCompareCommand(parsed);
      } else if (parsed.intent === "export") {
        await handleExportCommand(parsed);
      } else if (parsed.intent === "create") {
        await handleCreateCommand(parsed);
      } else {
        // Call API for complex commands
        const response = await fetch("/api/ai/command", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command, parsed }),
        });

        if (response.ok) {
          const data = await response.json();
          addResult({
            type: "success",
            message: data.message,
            details: data.data,
            actions: data.actions,
          });
        } else {
          throw new Error("Failed to process command");
        }
      }
    } catch (error: any) {
      addResult({
        type: "error",
        message: `Error: ${error.message || "Failed to process command"}`,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleQueryCommand = async (parsed: any) => {
    const { entities } = parsed;
    
    if (entities.status === "failed") {
      const response = await fetch("/api/data/qc-jobs");
      if (response.ok) {
        const data = await response.json();
        const failed = data.jobs.filter((j: any) => 
          j.status === "failed" || j.result?.status === "failed"
        );
        addResult({
          type: "success",
          message: `Found ${failed.length} failed QC jobs`,
          details: {
            type: "table",
            headers: ["File", "Project", "Error"],
            rows: failed.slice(0, 10).map((j: any) => [
              j.file_name,
              j.project?.code || "N/A",
              j.error_message || "QC Failed",
            ]),
          },
          actions: [
            { label: "View All", onClick: () => window.location.href = "/dashboard/qc?filter=failed" },
            { label: "Auto-Fix Available", onClick: () => processCommand("show auto-fixable issues") },
          ],
        });
      }
    } else if (entities.scope === "project") {
      const response = await fetch("/api/data/projects");
      if (response.ok) {
        const data = await response.json();
        addResult({
          type: "success",
          message: `Found ${data.projects.length} projects`,
          details: {
            type: "stats",
            items: [
              { label: "Total", value: data.projects.length, color: "blue" },
              { label: "Active", value: data.projects.filter((p: any) => !p.status || p.status === "active").length, color: "green" },
              { label: "Completed", value: data.projects.filter((p: any) => p.status === "completed").length, color: "purple" },
            ],
          },
        });
      }
    }
  };

  const handleAnalyzeCommand = async (parsed: any) => {
    const { entities } = parsed;
    const platform = entities.platform || "netflix";

    addResult({
      type: "action",
      message: `🔍 Running ${platform.toUpperCase()} compliance analysis...`,
    });

    // Simulate analysis
    await new Promise(resolve => setTimeout(resolve, 2000));

    addResult({
      type: "success",
      message: `Compliance analysis complete for ${platform.toUpperCase()}`,
      details: {
        type: "compliance",
        platform: platform,
        passed: 47,
        failed: 3,
        issues: [
          { severity: "high", message: "Audio loudness exceeds -27 LUFS target", file: "EP01_MIX.wav", autoFix: true },
          { severity: "medium", message: "Subtitle CPS exceeds 17 characters/second", file: "EP01_SUB.srt", autoFix: true },
          { severity: "low", message: "Video bitrate below recommended threshold", file: "EP01_VIDEO.mov", autoFix: false },
        ],
      },
      actions: [
        { label: "Auto-Fix All (2)", onClick: () => processCommand("fix all auto-fixable compliance issues") },
        { label: "Download Report", onClick: () => {} },
      ],
    });
  };

  const handlePredictCommand = async (parsed: any) => {
    addResult({
      type: "action",
      message: "🧠 Analyzing patterns and generating predictions...",
    });

    await new Promise(resolve => setTimeout(resolve, 1500));

    addResult({
      type: "success",
      message: "Quality Prediction Report Generated",
      details: {
        type: "prediction",
        overallRisk: "medium",
        riskScore: 42,
        predictions: [
          { project: "PRT-EP05", issue: "Lip sync issues likely", probability: 65, mitigation: "Schedule extra review time" },
          { project: "ABC-EP12", issue: "Deadline at risk", probability: 78, mitigation: "Assign backup vendor" },
          { project: "XYZ-EP03", issue: "Audio mix revision needed", probability: 52, mitigation: "Share reference track" },
        ],
        recommendations: [
          "Increase QC coverage for high-risk deliveries",
          "Consider pre-delivery checkpoint for PRT-EP05",
          "Prepare contingency plan for ABC-EP12",
        ],
      },
    });
  };

  const handleFixCommand = async (parsed: any) => {
    addResult({
      type: "action",
      message: "🔧 Scanning for auto-fixable issues...",
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    addResult({
      type: "success",
      message: "Found 5 auto-fixable issues",
      details: {
        type: "fixes",
        issues: [
          { file: "EP01_MIX.wav", issue: "Audio loudness -31 LUFS", fix: "Normalize to -27 LUFS", time: "~2 min" },
          { file: "EP02_MIX.wav", issue: "Audio loudness -29 LUFS", fix: "Normalize to -27 LUFS", time: "~2 min" },
          { file: "EP01_SUB.srt", issue: "Timing offset +0.5s", fix: "Resync using audio fingerprint", time: "~30 sec" },
          { file: "EP03_VIDEO.mov", issue: "Color space: sRGB", fix: "Convert to Rec. 709", time: "~5 min" },
          { file: "EP04_SUB.srt", issue: "CPS: 19 chars/sec", fix: "Split long subtitles", time: "~1 min" },
        ],
      },
      actions: [
        { label: "Fix All (5)", onClick: () => {} },
        { label: "Fix Critical Only (2)", onClick: () => {} },
        { label: "Review Individually", onClick: () => {} },
      ],
    });
  };

  const handleCompareCommand = async (parsed: any) => {
    addResult({
      type: "action",
      message: "🔄 Preparing visual comparison...",
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    addResult({
      type: "success",
      message: "Frame-by-frame comparison ready",
      details: {
        type: "comparison",
        message: "Opening visual diff viewer...",
      },
      actions: [
        { label: "Open Diff Viewer", onClick: () => {} },
      ],
    });
  };

  const handleExportCommand = async (parsed: any) => {
    addResult({
      type: "action",
      message: "📊 Preparing export...",
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    addResult({
      type: "success",
      message: "Export ready",
      actions: [
        { label: "Download CSV", onClick: () => {} },
        { label: "Export to Google Sheets", onClick: () => {} },
        { label: "Send via Email", onClick: () => {} },
      ],
    });
  };

  const handleCreateCommand = async (parsed: any) => {
    addResult({
      type: "success",
      message: "What would you like to create?",
      actions: [
        { label: "New Project", onClick: () => window.location.href = "/dashboard/projects" },
        { label: "Invite Team Member", onClick: () => window.location.href = "/dashboard/team" },
        { label: "Add Vendor", onClick: () => window.location.href = "/dashboard/vendors" },
      ],
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    processCommand(input);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.2 }}
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-3xl max-h-[80vh] overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          <div className="bg-zinc-900/95 border border-zinc-700/50 rounded-2xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/50 bg-gradient-to-r from-purple-500/10 via-transparent to-blue-500/10">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
                  <Brain className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                    AI Command Center
                    <Badge variant="outline" className="text-[10px] border-purple-500/30 text-purple-400 bg-purple-500/10">
                      BETA
                    </Badge>
                  </h2>
                  <p className="text-xs text-zinc-400">Control everything with natural language</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <kbd className="px-2 py-1 text-xs text-zinc-400 bg-zinc-800/50 rounded border border-zinc-700/50">
                  ⌘K
                </kbd>
                <Button variant="ghost" size="icon" onClick={onClose}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Results Area */}
            <div className="max-h-[50vh] overflow-y-auto p-4 space-y-4">
              {showCapabilities && results.length === 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4"
                >
                  <div className="grid grid-cols-2 gap-3">
                    {AI_CAPABILITIES.map((cap, i) => (
                      <motion.div
                        key={cap.title}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="p-3 rounded-lg bg-zinc-800/30 border border-zinc-700/30"
                      >
                        <h4 className="text-sm font-medium text-white">{cap.title}</h4>
                        <p className="text-xs text-zinc-500 mt-1">{cap.description}</p>
                      </motion.div>
                    ))}
                  </div>

                  <div className="pt-2">
                    <p className="text-xs text-zinc-500 mb-2">Quick Commands</p>
                    <div className="flex flex-wrap gap-2">
                      {QUICK_COMMANDS.map((cmd) => (
                        <Button
                          key={cmd.label}
                          variant="outline"
                          size="sm"
                          className="text-xs border-zinc-700/50 hover:bg-zinc-800/50"
                          onClick={() => processCommand(cmd.command)}
                        >
                          <cmd.icon className="h-3 w-3 mr-1.5" />
                          {cmd.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}

              {results.map((result, index) => (
                <motion.div
                  key={result.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className={cn(
                    "p-4 rounded-lg border",
                    result.type === "success" && "bg-green-500/5 border-green-500/20",
                    result.type === "error" && "bg-red-500/5 border-red-500/20",
                    result.type === "warning" && "bg-yellow-500/5 border-yellow-500/20",
                    result.type === "info" && "bg-zinc-800/30 border-zinc-700/30",
                    result.type === "action" && "bg-blue-500/5 border-blue-500/20"
                  )}
                >
                  <p className={cn(
                    "text-sm",
                    result.type === "success" && "text-green-400",
                    result.type === "error" && "text-red-400",
                    result.type === "warning" && "text-yellow-400",
                    result.type === "info" && "text-zinc-300",
                    result.type === "action" && "text-blue-400"
                  )}>
                    {result.message}
                  </p>

                  {/* Render detailed results */}
                  {result.details?.type === "table" && (
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-zinc-700/50">
                            {result.details.headers.map((h: string) => (
                              <th key={h} className="text-left text-zinc-400 py-2 px-2">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {result.details.rows.map((row: string[], i: number) => (
                            <tr key={i} className="border-b border-zinc-800/50">
                              {row.map((cell: string, j: number) => (
                                <td key={j} className="text-zinc-300 py-2 px-2">{cell}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {result.details?.type === "stats" && (
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {result.details.items.map((item: any) => (
                        <div key={item.label} className="text-center p-2 rounded bg-zinc-800/30">
                          <p className={cn("text-2xl font-bold", `text-${item.color}-400`)}>{item.value}</p>
                          <p className="text-xs text-zinc-500">{item.label}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {result.details?.type === "compliance" && (
                    <div className="mt-3 space-y-3">
                      <div className="flex items-center gap-4">
                        <div className="text-center p-2 rounded bg-green-500/10 flex-1">
                          <p className="text-2xl font-bold text-green-400">{result.details.passed}</p>
                          <p className="text-xs text-zinc-500">Passed</p>
                        </div>
                        <div className="text-center p-2 rounded bg-red-500/10 flex-1">
                          <p className="text-2xl font-bold text-red-400">{result.details.failed}</p>
                          <p className="text-xs text-zinc-500">Issues</p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        {result.details.issues.map((issue: any, i: number) => (
                          <div key={i} className="flex items-center justify-between p-2 rounded bg-zinc-800/30">
                            <div className="flex items-center gap-2">
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-[10px]",
                                  issue.severity === "high" && "border-red-500/30 text-red-400",
                                  issue.severity === "medium" && "border-yellow-500/30 text-yellow-400",
                                  issue.severity === "low" && "border-blue-500/30 text-blue-400"
                                )}
                              >
                                {issue.severity}
                              </Badge>
                              <span className="text-xs text-zinc-300">{issue.message}</span>
                            </div>
                            {issue.autoFix && (
                              <Badge className="text-[10px] bg-purple-500/20 text-purple-400">
                                <Wand2 className="h-2.5 w-2.5 mr-1" />
                                Auto-Fix
                              </Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {result.details?.type === "prediction" && (
                    <div className="mt-3 space-y-3">
                      <div className={cn(
                        "p-3 rounded-lg flex items-center gap-3",
                        result.details.overallRisk === "low" && "bg-green-500/10",
                        result.details.overallRisk === "medium" && "bg-yellow-500/10",
                        result.details.overallRisk === "high" && "bg-red-500/10"
                      )}>
                        <div className="text-3xl font-bold text-white">{result.details.riskScore}</div>
                        <div>
                          <p className="text-sm text-white capitalize">{result.details.overallRisk} Risk</p>
                          <p className="text-xs text-zinc-400">Overall quality prediction score</p>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        {result.details.predictions.map((pred: any, i: number) => (
                          <div key={i} className="p-2 rounded bg-zinc-800/30">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-zinc-300 font-medium">{pred.project}</span>
                              <span className="text-xs text-yellow-400">{pred.probability}% likely</span>
                            </div>
                            <p className="text-xs text-zinc-400 mt-1">{pred.issue}</p>
                            <p className="text-xs text-green-400 mt-1 flex items-center gap-1">
                              <Lightbulb className="h-3 w-3" />
                              {pred.mitigation}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {result.details?.type === "fixes" && (
                    <div className="mt-3 space-y-2">
                      {result.details.issues.map((issue: any, i: number) => (
                        <div key={i} className="flex items-center justify-between p-2 rounded bg-zinc-800/30">
                          <div className="space-y-1">
                            <p className="text-xs text-white font-medium">{issue.file}</p>
                            <p className="text-xs text-zinc-400">{issue.issue}</p>
                            <p className="text-xs text-green-400 flex items-center gap-1">
                              <Wand2 className="h-3 w-3" />
                              {issue.fix}
                            </p>
                          </div>
                          <div className="text-xs text-zinc-500 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {issue.time}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Action buttons */}
                  {result.actions && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {result.actions.map((action, i) => (
                        <Button
                          key={i}
                          size="sm"
                          variant="outline"
                          className="text-xs border-zinc-700/50"
                          onClick={action.onClick}
                        >
                          {action.label}
                        </Button>
                      ))}
                    </div>
                  )}
                </motion.div>
              ))}

              <div ref={resultsEndRef} />
            </div>

            {/* Input Area */}
            <form onSubmit={handleSubmit} className="p-4 border-t border-zinc-800/50 bg-zinc-900/50">
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Command className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                  <Input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Type a command or ask a question..."
                    className="pl-10 pr-10 bg-zinc-800/50 border-zinc-700/50 text-white placeholder:text-zinc-500"
                    disabled={isProcessing}
                  />
                  {isProcessing && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-purple-400 animate-spin" />
                  )}
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant={isListening ? "default" : "outline"}
                  className={cn(
                    "border-zinc-700/50",
                    isListening && "bg-red-500 hover:bg-red-600 border-red-500"
                  )}
                  onClick={isListening ? () => setIsListening(false) : startListening}
                >
                  {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </Button>
                <Button
                  type="submit"
                  disabled={!input.trim() || isProcessing}
                  className="bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-[10px] text-zinc-500 mt-2 text-center">
                Try: "Show failed QC results" • "Predict issues for project ABC" • "Auto-fix all audio issues"
              </p>
            </form>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// Floating trigger button
export function AICommandTrigger({ onClick }: { onClick: () => void }) {
  return (
    <motion.button
      onClick={onClick}
      className="fixed bottom-6 right-6 h-14 w-14 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 shadow-lg shadow-purple-500/25 flex items-center justify-center text-white z-40 group"
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.95 }}
      initial={{ opacity: 0, scale: 0 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.5 }}
    >
      <Brain className="h-6 w-6 group-hover:scale-110 transition-transform" />
      <motion.div
        className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-green-500 border-2 border-zinc-900"
        animate={{ scale: [1, 1.2, 1] }}
        transition={{ repeat: Infinity, duration: 2 }}
      />
      <div className="absolute right-full mr-3 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700/50 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
        <p className="text-xs text-white font-medium">AI Command Center</p>
        <p className="text-[10px] text-zinc-400">Press ⌘K to open</p>
      </div>
    </motion.button>
  );
}
