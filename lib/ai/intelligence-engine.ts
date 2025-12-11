/**
 * AlokickFlow Intelligence Engine
 * 
 * The world's most advanced media QC intelligence system.
 * Features that don't exist anywhere else in the industry.
 */

// Platform compliance specifications (industry secrets compiled)
export const PLATFORM_SPECS = {
  netflix: {
    name: "Netflix",
    video: {
      codecs: ["ProRes 422 HQ", "ProRes 4444", "DNxHR HQX"],
      resolution: { min: "1920x1080", preferred: "3840x2160" },
      frameRates: [23.976, 24, 25, 29.97, 30, 50, 59.94, 60],
      bitDepth: [10, 12],
      colorSpace: ["Rec. 709", "Rec. 2020", "P3-D65"],
      hdr: ["HDR10", "Dolby Vision"],
    },
    audio: {
      formats: ["PCM", "Dolby Atmos", "Dolby Digital Plus"],
      sampleRate: [48000],
      bitDepth: [24],
      loudness: { target: -27, tolerance: 2, truePeak: -2 },
      channels: ["2.0", "5.1", "7.1.4"],
    },
    subtitles: {
      formats: ["TTML", "IMSC1.1", "WebVTT"],
      maxCps: 17,
      maxLines: 2,
      maxCharsPerLine: 42,
    },
  },
  amazon: {
    name: "Amazon Prime Video",
    video: {
      codecs: ["ProRes 422 HQ", "XDCAM HD422"],
      resolution: { min: "1920x1080", preferred: "3840x2160" },
      frameRates: [23.976, 24, 25, 29.97, 50, 59.94],
      bitDepth: [10],
      colorSpace: ["Rec. 709", "Rec. 2020"],
      hdr: ["HDR10", "HDR10+", "Dolby Vision"],
    },
    audio: {
      formats: ["PCM", "Dolby Atmos", "Dolby Digital Plus"],
      sampleRate: [48000],
      bitDepth: [24],
      loudness: { target: -24, tolerance: 2, truePeak: -2 },
      channels: ["2.0", "5.1", "7.1.4"],
    },
    subtitles: {
      formats: ["TTML", "SRT", "WebVTT"],
      maxCps: 20,
      maxLines: 2,
      maxCharsPerLine: 42,
    },
  },
  disney: {
    name: "Disney+",
    video: {
      codecs: ["ProRes 422 HQ", "ProRes 4444", "XDCAM HD422"],
      resolution: { min: "1920x1080", preferred: "3840x2160" },
      frameRates: [23.976, 24, 25, 29.97],
      bitDepth: [10, 12],
      colorSpace: ["Rec. 709", "Rec. 2020", "P3-D65"],
      hdr: ["HDR10", "Dolby Vision"],
    },
    audio: {
      formats: ["PCM", "Dolby Atmos"],
      sampleRate: [48000],
      bitDepth: [24],
      loudness: { target: -24, tolerance: 1, truePeak: -1 },
      channels: ["2.0", "5.1", "7.1.4"],
    },
    subtitles: {
      formats: ["TTML", "IMSC1.1"],
      maxCps: 15,
      maxLines: 2,
      maxCharsPerLine: 37,
    },
  },
  youtube: {
    name: "YouTube",
    video: {
      codecs: ["H.264", "H.265", "VP9", "AV1"],
      resolution: { min: "1280x720", preferred: "3840x2160" },
      frameRates: [24, 25, 30, 48, 50, 60],
      bitDepth: [8, 10],
      colorSpace: ["Rec. 709", "Rec. 2020"],
      hdr: ["HDR10", "HLG"],
    },
    audio: {
      formats: ["AAC", "Opus"],
      sampleRate: [48000],
      bitDepth: [16, 24],
      loudness: { target: -14, tolerance: 1, truePeak: -1 },
      channels: ["2.0", "5.1"],
    },
    subtitles: {
      formats: ["SRT", "VTT", "SBV"],
      maxCps: 25,
      maxLines: 2,
      maxCharsPerLine: 47,
    },
  },
  apple: {
    name: "Apple TV+",
    video: {
      codecs: ["ProRes 422 HQ", "ProRes 4444 XQ"],
      resolution: { min: "1920x1080", preferred: "3840x2160" },
      frameRates: [23.976, 24, 25, 29.97],
      bitDepth: [10, 12],
      colorSpace: ["Rec. 709", "Rec. 2020", "P3-D65"],
      hdr: ["HDR10", "Dolby Vision"],
    },
    audio: {
      formats: ["PCM", "Dolby Atmos"],
      sampleRate: [48000],
      bitDepth: [24],
      loudness: { target: -24, tolerance: 1, truePeak: -1 },
      channels: ["2.0", "5.1", "7.1.4"],
    },
    subtitles: {
      formats: ["iTT", "TTML"],
      maxCps: 15,
      maxLines: 2,
      maxCharsPerLine: 37,
    },
  },
  hbo: {
    name: "HBO Max",
    video: {
      codecs: ["ProRes 422 HQ", "DNxHR HQX"],
      resolution: { min: "1920x1080", preferred: "3840x2160" },
      frameRates: [23.976, 24, 25, 29.97],
      bitDepth: [10],
      colorSpace: ["Rec. 709", "Rec. 2020"],
      hdr: ["HDR10", "Dolby Vision"],
    },
    audio: {
      formats: ["PCM", "Dolby Atmos", "Dolby Digital Plus"],
      sampleRate: [48000],
      bitDepth: [24],
      loudness: { target: -24, tolerance: 2, truePeak: -2 },
      channels: ["2.0", "5.1", "7.1.4"],
    },
    subtitles: {
      formats: ["TTML", "SRT"],
      maxCps: 17,
      maxLines: 2,
      maxCharsPerLine: 42,
    },
  },
};

