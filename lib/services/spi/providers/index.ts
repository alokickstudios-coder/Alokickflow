/**
 * SPI Providers Index
 * 
 * Provider factory and exports for transcription and SPI analysis.
 * Default configuration uses Groq Whisper + DeepSeek (with Groq fallback).
 */

import {
  TranscriptionProvider,
  SpiProvider,
  TranscriptionProviderType,
  SpiProviderType,
  DEFAULT_PROVIDER_CONFIG,
  ProviderConfig,
} from "./types";
import { GroqWhisperTranscriptionProvider, groqWhisperProvider } from "./groqWhisper";
import { DeepSeekSpiProvider, deepseekSpiProvider } from "./deepseekSpi";
import { GroqSpiProvider, groqSpiProvider } from "./groqSpi";

// Re-export types
export * from "./types";

// Re-export provider implementations
export { GroqWhisperTranscriptionProvider, groqWhisperProvider } from "./groqWhisper";
export { DeepSeekSpiProvider, deepseekSpiProvider } from "./deepseekSpi";
export { GroqSpiProvider, groqSpiProvider } from "./groqSpi";

/**
 * Provider Factory
 * 
 * Creates and manages provider instances based on configuration.
 */
class SpiProviderFactory {
  private config: ProviderConfig;
  private transcriptionProvider: TranscriptionProvider | null = null;
  private spiProvider: SpiProvider | null = null;

  constructor(config: ProviderConfig = DEFAULT_PROVIDER_CONFIG) {
    this.config = config;
  }

  /**
   * Get the configured transcription provider
   */
  getTranscriptionProvider(): TranscriptionProvider {
    if (this.transcriptionProvider) {
      return this.transcriptionProvider;
    }

    switch (this.config.transcription.provider) {
      case "groq_whisper":
        this.transcriptionProvider = groqWhisperProvider;
        break;
      default:
        // Default to Groq Whisper
        this.transcriptionProvider = groqWhisperProvider;
    }

    return this.transcriptionProvider;
  }

  /**
   * Get the configured SPI provider
   * Falls back to Groq if DeepSeek is not configured
   */
  getSpiProvider(): SpiProvider {
    if (this.spiProvider) {
      return this.spiProvider;
    }

    // Try DeepSeek first
    if (deepseekSpiProvider.isConfigured()) {
      this.spiProvider = deepseekSpiProvider;
      return this.spiProvider;
    }

    // Fallback to Groq for SPI analysis
    if (groqSpiProvider.isConfigured()) {
      console.log("[SPI] DeepSeek not configured, using Groq for SPI analysis");
      this.spiProvider = groqSpiProvider;
      return this.spiProvider;
    }

    // Default to DeepSeek (will show error when used)
    this.spiProvider = deepseekSpiProvider;
    return this.spiProvider;
  }

  /**
   * Check if all required providers are configured
   * Now checks for Groq fallback for SPI
   */
  isFullyConfigured(): { configured: boolean; missing: string[] } {
    const missing: string[] = [];

    const transcription = this.getTranscriptionProvider();
    if (!transcription.isConfigured()) {
      missing.push(`Transcription provider (${transcription.name})`);
    }

    // Check if either DeepSeek or Groq is configured for SPI
    const hasDeepSeek = deepseekSpiProvider.isConfigured();
    const hasGroq = groqSpiProvider.isConfigured();
    
    if (!hasDeepSeek && !hasGroq) {
      missing.push(`SPI provider (DeepSeek or Groq)`);
    }

    return {
      configured: missing.length === 0,
      missing,
    };
  }

  /**
   * Get provider status for diagnostics
   */
  getStatus(): {
    transcription: { name: string; configured: boolean };
    spi: { name: string; configured: boolean };
  } {
    const transcription = this.getTranscriptionProvider();
    const spi = this.getSpiProvider();

    return {
      transcription: {
        name: transcription.name,
        configured: transcription.isConfigured(),
      },
      spi: {
        name: spi.name,
        configured: spi.isConfigured(),
      },
    };
  }
}

// Default factory instance with Groq Whisper + DeepSeek
export const providerFactory = new SpiProviderFactory();

// Convenience exports for default providers
export const getTranscriptionProvider = () => providerFactory.getTranscriptionProvider();
export const getSpiProvider = () => providerFactory.getSpiProvider();
export const isProviderConfigured = () => providerFactory.isFullyConfigured();
export const getProviderStatus = () => providerFactory.getStatus();

