/**
 * Semantic Provenance Intelligence (SPI) Engine
 * 
 * Core engine for Creative QC analysis using pluggable providers.
 * 
 * DEFAULT PROVIDERS:
 * - Transcription: Groq Whisper (GROQ_API_KEY)
 * - SPI Analysis: DeepSeek (DEEPSEEK_API_KEY)
 * 
 * This engine does NOT use Gemini. All analysis is done via Groq + DeepSeek.
 * 
 * ENTERPRISE ONLY - Beta Feature
 */

import {
  getTranscriptionProvider,
  getSpiProvider,
  isProviderConfigured,
  getProviderStatus,
  TranscriptionJobContext,
  SpiAnalysisContext,
} from "./providers";
import {
  CreativeQCResult,
  CreativeQCSettings,
  DEFAULT_CREATIVE_QC_SETTINGS,
} from "@/config/creativeQcConfig";

/**
 * Input for SPI analysis - accepts various content types
 */
export interface SPIAnalysisInput {
  jobId: string;
  
  // Content sources (at least one required)
  transcript?: string;          // Pre-existing transcript
  subtitleContent?: string;     // SRT/VTT subtitle content
  mediaFilePath?: string;       // Local file path to transcribe
  mediaFileUrl?: string;        // Remote URL to transcribe
  mediaFileBuffer?: Buffer;     // Raw file buffer to transcribe
  mediaMimeType?: string;       // MIME type hint
  
  // Context for better analysis
  context?: {
    projectName?: string;
    seriesName?: string;
    episodeNumber?: number;
    language?: string;
    genre?: string;
    targetAudience?: string;
    brandGuidelines?: string;
    platformType?: 'long_form' | 'short_form' | 'episodic' | 'social' | 'corporate';
    duration?: number;
  };
  
  // Audio analysis data from technical QC
  audioAnalysis?: {
    hasDialogue: boolean;
    hasBGM: boolean;
    loudnessLUFS?: number;
    silencePercentage?: number;
  };
}

/**
 * Extract transcript from SRT subtitle content
 */
export function extractTranscriptFromSubtitles(srtContent: string): string {
  const lines = srtContent.split('\n');
  const textLines: string[] = [];
  let inTextBlock = false;
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Skip empty lines
    if (!trimmed) {
      inTextBlock = false;
      continue;
    }
    
    // Skip sequence numbers
    if (/^\d+$/.test(trimmed)) {
      continue;
    }
    
    // Skip timecodes
    if (/^\d{2}:\d{2}:\d{2}[,\.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,\.]\d{3}/.test(trimmed)) {
      inTextBlock = true;
      continue;
    }
    
    // Collect text lines
    if (inTextBlock || textLines.length > 0) {
      // Remove HTML tags and formatting
      const cleanText = trimmed
        .replace(/<[^>]*>/g, '')
        .replace(/\{[^}]*\}/g, '')
        .trim();
      if (cleanText) {
        textLines.push(cleanText);
      }
    }
  }
  
  return textLines.join(' ');
}

/**
 * Run Creative QC analysis
 * 
 * This is the main entry point for Creative QC.
 * It handles transcription (if needed) and then runs SPI analysis.
 * 
 * Pipeline:
 * 1. If media file provided and no transcript → Use Groq Whisper to transcribe
 * 2. If subtitles provided and no transcript → Extract text from subtitles
 * 3. Run DeepSeek SPI analysis on transcript
 * 4. Return structured Creative QC results
 */