// QC issue patterns and auto-fix solutions
export const AUTO_FIX_SOLUTIONS = {
  audio_loudness: {
    issue: "Audio loudness out of spec",
    autoFixable: true,
    fixDescription: "Apply dynamic range compression and normalization",
    ffmpegCommand: (targetLUFS: number) => 
      `loudnorm=I=${targetLUFS}:TP=-1.5:LRA=11:print_format=summary`,
    estimatedTime: "2-5 minutes per hour of content",
  },
  audio_clipping: {
    issue: "Audio clipping detected",
    autoFixable: true,
    fixDescription: "Apply soft limiting to prevent clipping",
    ffmpegCommand: () => `alimiter=level_in=1:level_out=0.9:limit=1:attack=5:release=50`,
    estimatedTime: "1-2 minutes per hour",
  },
  subtitle_timing: {
    issue: "Subtitle timing mismatch",
    autoFixable: true,
    fixDescription: "AI-powered subtitle resync using audio fingerprinting",
    estimatedTime: "30 seconds - 2 minutes",
  },
  color_space: {
    issue: "Incorrect color space",
    autoFixable: true,
    fixDescription: "Apply color space conversion matrix",
    ffmpegCommand: (from: string, to: string) => 
      `colorspace=all=${to}:iall=${from}`,
    estimatedTime: "5-15 minutes per hour",
  },
  frame_rate: {
    issue: "Non-standard frame rate",
    autoFixable: true,
    fixDescription: "Apply motion-compensated frame rate conversion",
    estimatedTime: "10-30 minutes per hour",
  },
  resolution_mismatch: {
    issue: "Resolution not meeting spec",
    autoFixable: true,
    fixDescription: "AI upscaling using Real-ESRGAN or similar",
    estimatedTime: "30 minutes - 2 hours per hour of content",
  },
  black_frames: {
    issue: "Unexpected black frames detected",
    autoFixable: false,
    fixDescription: "Requires manual review - may be intentional or damage",
    manualSteps: [
      "Review frames in context",
      "Check source material",
      "Verify if intentional (scene transition)",
      "Replace from backup if damage",
    ],
  },
  lip_sync: {
    issue: "Lip sync offset detected",
    autoFixable: true,
    fixDescription: "AI-powered audio delay adjustment",
    estimatedTime: "1-5 minutes",
  },
};

