/**
 * Groq SPI (Creative Analysis) Provider
 * 
 * Fallback provider using Groq's LLaMA/Mixtral models for creative analysis.
 * Used when DeepSeek is not configured.
 * 
 * Environment Variables:
 * - GROQ_API_KEY: Your Groq API key (required)
 */

import {
  SpiProvider,
  SpiAnalysisContext,
  SpiAnalysisResult,
} from "./types";
import {
  CREATIVE_QC_PARAMETERS,
  CreativeQCParameterResult,
  CreativeQCSettings,
  calculateOverallCreativeScore,
  calculateOverallRiskScore,
  calculateBrandFitScore,
} from "@/config/creativeQcConfig";

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_BASE = "https://api.groq.com/openai/v1";
const GROQ_MODEL = "llama-3.3-70b-versatile"; // Most capable model for analysis
const GROQ_TIMEOUT_MS = 120000;

/**
 * Build the analysis prompt for Groq
 */
function buildAnalysisPrompt(context: SpiAnalysisContext, settings?: CreativeQCSettings): string {
  const parameterDescriptions = CREATIVE_QC_PARAMETERS.map((p) => {
    const direction = p.direction === 'higher_is_risk' 
      ? 'Higher score = MORE RISK (bad)' 
      : 'Higher score = BETTER';
    return `  "${p.key}": ${p.label} - ${p.description} [${direction}]`;
  }).join('\n');

  let contextSection = '';
  if (context.metadata) {
    const m = context.metadata;
    contextSection = `
## CONTENT CONTEXT
- Project/Series: ${m.projectName || m.seriesName || 'Unknown'}
- Episode: ${m.episodeNumber || 'N/A'}
- Language: ${m.language || 'Unknown'}
- Genre: ${m.genre || 'Not specified'}
- Target Audience: ${m.targetAudience || settings?.targetAudience || 'General audience'}
- Platform Type: ${m.platformType || settings?.platformType || 'long_form'}
- Duration: ${m.duration ? `${Math.round(m.duration / 60)} minutes` : 'Unknown'}
${m.brandGuidelines || settings?.brandGuidelines ? `- Brand Guidelines: ${m.brandGuidelines || settings?.brandGuidelines}` : ''}
`;
  }

  let audioSection = '';
  if (context.audioAnalysis) {
    const a = context.audioAnalysis;
    audioSection = `
## AUDIO ANALYSIS DATA
- Has Dialogue: ${a.hasDialogue ? 'Yes' : 'No'}
- Has Background Music: ${a.hasBGM ? 'Yes' : 'No'}
${a.loudnessLUFS !== undefined ? `- Loudness: ${a.loudnessLUFS.toFixed(1)} LUFS` : ''}
${a.silencePercentage !== undefined ? `- Silence: ${a.silencePercentage.toFixed(1)}%` : ''}
`;
  }

  return `You are an expert creative analyst for media quality assessment in post-production workflows.

Analyze the provided transcript and evaluate it across all creative dimensions.
You MUST respond with ONLY valid JSON - no markdown, no explanation, just the JSON object.

${contextSection}
${audioSection}

## CREATIVE QC PARAMETERS TO EVALUATE

For each parameter, provide a score (0-100) and brief explanation:

${parameterDescriptions}

## TRANSCRIPT TO ANALYZE

${context.transcript.substring(0, 25000)}

${context.subtitleContent ? `
## SUBTITLE CONTENT

${context.subtitleContent.substring(0, 8000)}
` : ''}

## REQUIRED JSON OUTPUT FORMAT

{
  "parameters": {
    "narrative_arc": { "score": <0-100>, "explanation": "<brief reason>" },
    "clarity_of_premise": { "score": <0-100>, "explanation": "<brief reason>" },
    "pacing_rhythm": { "score": <0-100>, "explanation": "<brief reason>" },
    "hook_strength": { "score": <0-100>, "explanation": "<brief reason>" },
    "structural_coherence": { "score": <0-100>, "explanation": "<brief reason>" },
    "ending_resolution": { "score": <0-100>, "explanation": "<brief reason>" },
    "character_depth": { "score": <0-100>, "explanation": "<brief reason>" },
    "character_consistency": { "score": <0-100>, "explanation": "<brief reason>" },
    "dialogue_naturalness": { "score": <0-100>, "explanation": "<brief reason>" },
    "voice_consistency": { "score": <0-100>, "explanation": "<brief reason>" },
    "emotional_intensity": { "score": <0-100>, "explanation": "<brief reason>" },
    "emotional_variability": { "score": <0-100>, "explanation": "<brief reason>" },
    "empathy_alignment": { "score": <0-100>, "explanation": "<brief reason>" },
    "suspense_tension": { "score": <0-100>, "explanation": "<brief reason>" },
    "humour_delivery": { "score": <0-100>, "explanation": "<brief reason>" },
    "relatability": { "score": <0-100>, "explanation": "<brief reason>" },
    "target_audience_fit": { "score": <0-100>, "explanation": "<brief reason>" },
    "platform_format_fit": { "score": <0-100>, "explanation": "<brief reason>" },
    "scroll_stopping_power": { "score": <0-100>, "explanation": "<brief reason>" },
    "retention_potential": { "score": <0-100>, "explanation": "<brief reason>" },
    "brand_voice_match": { "score": <0-100>, "explanation": "<brief reason>" },
    "message_clarity": { "score": <0-100>, "explanation": "<brief reason>" },
    "call_to_action_clarity": { "score": <0-100>, "explanation": "<brief reason>" },
    "credibility_trust": { "score": <0-100>, "explanation": "<brief reason>" },
    "safety_sensitivity_risk": { "score": <0-100>, "explanation": "<higher = more risky>" },
    "toxicity_risk": { "score": <0-100>, "explanation": "<higher = more risky>" },
    "misleading_claims_risk": { "score": <0-100>, "explanation": "<higher = more risky>" },
    "brand_safety_overall": { "score": <0-100>, "explanation": "<higher = safer>" },
    "audio_clarity_perception": { "score": <0-100>, "explanation": "<brief reason>" },
    "music_mood_alignment": { "score": <0-100>, "explanation": "<brief reason>" },
    "sound_design_impact": { "score": <0-100>, "explanation": "<brief reason>" },
    "visual_composition_perception": { "score": <0-100>, "explanation": "<brief reason>" },
    "edit_flow_smoothness": { "score": <0-100>, "explanation": "<brief reason>" }
  },
  "summary": "<2-3 sentence overall creative assessment>",
  "recommendations": ["<actionable recommendation 1>", "<recommendation 2>", "<recommendation 3>"],
  "detected_emotions": ["<primary emotion>", "<secondary>", "<tertiary>"],
  "detected_themes": ["<main theme>", "<secondary theme>"],
  "content_type": "<narrative|educational|promotional|documentary|entertainment|other>",
  "quality_grade": "<A|B|C|D|F>",
  "production_ready": <true|false>,
  "critical_issues": ["<any critical issues that must be fixed>"]
}

Respond with ONLY the JSON object.`;
}

