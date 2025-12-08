/**
 * SPI Providers Index
 * 
 * Provider factory and exports for transcription and SPI analysis.
 * Default configuration uses Groq Whisper + DeepSeek.
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

// Re-export types
export * from "./types";

// Re-export provider implementations
export { GroqWhisperTranscriptionProvider, groqWhisperProvider } from "./groqWhisper";
export { DeepSeekSpiProvider, deepseekSpiProvider } from "./deepseekSpi";

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
   */
  getSpiProvider(): SpiProvider {
    if (this.spiProvider) {
      return this.spiProvider;
    }

    switch (this.config.spi.provider) {
      case "deepseek":
        this.spiProvider = deepseekSpiProvider;
        break;
      default:
        // Default to DeepSeek
        this.spiProvider = deepseekSpiProvider;
    }

    return this.spiProvider;
  }

  /**
   * Check if all required providers are configured
   */
  isFullyConfigured(): { configured: boolean; missing: string[] } {
    const missing: string[] = [];

    const transcription = this.getTranscriptionProvider();
    if (!transcription.isConfigured()) {
      missing.push(`Transcription provider (${transcription.name})`);
    }

    const spi = this.getSpiProvider();
    if (!spi.isConfigured()) {
      missing.push(`SPI provider (${spi.name})`);
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