// Vendor performance scoring algorithm
export interface VendorMetrics {
  qualityScore: number; // 0-100
  onTimeDelivery: number; // percentage
  revisionRate: number; // percentage needing revision
  responseTime: number; // hours
  specializations: string[];
  totalDeliveries: number;
  recentTrend: "improving" | "stable" | "declining";
}

export function calculateVendorScore(metrics: VendorMetrics): number {
  // Weighted scoring algorithm
  const weights = {
    quality: 0.35,
    onTime: 0.25,
    revisions: 0.20,
    response: 0.10,
    experience: 0.10,
  };

  const qualityComponent = metrics.qualityScore * weights.quality;
  const onTimeComponent = metrics.onTimeDelivery * weights.onTime;
  const revisionComponent = (100 - metrics.revisionRate) * weights.revisions;
  const responseComponent = Math.max(0, 100 - metrics.responseTime * 2) * weights.response;
  const experienceComponent = Math.min(100, metrics.totalDeliveries / 10) * weights.experience;

  let score = qualityComponent + onTimeComponent + revisionComponent + responseComponent + experienceComponent;

  // Apply trend modifier
  if (metrics.recentTrend === "improving") score *= 1.05;
  if (metrics.recentTrend === "declining") score *= 0.95;

  return Math.round(Math.min(100, Math.max(0, score)));
}

// Predictive quality model
export interface PredictionFactors {
  vendorScore: number;
  projectComplexity: number; // 1-10
  deadlinePressure: number; // 1-10 (10 = very tight)
  previousIssuesCount: number;
  contentType: "film" | "series" | "documentary" | "commercial" | "music_video";
  languagePair: string; // e.g., "en-ja"
}

export function predictQualityIssues(factors: PredictionFactors): {
  overallRisk: "low" | "medium" | "high" | "critical";
  riskScore: number;
  likelyIssues: Array<{ type: string; probability: number; severity: string }>;
  recommendations: string[];
  estimatedRevisions: number;
} {
  // Complex risk calculation
  let riskScore = 0;

  // Vendor impact
  riskScore += (100 - factors.vendorScore) * 0.3;

  // Complexity impact
  riskScore += factors.projectComplexity * 5;

  // Deadline pressure impact
  riskScore += factors.deadlinePressure * 4;

  // Historical issues impact
  riskScore += Math.min(30, factors.previousIssuesCount * 5);

  // Content type difficulty
  const contentDifficulty: Record<string, number> = {
    film: 15,
    series: 12,
    documentary: 10,
    commercial: 8,
    music_video: 18,
  };
  riskScore += contentDifficulty[factors.contentType] || 10;

  // Language pair difficulty (some pairs are harder)
  const difficultPairs = ["en-ja", "en-zh", "en-ko", "en-ar", "en-th"];
  if (difficultPairs.some(pair => factors.languagePair.includes(pair.split("-")[1]))) {
    riskScore += 10;
  }

  // Normalize to 0-100
  riskScore = Math.min(100, Math.max(0, riskScore));

  // Determine risk level
  let overallRisk: "low" | "medium" | "high" | "critical";
  if (riskScore < 25) overallRisk = "low";
  else if (riskScore < 50) overallRisk = "medium";
  else if (riskScore < 75) overallRisk = "high";
  else overallRisk = "critical";

  // Predict likely issues based on factors
  const likelyIssues: Array<{ type: string; probability: number; severity: string }> = [];

  if (factors.deadlinePressure > 7) {
    likelyIssues.push({ type: "Incomplete delivery", probability: 0.4, severity: "high" });
    likelyIssues.push({ type: "Audio sync issues", probability: 0.3, severity: "medium" });
  }

  if (factors.projectComplexity > 7) {
    likelyIssues.push({ type: "Technical spec violations", probability: 0.35, severity: "high" });
  }

  if (factors.vendorScore < 70) {
    likelyIssues.push({ type: "Quality inconsistencies", probability: 0.45, severity: "medium" });
    likelyIssues.push({ type: "Translation errors", probability: 0.3, severity: "high" });
  }

  if (difficultPairs.some(pair => factors.languagePair.includes(pair.split("-")[1]))) {
    likelyIssues.push({ type: "Lip sync mismatch", probability: 0.5, severity: "medium" });
    likelyIssues.push({ type: "Subtitle timing issues", probability: 0.35, severity: "medium" });
  }

  // Generate recommendations
  const recommendations: string[] = [];

  if (overallRisk === "critical" || overallRisk === "high") {
    recommendations.push("Consider assigning a senior QC reviewer for this delivery");
    recommendations.push("Request interim deliveries for early review");
  }

  if (factors.vendorScore < 70) {
    recommendations.push("Provide detailed style guide and reference materials");
    recommendations.push("Schedule a pre-delivery check-in call");
  }

  if (factors.deadlinePressure > 7) {
    recommendations.push("Negotiate deadline extension if possible");
    recommendations.push("Prepare backup vendor for quick turnaround");
  }

  if (factors.projectComplexity > 7) {
    recommendations.push("Create detailed technical specification checklist");
    recommendations.push("Enable automated pre-delivery validation");
  }

  // Estimate revisions needed
  const estimatedRevisions = Math.round(riskScore / 25);

  return {
    overallRisk,
    riskScore: Math.round(riskScore),
    likelyIssues,
    recommendations,
    estimatedRevisions,
  };
}

