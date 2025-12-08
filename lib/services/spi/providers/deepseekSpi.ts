/**
 * DeepSeek SPI (Creative Analysis) Provider
 * 
 * Uses DeepSeek-R1 or DeepSeek-V3 for creative/emotional analysis.
 * DeepSeek provides an OpenAI-compatible chat completions API.
 * 
 * Environment Variables:
 * - DEEPSEEK_API_KEY: Your DeepSeek API key (required)
 * - DEEPSEEK_API_BASE: API base URL (optional, defaults to https://api.deepseek.com/v1)
 * - DEEPSEEK_MODEL_NAME: Model name (optional, defaults to deepseek-chat)
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

// Environment configuration
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_API_BASE = process.env.DEEPSEEK_API_BASE || "https://api.deepseek.com/v1";
const DEEPSEEK_MODEL_NAME = process.env.DEEPSEEK_MODEL_NAME || "deepseek-chat";

// Timeout for DeepSeek API calls (2 minutes)
const DEEPSEEK_TIMEOUT_MS = parseInt(process.env.DEEPSEEK_TIMEOUT_MS || "120000", 10);

/**
 * Build the analysis prompt for DeepSeek
 * 
 * This prompt is designed to get structured JSON output with scores
 * and explanations for all Creative QC parameters.
 */
function buildAnalysisPrompt(context: SpiAnalysisContext, settings?: CreativeQCSettings): string {
  // Build parameter descriptions for the prompt
  const parameterDescriptions = CREATIVE_QC_PARAMETERS.map((p) => {
    const direction = p.direction === 'higher_is_risk' 
      ? 'Higher score = MORE RISK (bad)' 
      : 'Higher score = BETTER';
    return `  "${p.key}": ${p.label} - ${p.description} [${direction}]`;
  }).join('\n');

  // Build context section
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

  // Build audio analysis section if available
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

  return `You are an expert creative analyst specializing in media quality assessment for post-production workflows.

Your task is to analyze the provided transcript and evaluate it across multiple creative dimensions.
You MUST respond with ONLY valid JSON - no other text, no markdown code blocks, just pure JSON.

${contextSection}
${audioSection}

## CREATIVE QC PARAMETERS TO EVALUATE

For each parameter below, provide a score from 0-100 and a brief explanation (1-2 sentences):

${parameterDescriptions}

## TRANSCRIPT TO ANALYZE

${context.transcript.substring(0, 30000)}

${context.subtitleContent ? `
## SUBTITLE CONTENT

${context.subtitleContent.substring(0, 10000)}
` : ''}

## INSTRUCTIONS

1. Analyze the content carefully for each creative dimension.
2. For RISK parameters (safety_sensitivity_risk, toxicity_risk, misleading_claims_risk), a HIGHER score means MORE RISK/DANGER.
3. For all other parameters, a HIGHER score means BETTER quality.
4. If you cannot evaluate a parameter due to insufficient content, give a score of 50 and explain why.
5. Provide an overall summary and top 3 actionable recommendations.
6. Detect key emotions and themes in the content.

## REQUIRED OUTPUT FORMAT (JSON ONLY)

{
  "parameters": {
    "narrative_arc": { "score": <0-100>, "explanation": "<why this score>" },
    "clarity_of_premise": { "score": <0-100>, "explanation": "<why this score>" },
    "pacing_rhythm": { "score": <0-100>, "explanation": "<why this score>" },
    "hook_strength": { "score": <0-100>, "explanation": "<why this score>" },
    "structural_coherence": { "score": <0-100>, "explanation": "<why this score>" },
    "ending_resolution": { "score": <0-100>, "explanation": "<why this score>" },
    "character_depth": { "score": <0-100>, "explanation": "<why this score>" },
    "character_consistency": { "score": <0-100>, "explanation": "<why this score>" },
    "dialogue_naturalness": { "score": <0-100>, "explanation": "<why this score>" },
    "voice_consistency": { "score": <0-100>, "explanation": "<why this score>" },
    "emotional_intensity": { "score": <0-100>, "explanation": "<why this score>" },
    "emotional_variability": { "score": <0-100>, "explanation": "<why this score>" },
    "empathy_alignment": { "score": <0-100>, "explanation": "<why this score>" },
    "suspense_tension": { "score": <0-100>, "explanation": "<why this score>" },
    "humour_delivery": { "score": <0-100>, "explanation": "<why this score>" },
    "relatability": { "score": <0-100>, "explanation": "<why this score>" },
    "target_audience_fit": { "score": <0-100>, "explanation": "<why this score>" },
    "platform_format_fit": { "score": <0-100>, "explanation": "<why this score>" },
    "scroll_stopping_power": { "score": <0-100>, "explanation": "<why this score>" },
    "retention_potential": { "score": <0-100>, "explanation": "<why this score>" },
    "brand_voice_match": { "score": <0-100>, "explanation": "<why this score>" },
    "message_clarity": { "score": <0-100>, "explanation": "<why this score>" },
    "call_to_action_clarity": { "score": <0-100>, "explanation": "<why this score>" },
    "credibility_trust": { "score": <0-100>, "explanation": "<why this score>" },
    "safety_sensitivity_risk": { "score": <0-100>, "explanation": "<why this score - higher = more risky>" },
    "toxicity_risk": { "score": <0-100>, "explanation": "<why this score - higher = more risky>" },
    "misleading_claims_risk": { "score": <0-100>, "explanation": "<why this score - higher = more risky>" },
    "brand_safety_overall": { "score": <0-100>, "explanation": "<why this score>" },
    "audio_clarity_perception": { "score": <0-100>, "explanation": "<why this score>" },
    "music_mood_alignment": { "score": <0-100>, "explanation": "<why this score>" },
    "sound_design_impact": { "score": <0-100>, "explanation": "<why this score>" },
    "visual_composition_perception": { "score": <0-100>, "explanation": "<why this score>" },
    "edit_flow_smoothness": { "score": <0-100>, "explanation": "<why this score>" }
  },
  "summary": "<2-3 sentence overall creative assessment>",
  "recommendations": ["<recommendation 1>", "<recommendation 2>", "<recommendation 3>"],
  "detected_emotions": ["<emotion1>", "<emotion2>", "<emotion3>"],
  "detected_themes": ["<theme1>", "<theme2>", "<theme3>"],
  "content_type": "<narrative|educational|promotional|documentary|entertainment|other>"
}

Respond with ONLY the JSON object above, no other text.`;
}