export async function runCreativeQCAnalysis(
  input: SPIAnalysisInput,
  settings?: CreativeQCSettings
): Promise<CreativeQCResult> {
  const startTime = Date.now();
  
  console.log(`[SPI Engine] Starting Creative QC for job ${input.jobId}`);

  // Check provider configuration
  const providerCheck = isProviderConfigured();
  if (!providerCheck.configured) {
    console.error(`[SPI Engine] Missing providers: ${providerCheck.missing.join(', ')}`);
    return {
      jobId: input.jobId,
      status: 'failed',
      overall_creative_score: 0,
      overall_risk_score: 0,
      overall_brand_fit_score: 0,
      parameters: {},
      summary: 'Creative QC providers are not configured.',
      recommendations: [`Configure: ${providerCheck.missing.join(', ')}`],
      error: `Missing providers: ${providerCheck.missing.join(', ')}`,
      processed_at: new Date().toISOString(),
      processing_time_ms: Date.now() - startTime,
    };
  }

  // Log provider status
  const status = getProviderStatus();
  console.log(`[SPI Engine] Transcription: ${status.transcription.name} (${status.transcription.configured ? 'OK' : 'NOT CONFIGURED'})`);
  console.log(`[SPI Engine] SPI: ${status.spi.name} (${status.spi.configured ? 'OK' : 'NOT CONFIGURED'})`);

  let transcript = input.transcript || '';
  let transcriptionTime = 0;

  // Step 1: Get transcript if needed
  if (!transcript) {
    // Try to extract from subtitles first (faster)
    if (input.subtitleContent) {
      console.log(`[SPI Engine] Extracting transcript from subtitles`);
      transcript = extractTranscriptFromSubtitles(input.subtitleContent);
    }
    
    // If still no transcript and media provided, transcribe with Groq Whisper
    if (!transcript && (input.mediaFilePath || input.mediaFileUrl || input.mediaFileBuffer)) {
      console.log(`[SPI Engine] Transcribing media with Groq Whisper`);
      
      try {
        const transcriptionProvider = getTranscriptionProvider();
        const transcriptionContext: TranscriptionJobContext = {
          jobId: input.jobId,
          filePath: input.mediaFilePath,
          fileUrl: input.mediaFileUrl,
          fileBuffer: input.mediaFileBuffer,
          mimeType: input.mediaMimeType,
          language: input.context?.language,
        };

        const transcriptionResult = await transcriptionProvider.transcribe(transcriptionContext);
        transcript = transcriptionResult.text;
        transcriptionTime = transcriptionResult.processingTimeMs;
        
        console.log(`[SPI Engine] Transcription complete: ${transcript.length} chars in ${transcriptionTime}ms`);
      } catch (error: any) {
        console.error(`[SPI Engine] Transcription failed:`, error);
        return {
          jobId: input.jobId,
          status: 'failed',
          overall_creative_score: 0,
          overall_risk_score: 0,
          overall_brand_fit_score: 0,
          parameters: {},
          summary: 'Failed to transcribe media for Creative QC.',
          recommendations: ['Check the media file format and try again.'],
          error: `Transcription failed: ${error.message}`,
          processed_at: new Date().toISOString(),
          processing_time_ms: Date.now() - startTime,
        };
      }
    }
  }

  // Validate we have enough content
  if (!transcript || transcript.length < 50) {
    return {
      jobId: input.jobId,
      status: 'failed',
      overall_creative_score: 0,
      overall_risk_score: 0,
      overall_brand_fit_score: 0,
      parameters: {},
      summary: 'Insufficient content for Creative QC analysis.',
      recommendations: [
        'Ensure the media has spoken dialogue or narration.',
        'Provide subtitles/captions for the content.',
      ],
      error: 'No transcript available - need audio/video with speech or subtitle content',
      processed_at: new Date().toISOString(),
      processing_time_ms: Date.now() - startTime,
    };
  }

  // Step 2: Run SPI analysis with DeepSeek
  console.log(`[SPI Engine] Running SPI analysis with DeepSeek`);
  
  try {
    const spiProvider = getSpiProvider();
    const spiContext: SpiAnalysisContext = {
      jobId: input.jobId,
      transcript,
      subtitleContent: input.subtitleContent,
      metadata: input.context,
      audioAnalysis: input.audioAnalysis,
    };

    const spiResult = await spiProvider.analyze(spiContext, settings);

    if (spiResult.status === 'failed') {
      return {
        jobId: input.jobId,
        status: 'failed',
        overall_creative_score: spiResult.overallCreativeScore,
        overall_risk_score: spiResult.overallRiskScore,
        overall_brand_fit_score: spiResult.overallBrandFitScore,
        parameters: spiResult.parameters,
        summary: spiResult.summary,
        recommendations: spiResult.recommendations,
        error: spiResult.error,
        processed_at: new Date().toISOString(),
        processing_time_ms: Date.now() - startTime,
      };
    }

    console.log(`[SPI Engine] Analysis complete. Creative: ${spiResult.overallCreativeScore}, Risk: ${spiResult.overallRiskScore}`);

    return {
      jobId: input.jobId,
      status: 'completed',
      overall_creative_score: spiResult.overallCreativeScore,
      overall_risk_score: spiResult.overallRiskScore,
      overall_brand_fit_score: spiResult.overallBrandFitScore,
      parameters: spiResult.parameters,
      summary: spiResult.summary,
      recommendations: spiResult.recommendations,
      raw_response: {
        ...spiResult.rawResponse,
        _meta: {
          transcriptionTimeMs: transcriptionTime,
          analysisTimeMs: spiResult.processingTimeMs,
          transcriptionProvider: status.transcription.name,
          spiProvider: status.spi.name,
        },
      },
      processed_at: new Date().toISOString(),
      processing_time_ms: Date.now() - startTime,
    };

  } catch (error: any) {
    console.error(`[SPI Engine] SPI analysis failed:`, error);
    return {
      jobId: input.jobId,
      status: 'failed',
      overall_creative_score: 0,
      overall_risk_score: 0,
      overall_brand_fit_score: 0,
      parameters: {},
      summary: 'Creative QC analysis failed.',
      recommendations: ['Check your API configuration and try again.'],
      error: error.message || 'Unknown error during Creative QC analysis',
      processed_at: new Date().toISOString(),
      processing_time_ms: Date.now() - startTime,
    };
  }
}