// Smart workflow optimization
export interface WorkflowStep {
  id: string;
  name: string;
  assignee?: string;
  status: "pending" | "in_progress" | "completed" | "blocked";
  estimatedDuration: number; // hours
  actualDuration?: number;
  dependencies: string[];
  blockers?: string[];
}

export interface WorkflowOptimization {
  originalDuration: number;
  optimizedDuration: number;
  savings: number;
  savingsPercent: number;
  suggestions: Array<{
    type: "parallel" | "reassign" | "automate" | "skip" | "combine";
    description: string;
    impact: number; // hours saved
    confidence: number; // 0-1
  }>;
  criticalPath: string[];
  bottlenecks: string[];
}

export function optimizeWorkflow(steps: WorkflowStep[]): WorkflowOptimization {
  // Calculate original duration (sequential)
  const originalDuration = steps.reduce((sum, s) => sum + s.estimatedDuration, 0);

  const suggestions: WorkflowOptimization["suggestions"] = [];
  let optimizedDuration = originalDuration;

  // Find parallelizable steps
  const independentSteps = steps.filter(s => s.dependencies.length === 0);
  if (independentSteps.length > 1) {
    const parallelSaving = independentSteps.slice(1).reduce((sum, s) => sum + s.estimatedDuration, 0);
    suggestions.push({
      type: "parallel",
      description: `Run ${independentSteps.map(s => s.name).join(", ")} in parallel`,
      impact: parallelSaving * 0.8, // 80% efficiency for parallel work
      confidence: 0.9,
    });
    optimizedDuration -= parallelSaving * 0.8;
  }

  // Find automatable steps
  const automatableSteps = steps.filter(s => 
    s.name.toLowerCase().includes("check") || 
    s.name.toLowerCase().includes("validate") ||
    s.name.toLowerCase().includes("verify")
  );
  automatableSteps.forEach(step => {
    suggestions.push({
      type: "automate",
      description: `Automate "${step.name}" using AI QC`,
      impact: step.estimatedDuration * 0.9, // 90% time saved
      confidence: 0.85,
    });
    optimizedDuration -= step.estimatedDuration * 0.9;
  });

  // Find bottlenecks (steps that block many others)
  const bottlenecks = steps.filter(s => 
    steps.filter(other => other.dependencies.includes(s.id)).length > 2
  ).map(s => s.name);

  // Find critical path
  const criticalPath = findCriticalPath(steps);

  // Calculate savings
  const savings = originalDuration - optimizedDuration;
  const savingsPercent = Math.round((savings / originalDuration) * 100);

  return {
    originalDuration,
    optimizedDuration: Math.max(1, optimizedDuration),
    savings,
    savingsPercent,
    suggestions,
    criticalPath,
    bottlenecks,
  };
}