/**
 * Parse DeepSeek response into structured result
 * 
 * The response should be a JSON object matching the format specified in the prompt.
 * We parse it and validate/transform into our internal CreativeQCParameterResult format.
 */
function parseDeepSeekResponse(
  responseText: string,
  context: SpiAnalysisContext,
  startTime: number
): SpiAnalysisResult {
  try {
    // Try to extract JSON from response (handle potential markdown code blocks)
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

    // Try to find JSON object in response
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No valid JSON found in DeepSeek response");
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Build parameters map with proper typing
    const parameters: Record<string, CreativeQCParameterResult> = {};

    for (const param of CREATIVE_QC_PARAMETERS) {
      const aiResult = parsed.parameters?.[param.key];
      
      // Validate and clamp score
      let score = 50; // Default
      if (aiResult && typeof aiResult.score === "number") {
        score = Math.min(100, Math.max(0, Math.round(aiResult.score)));
      }

      parameters[param.key] = {
        key: param.key,
        label: param.label,
        category: param.category,
        score,
        explanation: aiResult?.explanation || "Unable to evaluate this parameter.",
        direction: param.direction,
      };
    }

    // Calculate overall scores using our scoring functions
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
      rawResponse: parsed,
      provider: "deepseek",
      processingTimeMs: Date.now() - startTime,
    };
  } catch (error: any) {
    console.error("[DeepSeekSPI] Error parsing response:", error);
    console.error("[DeepSeekSPI] Raw response:", responseText.substring(0, 500));
    throw new Error(`Failed to parse DeepSeek response: ${error.message}`);
  }
}

