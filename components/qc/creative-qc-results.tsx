"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Sparkles,
  Brain,
  Shield,
  Target,
  Heart,
  BookOpen,
  Users,
  Briefcase,
  AlertTriangle,
  ChevronRight,
  Loader2,
  Info,
  Check,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CREATIVE_QC_CATEGORIES } from "@/config/creativeQcConfig";

interface CreativeQCResultsProps {
  job: {
    id: string;
    creative_qc_status?: string;
    creative_qc_overall_score?: number;
    creative_qc_overall_risk_score?: number;
    creative_qc_overall_brand_fit_score?: number;
    creative_qc_parameters?: Record<string, any>;
    creative_qc_summary?: string;
    creative_qc_recommendations?: string[];
    creative_qc_error?: string;
  };
  compact?: boolean;
  onRunAnalysis?: (jobId: string) => Promise<void>;
}

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  story_structure: BookOpen,
  character_voice: Users,
  emotion_engagement: Heart,
  platform_audience: Target,
  brand_intent: Briefcase,
  risk_safety: Shield,
  perceived_craft: Sparkles,
  summary: Brain,
};

/**
 * Creative QC Score Badge
 * Shows the overall creative score with color coding
 */
export function CreativeQCScoreBadge({ 
  score, 
  size = "default" 
}: { 
  score: number | undefined; 
  size?: "small" | "default" | "large";
}) {
  if (score === undefined || score === null) return null;

  const getColor = (s: number) => {
    if (s >= 80) return "text-green-400 bg-green-500/10 border-green-500/30";
    if (s >= 60) return "text-yellow-400 bg-yellow-500/10 border-yellow-500/30";
    if (s >= 40) return "text-orange-400 bg-orange-500/10 border-orange-500/30";
    return "text-red-400 bg-red-500/10 border-red-500/30";
  };

  const sizeClasses = {
    small: "text-[10px] px-1.5 py-0.5",
    default: "text-xs px-2 py-0.5",
    large: "text-sm px-3 py-1",
  };

  return (
    <Badge variant="outline" className={cn(getColor(score), sizeClasses[size])}>
      <Sparkles className={cn(
        "mr-1",
        size === "small" ? "h-2.5 w-2.5" : size === "large" ? "h-4 w-4" : "h-3 w-3"
      )} />
      {score}
    </Badge>
  );
}

/**
 * Creative QC Status Indicator
 * Shows the current status of Creative QC processing
 */
export function CreativeQCStatus({ 
  status,
  error,
  className,
}: { 
  status?: string; 
  error?: string;
  className?: string;
}) {
  if (!status || status === "null") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className={cn("text-[10px] border-zinc-700 text-zinc-500", className)}>
              <Sparkles className="h-2.5 w-2.5 mr-1 opacity-50" />
              N/A
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>Creative QC not enabled for this job</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  switch (status) {
    case "pending":
      return (
        <Badge variant="outline" className={cn("text-[10px] border-zinc-600 text-zinc-400", className)}>
          <Sparkles className="h-2.5 w-2.5 mr-1" />
          Pending
        </Badge>
      );
    case "running":
      return (
        <Badge variant="outline" className={cn("text-[10px] border-purple-500/30 text-purple-400", className)}>
          <Loader2 className="h-2.5 w-2.5 mr-1 animate-spin" />
          Analyzing
        </Badge>
      );
    case "completed":
      return (
        <Badge variant="outline" className={cn("text-[10px] border-green-500/30 text-green-400", className)}>
          <Check className="h-2.5 w-2.5 mr-1" />
          Done
        </Badge>
      );
    case "failed":
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className={cn("text-[10px] border-red-500/30 text-red-400", className)}>
                <X className="h-2.5 w-2.5 mr-1" />
                Failed
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p>{error || "Creative QC analysis failed"}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    default:
      return null;
  }
}

/**
 * Creative QC Results Display
 * Full component showing Creative QC results with detail modal
 */
