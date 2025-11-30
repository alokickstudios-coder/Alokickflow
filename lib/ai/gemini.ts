/**
 * Google Gemini AI Integration for QC Analysis
 * Uses Gemini 2.0 Flash for intelligent media quality control
 */

import { GoogleGenerativeAI, Part } from "@google/generative-ai";

// Initialize Gemini client
const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }
  return new GoogleGenerativeAI(apiKey);
};

export interface AIQCAnalysis {
  status: "passed" | "failed" | "needs_review";
  confidence: number;
  summary: string;
  issues: AIQCIssue[];
  recommendations: string[];
  metadata: {
    analyzedAt: string;
    modelVersion: string;
    processingTime: number;
  };
}

export interface AIQCIssue {
  type: string;
  severity: "critical" | "major" | "minor" | "info";
  description: string;
  timestamp?: number;
  timecode?: string;
  suggestion?: string;
}

// QC criteria types
export type QCCriteria = 
  | "audio_missing"
  | "missing_dialogue"
  | "lip_sync"
  | "loudness_mix"
  | "subtitle_errors"
  | "video_glitches"
  | "missing_bgm"
  | "visual_quality"
  | "content_compliance";

/**
 * Analyze subtitle/SRT file for errors
 */
export async function analyzeSubtitles(srtContent: string): Promise<AIQCAnalysis> {
  const startTime = Date.now();
  const genAI = getGeminiClient();
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

  const prompt = `You are an expert subtitle QC analyst. Analyze this SRT subtitle file for the following issues:

1. Timing errors (subtitles too short <1s or too long >7s)
2. Overlapping subtitles
3. Missing subtitle numbers or malformed entries
4. Reading speed issues (>20 characters per second)
5. Line length issues (>42 characters per line)
6. Formatting errors (excessive line breaks, missing punctuation)
7. Language/grammar issues
8. Inconsistent styling or capitalization
9. Gap issues (too short gaps between subtitles <100ms)
10. Encoding issues or special character problems

Provide your analysis in the following JSON format:
{
  "status": "passed" | "failed" | "needs_review",
  "confidence": 0-100,
  "summary": "Brief summary of the analysis",
  "issues": [
    {
      "type": "Issue category",
      "severity": "critical" | "major" | "minor" | "info",
      "description": "Detailed description",
      "timestamp": timestamp_in_seconds_if_applicable,
      "timecode": "HH:MM:SS,mmm if applicable",
      "suggestion": "How to fix this issue"
    }
  ],
  "recommendations": ["List of general recommendations"]
}

SRT Content to analyze:
${srtContent.substring(0, 50000)}`;

  try {
    const result = await model.generateContent(prompt);
    const response = result.response.text();
    
    // Parse JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Invalid AI response format");
    }

    const analysis = JSON.parse(jsonMatch[0]);
    
    return {
      ...analysis,
      metadata: {
        analyzedAt: new Date().toISOString(),
        modelVersion: "gemini-2.0-flash-exp",
        processingTime: Date.now() - startTime,
      },
    };
  } catch (error: any) {
    console.error("Gemini subtitle analysis error:", error);
    return {
      status: "needs_review",
      confidence: 0,
      summary: "AI analysis failed - manual review required",
      issues: [{
        type: "Analysis Error",
        severity: "critical",
        description: error.message || "Failed to analyze subtitles",
      }],
      recommendations: ["Manual review recommended"],
      metadata: {
        analyzedAt: new Date().toISOString(),
        modelVersion: "gemini-2.0-flash-exp",
        processingTime: Date.now() - startTime,
      },
    };
  }
}

/**
 * Analyze video frame samples for visual quality issues
 */