export class DeepSeekSpiProvider implements SpiProvider {
  readonly name = "deepseek";

  /**
   * Check if the provider is properly configured
   */
  isConfigured(): boolean {
    return !!DEEPSEEK_API_KEY;
  }

  /**
   * Run creative/emotional analysis using DeepSeek
   */
  async analyze(
    context: SpiAnalysisContext,
    settings?: CreativeQCSettings
  ): Promise<SpiAnalysisResult> {
    const startTime = Date.now();

    if (!this.isConfigured()) {
      throw new Error(
        "DeepSeek is not configured. Please set DEEPSEEK_API_KEY environment variable."
      );
    }

    // Validate input
    if (!context.transcript || context.transcript.trim().length < 50) {
      return {
        status: "failed",
        overallCreativeScore: 0,
        overallRiskScore: 0,
        overallBrandFitScore: 0,
        parameters: {},
        summary: "Insufficient transcript content for Creative QC analysis.",
        recommendations: ["Ensure content has at least 50 characters of transcript."],
        error: "Transcript too short for meaningful analysis",
        provider: this.name,
        processingTimeMs: Date.now() - startTime,
      };
    }

    console.log(`[DeepSeekSPI] Starting analysis for job ${context.jobId}`);
    console.log(`[DeepSeekSPI] Using model: ${DEEPSEEK_MODEL_NAME}`);
    console.log(`[DeepSeekSPI] Transcript length: ${context.transcript.length} chars`);

    // Build the prompt
    const prompt = buildAnalysisPrompt(context, settings);

    // Prepare API request
    const apiUrl = `${DEEPSEEK_API_BASE}/chat/completions`;
    
    const requestBody = {
      model: DEEPSEEK_MODEL_NAME,
      messages: [
        {
          role: "system",
          content: "You are a creative content analyst. You MUST respond with ONLY valid JSON, no other text or formatting."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.3, // Lower temperature for more consistent analysis
      max_tokens: 8192,
      response_format: { type: "json_object" }, // Request JSON response if supported
    };

    try {
      // Set up timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), DEEPSEEK_TIMEOUT_MS);

      console.log(`[DeepSeekSPI] Calling DeepSeek API...`);

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[DeepSeekSPI] API error: ${response.status} - ${errorText}`);
        throw new Error(`DeepSeek API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      
      // Extract the assistant's message content
      const assistantMessage = data.choices?.[0]?.message?.content;
      
      if (!assistantMessage) {
        throw new Error("No response content from DeepSeek");
      }

      console.log(`[DeepSeekSPI] Received response, parsing...`);

      // Parse and return structured result
      return parseDeepSeekResponse(assistantMessage, context, startTime);

    } catch (error: any) {
      if (error.name === "AbortError") {
        console.error(`[DeepSeekSPI] Request timed out after ${DEEPSEEK_TIMEOUT_MS}ms`);
        return {
          status: "failed",
          overallCreativeScore: 0,
          overallRiskScore: 0,
          overallBrandFitScore: 0,
          parameters: {},
          summary: "Creative QC analysis timed out.",
          recommendations: ["Try again with a shorter transcript."],
          error: `Analysis timed out after ${DEEPSEEK_TIMEOUT_MS / 1000} seconds`,
          provider: this.name,
          processingTimeMs: Date.now() - startTime,
        };
      }

      console.error(`[DeepSeekSPI] Analysis failed:`, error);
      
      return {
        status: "failed",
        overallCreativeScore: 0,
        overallRiskScore: 0,
        overallBrandFitScore: 0,
        parameters: {},
        summary: "Creative QC analysis failed.",
        recommendations: ["Check your DeepSeek API configuration and try again."],
        error: error.message || "Unknown error during Creative QC analysis",
        provider: this.name,
        processingTimeMs: Date.now() - startTime,
      };
    }
  }
}

// Export singleton instance
export const deepseekSpiProvider = new DeepSeekSpiProvider();