export function CreativeQCResults({ job, compact, onRunAnalysis }: CreativeQCResultsProps) {
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [running, setRunning] = useState(false);

  const hasResults = job.creative_qc_status === "completed" && job.creative_qc_parameters;

  const handleRunAnalysis = async () => {
    if (!onRunAnalysis) return;
    setRunning(true);
    try {
      await onRunAnalysis(job.id);
    } finally {
      setRunning(false);
    }
  };

  // Compact view - just show score badge
  if (compact) {
    return (
      <div className="flex items-center gap-2">
        {hasResults ? (
          <button onClick={() => setDetailModalOpen(true)}>
            <CreativeQCScoreBadge score={job.creative_qc_overall_score} size="small" />
          </button>
        ) : (
          <CreativeQCStatus status={job.creative_qc_status} error={job.creative_qc_error} />
        )}
        
        {/* Detail Modal */}
        <CreativeQCDetailModal 
          job={job}
          open={detailModalOpen}
          onOpenChange={setDetailModalOpen}
          onRunAnalysis={onRunAnalysis}
        />
      </div>
    );
  }

  // Full view
  return (
    <div className="space-y-3">
      {/* Header with scores */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-medium text-zinc-200">Creative QC</span>
          <CreativeQCStatus status={job.creative_qc_status} error={job.creative_qc_error} />
        </div>
        
        {hasResults && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDetailModalOpen(true)}
            className="text-xs text-zinc-400 hover:text-white"
          >
            View Details
            <ChevronRight className="h-3 w-3 ml-1" />
          </Button>
        )}
      </div>

      {/* Scores Grid */}
      {hasResults ? (
        <div className="grid grid-cols-3 gap-3">
          <ScoreCard
            label="Creative Score"
            score={job.creative_qc_overall_score}
            icon={Brain}
            colorClass="text-purple-400"
          />
          <ScoreCard
            label="Risk Score"
            score={job.creative_qc_overall_risk_score}
            icon={Shield}
            colorClass="text-amber-400"
            inverted
          />
          <ScoreCard
            label="Brand Fit"
            score={job.creative_qc_overall_brand_fit_score}
            icon={Target}
            colorClass="text-blue-400"
          />
        </div>
      ) : job.creative_qc_status === "running" ? (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
          <Loader2 className="h-4 w-4 text-purple-400 animate-spin" />
          <span className="text-sm text-purple-300">Analyzing creative quality...</span>
        </div>
      ) : job.creative_qc_status === "pending" && onRunAnalysis ? (
        <Button
          variant="outline"
          size="sm"
          onClick={handleRunAnalysis}
          disabled={running}
          className="w-full border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
        >
          {running ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4 mr-2" />
          )}
          Run Creative QC Analysis
        </Button>
      ) : null}

      {/* Summary */}
      {hasResults && job.creative_qc_summary && (
        <p className="text-xs text-zinc-400 line-clamp-2">
          {job.creative_qc_summary}
        </p>
      )}

      {/* Detail Modal */}
      <CreativeQCDetailModal 
        job={job}
        open={detailModalOpen}
        onOpenChange={setDetailModalOpen}
        onRunAnalysis={onRunAnalysis}
      />
    </div>
  );
}

/**
 * Score Card Component
 */
function ScoreCard({
  label,
  score,
  icon: Icon,
  colorClass,
  inverted,
}: {
  label: string;
  score?: number;
  icon: React.ElementType;
  colorClass: string;
  inverted?: boolean;
}) {
  const getScoreColor = (s: number | undefined) => {
    if (s === undefined) return "text-zinc-500";
    if (inverted) {
      // For risk score, lower is better
      if (s <= 30) return "text-green-400";
      if (s <= 60) return "text-yellow-400";
      return "text-red-400";
    }
    // For normal scores, higher is better
    if (s >= 70) return "text-green-400";
    if (s >= 50) return "text-yellow-400";
    return "text-red-400";
  };

  return (
    <div className="p-2 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className={cn("h-3 w-3", colorClass)} />
        <span className="text-[10px] text-zinc-500">{label}</span>
      </div>
      <p className={cn("text-lg font-semibold", getScoreColor(score))}>
        {score !== undefined ? score : "—"}
      </p>
    </div>
  );
}

/**
 * Creative QC Detail Modal
 */