export async function analyzeVideoFrames(
  frameBase64Images: string[],
  audioAnalysisData?: any
): Promise<AIQCAnalysis> {
  const startTime = Date.now();
  const genAI = getGeminiClient();
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

  // Prepare image parts
  const imageParts: Part[] = frameBase64Images.slice(0, 10).map((base64, index) => ({
    inlineData: {
      mimeType: "image/jpeg",
      data: base64,
    },
  }));

  const prompt = `You are an expert video QC analyst for post-production. Analyze these video frames for quality issues:

1. Visual glitches (artifacts, corruption, macroblocking)
2. Color issues (banding, clipping, incorrect levels)
3. Resolution/sharpness problems
4. Frame composition issues
5. Black frames or flash frames
6. Interlacing artifacts
7. Compression artifacts
8. Letterboxing/pillarboxing issues
9. Text/graphics quality
10. Overall visual quality assessment

${audioAnalysisData ? `Audio Analysis Data: ${JSON.stringify(audioAnalysisData)}` : ""}

Provide your analysis in the following JSON format:
{
  "status": "passed" | "failed" | "needs_review",
  "confidence": 0-100,
  "summary": "Brief summary of the visual quality",
  "issues": [
    {
      "type": "Issue category",
      "severity": "critical" | "major" | "minor" | "info",
      "description": "Detailed description",
      "suggestion": "How to fix this issue"
    }
  ],
  "recommendations": ["List of general recommendations"]
}`;

  try {
    const result = await model.generateContent([prompt, ...imageParts]);
    const response = result.response.text();
    
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Invalid AI response format");
    }

    const analysis = JSON.parse(jsonMatch[0]);
    
    return {
      ...analysis,
      metadata: {
        analyzedAt: new Date().toISOString(),
        modelVersion: "gemini-2.0-flash-exp",
        processingTime: Date.now() - startTime,
      },
    };
  } catch (error: any) {
    console.error("Gemini video analysis error:", error);
    return {
      status: "needs_review",
      confidence: 0,
      summary: "AI analysis failed - manual review required",
      issues: [{
        type: "Analysis Error",
        severity: "critical",
        description: error.message || "Failed to analyze video frames",
      }],
      recommendations: ["Manual review recommended"],
      metadata: {
        analyzedAt: new Date().toISOString(),
        modelVersion: "gemini-2.0-flash-exp",
        processingTime: Date.now() - startTime,
      },
    };
  }
}

/**
 * Analyze audio for QC issues (using extracted audio metadata)
 */
export async function analyzeAudioData(
  audioMetadata: {
    duration: number;
    channels: number;
    sampleRate: number;
    bitRate?: number;
    codec: string;
    peakLevels?: number[];
    silenceRanges?: { start: number; end: number }[];
    loudnessLUFS?: number;
  }
): Promise<AIQCAnalysis> {
  const startTime = Date.now();
  const genAI = getGeminiClient();
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

  const prompt = `You are an expert audio QC analyst for post-production. Analyze this audio metadata for quality issues:

Audio Metadata:
${JSON.stringify(audioMetadata, null, 2)}

Check for these issues:
1. Missing audio or silent sections
2. Loudness compliance (EBU R128: -23 LUFS target)
3. Channel configuration issues
4. Sample rate and bit depth adequacy
5. Clipping or distortion indicators
6. Extended silence that might indicate missing dialogue
7. Audio/video sync potential issues
8. Codec quality issues
9. Missing BGM indicators
10. Overall audio quality assessment

Provide your analysis in the following JSON format:
{
  "status": "passed" | "failed" | "needs_review",
  "confidence": 0-100,
  "summary": "Brief summary of the audio quality",
  "issues": [
    {
      "type": "Issue category",
      "severity": "critical" | "major" | "minor" | "info",
      "description": "Detailed description",
      "timestamp": timestamp_in_seconds_if_applicable,
      "suggestion": "How to fix this issue"
    }
  ],
  "recommendations": ["List of general recommendations"]
}`;

  try {
    const result = await model.generateContent(prompt);
    const response = result.response.text();
    
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Invalid AI response format");
    }

    const analysis = JSON.parse(jsonMatch[0]);
    
    return {
      ...analysis,
      metadata: {
        analyzedAt: new Date().toISOString(),
        modelVersion: "gemini-2.0-flash-exp",
        processingTime: Date.now() - startTime,
      },
    };
  } catch (error: any) {
    console.error("Gemini audio analysis error:", error);
    return {
      status: "needs_review",
      confidence: 0,
      summary: "AI analysis failed - manual review required",
      issues: [{
        type: "Analysis Error",
        severity: "critical",
        description: error.message || "Failed to analyze audio",
      }],
      recommendations: ["Manual review recommended"],
      metadata: {
        analyzedAt: new Date().toISOString(),
        modelVersion: "gemini-2.0-flash-exp",
        processingTime: Date.now() - startTime,
      },
    };
  }
}