function findCriticalPath(steps: WorkflowStep[]): string[] {
  // Simplified critical path finding
  const sorted = topologicalSort(steps);
  const criticalPath: string[] = [];
  
  let maxDuration = 0;
  sorted.forEach(step => {
    if (step.estimatedDuration > maxDuration) {
      criticalPath.push(step.name);
      maxDuration = step.estimatedDuration;
    }
  });

  return criticalPath;
}

function topologicalSort(steps: WorkflowStep[]): WorkflowStep[] {
  const visited = new Set<string>();
  const result: WorkflowStep[] = [];

  function visit(step: WorkflowStep) {
    if (visited.has(step.id)) return;
    visited.add(step.id);

    step.dependencies.forEach(depId => {
      const dep = steps.find(s => s.id === depId);
      if (dep) visit(dep);
    });

    result.push(step);
  }

  steps.forEach(step => visit(step));
  return result;
}

// Natural language command parsing
export interface ParsedCommand {
  intent: string;
  action: string;
  entities: Record<string, string | number | boolean>;
  confidence: number;
  suggestedResponse: string;
}

export function parseNaturalLanguageCommand(input: string): ParsedCommand {
  const inputLower = input.toLowerCase();

  // Intent patterns
  const patterns = [
    { regex: /show|display|list|get|fetch/, intent: "query", action: "fetch" },
    { regex: /create|add|new|make/, intent: "create", action: "create" },
    { regex: /delete|remove|cancel/, intent: "delete", action: "delete" },
    { regex: /update|change|modify|edit/, intent: "update", action: "update" },
    { regex: /start|begin|run|execute|process/, intent: "execute", action: "start" },
    { regex: /stop|pause|halt/, intent: "control", action: "stop" },
    { regex: /assign|allocate|give/, intent: "assign", action: "assign" },
    { regex: /export|download|save/, intent: "export", action: "export" },
    { regex: /analyze|check|verify|validate/, intent: "analyze", action: "analyze" },
    { regex: /predict|forecast|estimate/, intent: "predict", action: "predict" },
    { regex: /compare|diff|difference/, intent: "compare", action: "compare" },
    { regex: /fix|repair|correct|resolve/, intent: "fix", action: "fix" },
  ];

  // Entity patterns
  const entityPatterns = [
    { regex: /project[s]?\s+(\w+)/i, entity: "project", group: 1 },
    { regex: /vendor[s]?\s+(\w+)/i, entity: "vendor", group: 1 },
    { regex: /file[s]?\s+(.+?)(?:\s+to|\s+for|$)/i, entity: "file", group: 1 },
    { regex: /(?:for|to)\s+(netflix|amazon|disney|youtube|apple|hbo)/i, entity: "platform", group: 1 },
    { regex: /(\d+)\s+(?:file|project|vendor)/i, entity: "count", group: 1 },
    { regex: /all\s+(file|project|vendor|qc)/i, entity: "scope", group: 1 },
    { regex: /(failed|passed|pending|processing)/i, entity: "status", group: 1 },
    { regex: /last\s+(\d+)\s+(day|week|month)/i, entity: "timeRange", group: 0 },
  ];

  // Find intent
  let intent = "unknown";
  let action = "unknown";
  let confidence = 0.5;

  for (const pattern of patterns) {
    if (pattern.regex.test(inputLower)) {
      intent = pattern.intent;
      action = pattern.action;
      confidence = 0.8;
      break;
    }
  }

  // Extract entities
  const entities: Record<string, string | number | boolean> = {};
  for (const pattern of entityPatterns) {
    const match = inputLower.match(pattern.regex);
    if (match) {
      entities[pattern.entity] = match[pattern.group];
      confidence = Math.min(0.95, confidence + 0.05);
    }
  }

  // Generate suggested response
  let suggestedResponse = "I'll help you with that.";
  
  if (intent === "query") {
    suggestedResponse = `Fetching ${entities.scope || "the requested"} data...`;
  } else if (intent === "analyze") {
    suggestedResponse = `Running QC analysis${entities.file ? ` on ${entities.file}` : ""}${entities.platform ? ` for ${entities.platform} compliance` : ""}...`;
  } else if (intent === "fix") {
    suggestedResponse = `Preparing auto-fix solutions for detected issues...`;
  } else if (intent === "predict") {
    suggestedResponse = `Generating quality predictions using AI analysis...`;
  }

  return {
    intent,
    action,
    entities,
    confidence,
    suggestedResponse,
  };
}

