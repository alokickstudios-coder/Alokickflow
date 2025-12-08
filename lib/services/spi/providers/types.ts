/**
 * Creative QC (SPI) Provider Interfaces
 * 
 * Abstractions for transcription and creative analysis providers.
 * This allows swapping providers without changing the pipeline logic.
 */

import { CreativeQCResult, CreativeQCParameterResult, CreativeQCSettings } from "@/config/creativeQcConfig";

// ============================================
// Transcription Provider Interface
// ============================================

export interface TranscriptResult {
  text: string;
  language?: string;
  duration?: number;
  segments?: TranscriptSegment[];
  confidence?: number;
  provider: string;
  processingTimeMs: number;
}

export interface TranscriptSegment {
  start: number;  // seconds
  end: number;    // seconds
  text: string;
  confidence?: number;
}

export interface TranscriptionJobContext {
  jobId: string;
  filePath?: string;        // Local file path for audio/video
  fileUrl?: string;         // Remote URL for audio/video
  fileBuffer?: Buffer;      // Raw file buffer
  mimeType?: string;
  language?: string;        // Hint for language detection
}

export interface TranscriptionProvider {
  readonly name: string;
  
  /**
   * Transcribe audio/video content to text
   */
  transcribe(context: TranscriptionJobContext): Promise<TranscriptResult>;
  
  /**
   * Check if the provider is properly configured
   */
  isConfigured(): boolean;
}

// ============================================
// SPI (Creative Analysis) Provider Interface
// ============================================

export interface SpiAnalysisContext {
  jobId: string;
  transcript: string;
  subtitleContent?: string;
  
  // Metadata for context-aware analysis
  metadata?: {
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
  
  // Optional: Raw audio analysis data for enhanced analysis
  audioAnalysis?: {
    hasDialogue: boolean;
    hasBGM: boolean;
    loudnessLUFS?: number;
    silencePercentage?: number;
  };
}

export interface SpiAnalysisResult {
  status: 'completed' | 'failed';
  overallCreativeScore: number;
  overallRiskScore: number;
  overallBrandFitScore: number;
  parameters: Record<string, CreativeQCParameterResult>;
  summary: string;
  recommendations: string[];
  detectedEmotions?: string[];
  detectedThemes?: string[];
  contentType?: string;
  rawResponse?: any;
  error?: string;
  provider: string;
  processingTimeMs: number;
}

export interface SpiProvider {
  readonly name: string;
  
  /**
   * Run creative/emotional analysis on content
   */
  analyze(context: SpiAnalysisContext, settings?: CreativeQCSettings): Promise<SpiAnalysisResult>;
  
  /**
   * Check if the provider is properly configured
   */
  isConfigured(): boolean;
}

// ============================================
// Provider Factory Types
// ============================================

export type TranscriptionProviderType = 'groq_whisper' | 'openai_whisper' | 'local';
export type SpiProviderType = 'deepseek' | 'openai' | 'anthropic';

export interface ProviderConfig {
  transcription: {
    provider: TranscriptionProviderType;
    fallback?: TranscriptionProviderType;
  };
  spi: {
    provider: SpiProviderType;
    fallback?: SpiProviderType;
  };
}

// Default configuration - Groq Whisper + DeepSeek
export const DEFAULT_PROVIDER_CONFIG: ProviderConfig = {
  transcription: {
    provider: 'groq_whisper',
  },
  spi: {
    provider: 'deepseek',
  },
};

