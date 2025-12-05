/**
 * QC Providers Configuration
 * 
 * Central configuration for external QC service providers.
 * All paid features check these configs before attempting API calls.
 */

export type WhisperProvider = 'groq' | 'cloudflare' | 'none';
export type LLMProvider = 'deepseek' | 'none';
export type LipSyncProvider = 'syncnet' | 'none';

export interface QCProviderConfig {
  whisper: {
    provider: WhisperProvider;
    configured: boolean;
  };
  llm: {
    provider: LLMProvider;
    configured: boolean;
  };
  lipSync: {
    provider: LipSyncProvider;
    configured: boolean;
  };
}

/**
 * Detect which providers are configured based on environment variables
 */
export function detectQCProviders(): QCProviderConfig {
  // Whisper/Transcription providers
  const groqKey = process.env.GROQ_API_KEY;
  const cfAccountId = process.env.CF_ACCOUNT_ID;
  const cfApiToken = process.env.CF_API_TOKEN;
  
  let whisperProvider: WhisperProvider = 'none';
  let whisperConfigured = false;
  
  if (groqKey) {
    whisperProvider = 'groq';
    whisperConfigured = true;
  } else if (cfAccountId && cfApiToken) {
    whisperProvider = 'cloudflare';
    whisperConfigured = true;
  }

  // LLM providers (for premium reports)
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  const deepseekBaseUrl = process.env.DEEPSEEK_API_BASE_URL || 'https://api.deepseek.com';
  
  let llmProvider: LLMProvider = 'none';
  let llmConfigured = false;
  
  if (deepseekKey) {
    llmProvider = 'deepseek';
    llmConfigured = true;
  }

  // Lip-sync providers
  const lipSyncUrl = process.env.LIPSYNC_SERVICE_URL;
  const lipSyncKey = process.env.LIPSYNC_API_KEY;
  
  let lipSyncProvider: LipSyncProvider = 'none';
  let lipSyncConfigured = false;
  
  if (lipSyncUrl && lipSyncKey) {
    lipSyncProvider = 'syncnet';
    lipSyncConfigured = true;
  }

  return {
    whisper: {
      provider: whisperProvider,
      configured: whisperConfigured,
    },
    llm: {
      provider: llmProvider,
      configured: llmConfigured,
    },
    lipSync: {
      provider: lipSyncProvider,
      configured: lipSyncConfigured,
    },
  };
}

/**
 * Check if Whisper/transcription is configured
 */
export function isWhisperConfigured(): boolean {
  return detectQCProviders().whisper.configured;
}

/**
 * Check if DeepSeek/LLM is configured
 */
export function isDeepseekConfigured(): boolean {
  return detectQCProviders().llm.configured;
}

/**
 * Check if Lip-sync service is configured
 */
export function isLipSyncConfigured(): boolean {
  return detectQCProviders().lipSync.configured;
}

/**
 * Get current provider configuration (cached per request)
 */
let cachedConfig: QCProviderConfig | null = null;

export function getQCProviderConfig(): QCProviderConfig {
  if (!cachedConfig) {
    cachedConfig = detectQCProviders();
  }
  return cachedConfig;
}

/**
 * Reset cached config (useful for testing)
 */
export function resetQCProviderConfigCache(): void {
  cachedConfig = null;
}