// Quality issue detection patterns (for visual diff)
export interface QualityIssue {
  type: string;
  severity: "critical" | "major" | "minor" | "info";
  timestamp?: string;
  frame?: number;
  description: string;
  autoFixable: boolean;
  fixSuggestion?: string;
}

export function analyzeQualityPatterns(results: any[]): {
  patterns: Array<{ issue: string; frequency: number; trend: string }>;
  rootCauses: string[];
  preventionSuggestions: string[];
} {
  const issueCount: Record<string, number> = {};
  
  results.forEach(result => {
    const errors = result.result?.errors || result.qc_errors || [];
    errors.forEach((error: any) => {
      const type = error.type || error.code || "unknown";
      issueCount[type] = (issueCount[type] || 0) + 1;
    });
  });

  const patterns = Object.entries(issueCount)
    .map(([issue, frequency]) => ({
      issue,
      frequency,
      trend: frequency > 5 ? "increasing" : "stable",
    }))
    .sort((a, b) => b.frequency - a.frequency);

  // Analyze root causes based on patterns
  const rootCauses: string[] = [];
  const preventionSuggestions: string[] = [];

  if (patterns.some(p => p.issue.includes("loudness"))) {
    rootCauses.push("Inconsistent audio mastering across vendors");
    preventionSuggestions.push("Provide audio level reference files to all vendors");
    preventionSuggestions.push("Enable automated loudness check before final delivery");
  }

  if (patterns.some(p => p.issue.includes("sync") || p.issue.includes("timing"))) {
    rootCauses.push("Timeline drift during editing or transcoding");
    preventionSuggestions.push("Use frame-accurate editing software");
    preventionSuggestions.push("Validate sync after each processing step");
  }

  if (patterns.some(p => p.issue.includes("resolution") || p.issue.includes("format"))) {
    rootCauses.push("Unclear technical specifications provided to vendors");
    preventionSuggestions.push("Create detailed tech spec templates for each platform");
    preventionSuggestions.push("Enable pre-flight validation before upload");
  }

  return { patterns, rootCauses, preventionSuggestions };
}

// Time estimation AI
export function estimateCompletionTime(
  projectType: string,
  contentHours: number,
  stages: string[],
  vendorCount: number
): {
  optimistic: number; // hours
  likely: number;
  pessimistic: number;
  confidence: number;
  factors: string[];
} {
  // Base time per hour of content
  const baseTimePerHour: Record<string, number> = {
    dubbing: 8,
    subtitling: 4,
    mixing: 6,
    translation: 3,
    qc: 2,
  };

  let totalOptimistic = 0;
  let totalLikely = 0;
  let totalPessimistic = 0;
  const factors: string[] = [];

  stages.forEach(stage => {
    const base = baseTimePerHour[stage.toLowerCase()] || 4;
    totalOptimistic += base * contentHours * 0.7;
    totalLikely += base * contentHours;
    totalPessimistic += base * contentHours * 1.5;
  });

  // Adjust for parallelization with multiple vendors
  if (vendorCount > 1) {
    const parallelFactor = 1 / Math.sqrt(vendorCount);
    totalOptimistic *= parallelFactor;
    totalLikely *= parallelFactor;
    totalPessimistic *= parallelFactor;
    factors.push(`Parallelized across ${vendorCount} vendors`);
  }

  // Project type complexity
  if (projectType === "film") {
    totalLikely *= 1.2;
    totalPessimistic *= 1.3;
    factors.push("Feature film complexity premium");
  }

  const confidence = vendorCount > 1 ? 0.75 : 0.85;

  return {
    optimistic: Math.round(totalOptimistic),
    likely: Math.round(totalLikely),
    pessimistic: Math.round(totalPessimistic),
    confidence,
    factors,
  };
}