/**
 * Comprehensive QC analysis combining all checks
 */
export async function runComprehensiveQC(params: {
  subtitleContent?: string;
  videoFrames?: string[];
  audioMetadata?: any;
  ffmpegReport?: any;
}): Promise<AIQCAnalysis> {
  const startTime = Date.now();
  const analyses: AIQCAnalysis[] = [];

  // Run all applicable analyses in parallel
  const promises: Promise<AIQCAnalysis>[] = [];

  if (params.subtitleContent) {
    promises.push(analyzeSubtitles(params.subtitleContent));
  }

  if (params.videoFrames && params.videoFrames.length > 0) {
    promises.push(analyzeVideoFrames(params.videoFrames, params.audioMetadata));
  }

  if (params.audioMetadata) {
    promises.push(analyzeAudioData(params.audioMetadata));
  }

  const results = await Promise.allSettled(promises);
  
  results.forEach((result) => {
    if (result.status === "fulfilled") {
      analyses.push(result.value);
    }
  });

  // Combine analyses
  const allIssues = analyses.flatMap((a) => a.issues);
  const criticalIssues = allIssues.filter((i) => i.severity === "critical");
  const majorIssues = allIssues.filter((i) => i.severity === "major");

  // Determine overall status
  let status: "passed" | "failed" | "needs_review" = "passed";
  if (criticalIssues.length > 0) {
    status = "failed";
  } else if (majorIssues.length > 0) {
    status = "needs_review";
  }

  // Calculate average confidence
  const avgConfidence = analyses.length > 0
    ? Math.round(analyses.reduce((sum, a) => sum + a.confidence, 0) / analyses.length)
    : 0;

  // Combine recommendations
  const allRecommendations = [...new Set(analyses.flatMap((a) => a.recommendations))];

  return {
    status,
    confidence: avgConfidence,
    summary: generateSummary(status, criticalIssues.length, majorIssues.length, allIssues.length),
    issues: allIssues,
    recommendations: allRecommendations,
    metadata: {
      analyzedAt: new Date().toISOString(),
      modelVersion: "gemini-2.0-flash-exp",
      processingTime: Date.now() - startTime,
    },
  };
}

function generateSummary(
  status: string,
  criticalCount: number,
  majorCount: number,
  totalCount: number
): string {
  if (status === "passed") {
    return "All quality checks passed. Content is ready for delivery.";
  }
  
  if (status === "failed") {
    return `QC failed with ${criticalCount} critical issue(s). Immediate attention required.`;
  }
  
  return `QC needs review. Found ${majorCount} major and ${totalCount - majorCount - criticalCount} minor issues.`;
}

/**
 * Analyze Google Drive files for QC (using Drive API)
 */
export async function analyzeGoogleDriveFile(
  accessToken: string,
  fileId: string
): Promise<{ canAnalyze: boolean; fileType: string; downloadUrl?: string }> {
  try {
    // Get file metadata
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,size`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error("Failed to fetch file metadata");
    }

    const file = await response.json();
    
    const videoTypes = ["video/mp4", "video/quicktime", "video/x-msvideo", "video/webm"];
    const subtitleTypes = ["text/plain", "application/x-subrip", "text/vtt"];

    if (videoTypes.includes(file.mimeType)) {
      return {
        canAnalyze: true,
        fileType: "video",
        downloadUrl: `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      };
    }

    if (subtitleTypes.includes(file.mimeType) || file.name.endsWith(".srt") || file.name.endsWith(".vtt")) {
      return {
        canAnalyze: true,
        fileType: "subtitle",
        downloadUrl: `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      };
    }

    return {
      canAnalyze: false,
      fileType: file.mimeType,
    };
  } catch (error: any) {
    console.error("Error analyzing Google Drive file:", error);
    return {
      canAnalyze: false,
      fileType: "unknown",
    };
  }
}