function CreativeQCDetailModal({
  job,
  open,
  onOpenChange,
  onRunAnalysis,
}: {
  job: CreativeQCResultsProps["job"];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRunAnalysis?: (jobId: string) => Promise<void>;
}) {
  const [running, setRunning] = useState(false);
  const parameters = job.creative_qc_parameters || {};

  // Group parameters by category
  const parametersByCategory = Object.entries(parameters).reduce((acc, [key, param]) => {
    const category = param.category || "other";
    if (!acc[category]) acc[category] = [];
    acc[category].push({ key, ...param });
    return acc;
  }, {} as Record<string, any[]>);

  const handleRerun = async () => {
    if (!onRunAnalysis) return;
    setRunning(true);
    try {
      await onRunAnalysis(job.id);
      onOpenChange(false);
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-zinc-900 border-zinc-700">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Sparkles className="h-5 w-5 text-purple-400" />
            Creative QC (SPI) Results
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Overall Scores */}
          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-gradient-to-br from-purple-500/10 to-indigo-500/10 border border-purple-500/20">
              <div className="flex items-center gap-2 mb-2">
                <Brain className="h-5 w-5 text-purple-400" />
                <span className="text-sm text-zinc-400">Creative Score</span>
              </div>
              <p className={cn(
                "text-3xl font-bold",
                (job.creative_qc_overall_score || 0) >= 70 ? "text-green-400" :
                (job.creative_qc_overall_score || 0) >= 50 ? "text-yellow-400" : "text-red-400"
              )}>
                {job.creative_qc_overall_score ?? "—"}
              </p>
              <Progress 
                value={job.creative_qc_overall_score || 0} 
                className="mt-2 h-1.5" 
              />
            </div>

            <div className="p-4 rounded-lg bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-500/20">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="h-5 w-5 text-amber-400" />
                <span className="text-sm text-zinc-400">Risk Score</span>
              </div>
              <p className={cn(
                "text-3xl font-bold",
                (job.creative_qc_overall_risk_score || 0) <= 30 ? "text-green-400" :
                (job.creative_qc_overall_risk_score || 0) <= 60 ? "text-yellow-400" : "text-red-400"
              )}>
                {job.creative_qc_overall_risk_score ?? "—"}
              </p>
              <Progress 
                value={job.creative_qc_overall_risk_score || 0} 
                className="mt-2 h-1.5" 
              />
            </div>

            <div className="p-4 rounded-lg bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border border-blue-500/20">
              <div className="flex items-center gap-2 mb-2">
                <Target className="h-5 w-5 text-blue-400" />
                <span className="text-sm text-zinc-400">Brand Fit</span>
              </div>
              <p className={cn(
                "text-3xl font-bold",
                (job.creative_qc_overall_brand_fit_score || 0) >= 70 ? "text-green-400" :
                (job.creative_qc_overall_brand_fit_score || 0) >= 50 ? "text-yellow-400" : "text-red-400"
              )}>
                {job.creative_qc_overall_brand_fit_score ?? "—"}
              </p>
              <Progress 
                value={job.creative_qc_overall_brand_fit_score || 0} 
                className="mt-2 h-1.5" 
              />
            </div>
          </div>

          {/* Summary */}
          {job.creative_qc_summary && (
            <div className="p-4 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
              <p className="text-sm font-medium text-zinc-200 mb-2">Summary</p>
              <p className="text-sm text-zinc-400">{job.creative_qc_summary}</p>
            </div>
          )}

          {/* Recommendations */}
          {job.creative_qc_recommendations && job.creative_qc_recommendations.length > 0 && (
            <div className="p-4 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
              <p className="text-sm font-medium text-zinc-200 mb-2">Recommendations</p>
              <ul className="space-y-2">
                {job.creative_qc_recommendations.map((rec, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-zinc-400">
                    <ChevronRight className="h-4 w-4 text-purple-400 mt-0.5 flex-shrink-0" />
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Parameters by Category */}
          {Object.keys(parametersByCategory).length > 0 && (
            <div className="space-y-4">
              <p className="text-sm font-medium text-zinc-200">Detailed Parameters</p>
              
              {Object.entries(parametersByCategory).map(([category, params]) => {
                const categoryInfo = CREATIVE_QC_CATEGORIES[category as keyof typeof CREATIVE_QC_CATEGORIES];
                const CategoryIcon = CATEGORY_ICONS[category] || Brain;
                
                return (
                  <div key={category} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <CategoryIcon className="h-4 w-4 text-zinc-500" />
                      <span className="text-xs font-medium text-zinc-400">
                        {categoryInfo?.label || category}
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2">
                      {params.map((param) => (
                        <div 
                          key={param.key}
                          className="p-3 rounded-lg bg-zinc-800/30 border border-zinc-700/30"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-zinc-300">{param.label}</span>
                            <span className={cn(
                              "text-sm font-semibold",
                              param.direction === "higher_is_risk"
                                ? (param.score <= 30 ? "text-green-400" : param.score <= 60 ? "text-yellow-400" : "text-red-400")
                                : (param.score >= 70 ? "text-green-400" : param.score >= 50 ? "text-yellow-400" : "text-red-400")
                            )}>
                              {param.score}
                            </span>
                          </div>
                          <Progress value={param.score} className="h-1 mb-2" />
                          <p className="text-[10px] text-zinc-500 line-clamp-2">
                            {param.explanation}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Rerun Button */}
          {onRunAnalysis && (
            <div className="flex justify-end pt-4 border-t border-zinc-800">
              <Button
                variant="outline"
                onClick={handleRerun}
                disabled={running}
                className="border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
              >
                {running ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                Re-run Analysis
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default CreativeQCResults;