/**
 * Check if Creative QC is available for an organization
 */
export async function isCreativeQCAvailable(organizationId: string): Promise<{
  available: boolean;
  reason?: string;
}> {
  try {
    // Import here to avoid circular dependencies
    const { hasFeature, getOrganizationSubscription } = await import('@/lib/services/subscriptionService');
    
    // Check if organization has enterprise plan
    const subscription = await getOrganizationSubscription(organizationId);
    
    // Check subscription tier - accept both from subscription and fallback check
    const isEnterprise = subscription?.plan_slug === 'enterprise';
    
    if (!subscription) {
      // Try direct org check as fallback
      const { createClient } = await import("@supabase/supabase-js");
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      
      if (supabaseUrl && supabaseServiceKey) {
        const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        
        const { data: org } = await adminClient
          .from('organizations')
          .select('subscription_tier')
          .eq('id', organizationId)
          .single();
        
        if (org?.subscription_tier === 'enterprise') {
          // Enterprise tier in org - allow access
          const providerCheck = isProviderConfigured();
          if (!providerCheck.configured) {
            return {
              available: false,
              reason: `Creative QC service not configured: ${providerCheck.missing.join(', ')}`,
            };
          }
          return { available: true };
        }
      }
      
      return {
        available: false,
        reason: 'Creative QC (SPI) is available only for Enterprise plan subscribers.',
      };
    }
    
    if (!isEnterprise) {
      return {
        available: false,
        reason: 'Creative QC (SPI) is available only for Enterprise plan subscribers.',
      };
    }

    // Enterprise automatically has all features - skip hasFeature check
    // This ensures enterprise users always get access regardless of feature_flags table

    // Check if providers are configured
    const providerCheck = isProviderConfigured();
    if (!providerCheck.configured) {
      return {
        available: false,
        reason: `Creative QC service not configured: ${providerCheck.missing.join(', ')}`,
      };
    }

    return { available: true };
  } catch (error: any) {
    console.error("[SPI Engine] Error checking availability:", error);
    return {
      available: false,
      reason: 'Unable to verify Creative QC availability.',
    };
  }
}

/**
 * Get Creative QC settings for an organization
 */
export async function getCreativeQCSettings(organizationId: string): Promise<CreativeQCSettings | null> {
  try {
    const { createClient } = await import("@supabase/supabase-js");
    
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return null;
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await adminClient
      .from("organizations")
      .select("creative_qc_settings")
      .eq("id", organizationId)
      .single();

    if (error || !data) {
      return null;
    }

    return data.creative_qc_settings || null;
  } catch (error: any) {
    console.error("[SPI Engine] Error fetching settings:", error);
    return null;
  }
}

/**
 * Update Creative QC settings for an organization
 */
export async function updateCreativeQCSettings(
  organizationId: string,
  settings: Partial<CreativeQCSettings>
): Promise<boolean> {
  try {
    const { createClient } = await import("@supabase/supabase-js");
    
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return false;
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Get current settings
    const { data: current } = await adminClient
      .from("organizations")
      .select("creative_qc_settings")
      .eq("id", organizationId)
      .single();

    const mergedSettings = {
      ...(current?.creative_qc_settings || DEFAULT_CREATIVE_QC_SETTINGS),
      ...settings,
    };

    const { error } = await adminClient
      .from("organizations")
      .update({ creative_qc_settings: mergedSettings })
      .eq("id", organizationId);

    if (error) {
      console.error("[SPI Engine] Error updating settings:", error);
      return false;
    }

    return true;
  } catch (error: any) {
    console.error("[SPI Engine] Error updating settings:", error);
    return false;
  }
}

/**
 * Get provider status (for diagnostics/health checks)
 */
export function getCreativeQCProviderStatus() {
  return getProviderStatus();
}