/**
 * Parse Groq response into structured result
 */
function parseGroqResponse(
  responseText: string,
  startTime: number
): SpiAnalysisResult {
  try {
    let jsonStr = responseText.trim();
    
    // Remove markdown code blocks if present
    if (jsonStr.startsWith("```json")) {
      jsonStr = jsonStr.slice(7);
    } else if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.slice(3);
    }
    if (jsonStr.endsWith("```")) {
      jsonStr = jsonStr.slice(0, -3);
    }
    jsonStr = jsonStr.trim();

    // Find JSON object
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No valid JSON found in response");
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const parameters: Record<string, CreativeQCParameterResult> = {};

    for (const param of CREATIVE_QC_PARAMETERS) {
      const aiResult = parsed.parameters?.[param.key];
      
      let score = 50;
      if (aiResult && typeof aiResult.score === "number") {
        score = Math.min(100, Math.max(0, Math.round(aiResult.score)));
      }

      parameters[param.key] = {
        key: param.key,
        label: param.label,
        category: param.category,
        score,
        explanation: aiResult?.explanation || "Unable to evaluate.",
        direction: param.direction,
      };
    }

    const overallCreativeScore = calculateOverallCreativeScore(parameters);
    const overallRiskScore = calculateOverallRiskScore(parameters);
    const overallBrandFitScore = calculateBrandFitScore(parameters);

    return {
      status: "completed",
      overallCreativeScore,
      overallRiskScore,
      overallBrandFitScore,
      parameters,
      summary: parsed.summary || "Creative analysis completed.",
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
      detectedEmotions: Array.isArray(parsed.detected_emotions) ? parsed.detected_emotions : [],
      detectedThemes: Array.isArray(parsed.detected_themes) ? parsed.detected_themes : [],
      contentType: parsed.content_type,
      rawResponse: {
        ...parsed,
        quality_grade: parsed.quality_grade,
        production_ready: parsed.production_ready,
        critical_issues: parsed.critical_issues,
      },
      provider: "groq",
      processingTimeMs: Date.now() - startTime,
    };
  } catch (error: any) {
    console.error("[GroqSPI] Error parsing response:", error);
    throw new Error(`Failed to parse response: ${error.message}`);
  }
}

export class GroqSpiProvider implements SpiProvider {
  readonly name = "groq-llama";

  isConfigured(): boolean {
    return !!GROQ_API_KEY;
  }

  async analyze(
    context: SpiAnalysisContext,
    settings?: CreativeQCSettings
  ): Promise<SpiAnalysisResult> {
    const startTime = Date.now();

    if (!this.isConfigured()) {
      throw new Error("Groq is not configured. Please set GROQ_API_KEY.");
    }

    if (!context.transcript || context.transcript.trim().length < 50) {
      return {
        status: "failed",
        overallCreativeScore: 0,
        overallRiskScore: 0,
        overallBrandFitScore: 0,
        parameters: {},
        summary: "Insufficient transcript content for analysis.",
        recommendations: ["Ensure content has speech or subtitles."],
        error: "Transcript too short",
        provider: this.name,
        processingTimeMs: Date.now() - startTime,
      };
    }

    console.log(`[GroqSPI] Starting analysis, transcript: ${context.transcript.length} chars`);

    const prompt = buildAnalysisPrompt(context, settings);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), GROQ_TIMEOUT_MS);

      const response = await fetch(`${GROQ_API_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [
            { role: "system", content: "You are a creative media analyst. Respond with ONLY valid JSON." },
            { role: "user", content: prompt }
          ],
          temperature: 0.3,
          max_tokens: 8192,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Groq API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const assistantMessage = data.choices?.[0]?.message?.content;

      if (!assistantMessage) {
        throw new Error("No response from Groq");
      }

      console.log(`[GroqSPI] Received response, parsing...`);
      return parseGroqResponse(assistantMessage, startTime);

    } catch (error: any) {
      if (error.name === "AbortError") {
        return {
          status: "failed",
          overallCreativeScore: 0,
          overallRiskScore: 0,
          overallBrandFitScore: 0,
          parameters: {},
          summary: "Analysis timed out.",
          recommendations: ["Try with shorter content."],
          error: "Timeout",
          provider: this.name,
          processingTimeMs: Date.now() - startTime,
        };
      }

      console.error(`[GroqSPI] Analysis failed:`, error);
      return {
        status: "failed",
        overallCreativeScore: 0,
        overallRiskScore: 0,
        overallBrandFitScore: 0,
        parameters: {},
        summary: "Creative QC analysis failed.",
        recommendations: ["Check API configuration."],
        error: error.message,
        provider: this.name,
        processingTimeMs: Date.now() - startTime,
      };
    }
  }
}

export const groqSpiProvider = new GroqSpiProvider();
