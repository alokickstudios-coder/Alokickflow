/**
 * Transcription Service
 * 
 * Wraps Groq Whisper or Cloudflare Whisper for high-quality transcripts.
 * Gracefully falls back if API keys are not configured.
 * 
 * OPTIMIZED FOR:
 * - Memory efficiency (streaming, file size limits)
 * - Timeout handling (no hanging requests)
 * - Proper API formats
 */

import { isWhisperConfigured, getQCProviderConfig } from '@/config/qcProviders';

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  confidence?: number;
}

export interface TranscriptResult {
  text: string;
  language: string;
  segments: TranscriptSegment[];
  confidence: number;
}

// Constants
const TRANSCRIPTION_TIMEOUT_MS = 120000; // 2 minutes max
const MAX_FILE_SIZE_MB = 25; // Groq limit is 25MB
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

/**
 * Wrap a promise with a timeout
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => 
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    )
  ]);
}

/**
 * Get transcript from audio using configured provider
 * 
 * @param audioUrl - URL or file path to audio file
 * @param languageHint - Optional language hint (e.g., 'en', 'hi')
 * @returns Transcript result or null if not configured
 */
export async function getTranscript(
  audioUrl: string,
  languageHint?: string
): Promise<TranscriptResult | null> {
  if (!isWhisperConfigured()) {
    console.log('[Transcription] Whisper not configured, skipping transcription');
    return null;
  }

  const config = getQCProviderConfig();
  
  try {
    if (config.whisper.provider === 'groq') {
      return await withTimeout(
        getTranscriptGroq(audioUrl, languageHint),
        TRANSCRIPTION_TIMEOUT_MS,
        'Transcription timed out after 2 minutes'
      );
    } else if (config.whisper.provider === 'cloudflare') {
      return await withTimeout(
        getTranscriptCloudflare(audioUrl, languageHint),
        TRANSCRIPTION_TIMEOUT_MS,
        'Transcription timed out after 2 minutes'
      );
    }
  } catch (error: any) {
    console.error('[Transcription] Error getting transcript:', error.message);
    // Don't throw - return null so basic QC can continue
    return null;
  }

  return null;
}

/**
 * Get transcript using Groq Whisper API
 * Uses proper multipart/form-data format
 */
async function getTranscriptGroq(
  audioUrl: string,
  languageHint?: string
): Promise<TranscriptResult | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.log('[Transcription] Groq API key not configured');
    return null;
  }

  try {
    const fs = await import('fs/promises');
    const { statSync, createReadStream } = await import('fs');
    const path = await import('path');
    
    let filePath: string;
    let isTemp = false;
    
    // Handle URL vs local file
    if (audioUrl.startsWith('http://') || audioUrl.startsWith('https://')) {
      // Download to temp file (streaming to avoid memory issues)
      const tempPath = `/tmp/transcript-${Date.now()}.mp3`;
      console.log(`[Transcription] Downloading audio to ${tempPath}`);
      
      const response = await fetch(audioUrl);
      if (!response.ok) {
        throw new Error(`Failed to download audio: ${response.statusText}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      await fs.writeFile(tempPath, Buffer.from(arrayBuffer));
      filePath = tempPath;
      isTemp = true;
    } else {
      filePath = audioUrl;
    }
    
    // Check file size
    const stats = statSync(filePath);
    if (stats.size > MAX_FILE_SIZE_BYTES) {
      console.warn(`[Transcription] File too large (${(stats.size / 1024 / 1024).toFixed(1)}MB), skipping transcription`);
      if (isTemp) await fs.unlink(filePath).catch(() => {});
      return null;
    }
    
    console.log(`[Transcription] Processing file (${(stats.size / 1024 / 1024).toFixed(1)}MB)`);
    
    // Read file for API call
    const fileBuffer = await fs.readFile(filePath);
    const fileName = path.basename(filePath);
    
    // Create FormData with proper file
    const formData = new FormData();
    const blob = new Blob([fileBuffer], { type: 'audio/mpeg' });
    formData.append('file', blob, fileName);
    formData.append('model', 'whisper-large-v3-turbo'); // Faster model
    formData.append('response_format', 'verbose_json');
    if (languageHint) {
      formData.append('language', languageHint);
    }
    
    console.log('[Transcription] Calling Groq Whisper API...');
    
    // Call Groq Whisper API with proper multipart/form-data
    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        // Don't set Content-Type - let fetch set it with boundary for FormData
      },
      body: formData,
    });

    // Cleanup temp file
    if (isTemp) {
      await fs.unlink(filePath).catch(() => {});
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Transcription] Groq API error:', response.status, errorText);
      throw new Error(`Groq API error: ${response.status} - ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();
    
    console.log(`[Transcription] Got transcript: ${data.text?.substring(0, 100)}...`);
    
    // Transform Groq response to our format
    return {
      text: data.text || '',
      language: data.language || languageHint || 'unknown',
      segments: (data.segments || []).map((seg: any) => ({
        start: seg.start || 0,
        end: seg.end || 0,
        text: seg.text || '',
        confidence: seg.avg_logprob ? Math.exp(seg.avg_logprob) : undefined,
      })),
      confidence: data.segments?.[0]?.avg_logprob 
        ? Math.exp(data.segments[0].avg_logprob) 
        : 0.8,
    };
  } catch (error: any) {
    console.error('[Transcription] Groq error:', error.message);
    return null;
  }
}

/**
 * Get transcript using Cloudflare Whisper API
 */
async function getTranscriptCloudflare(
  audioUrl: string,
  languageHint?: string
): Promise<TranscriptResult | null> {
  const accountId = process.env.CF_ACCOUNT_ID;
  const apiToken = process.env.CF_API_TOKEN;
  
  if (!accountId || !apiToken) {
    console.log('[Transcription] Cloudflare credentials not configured');
    return null;
  }

  try {
    const fs = await import('fs/promises');
    const { statSync } = await import('fs');
    
    let filePath: string;
    let isTemp = false;
    
    // Download audio if URL
    if (audioUrl.startsWith('http://') || audioUrl.startsWith('https://')) {
      const tempPath = `/tmp/transcript-cf-${Date.now()}.mp3`;
      const response = await fetch(audioUrl);
      if (!response.ok) {
        throw new Error(`Failed to download audio: ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      await fs.writeFile(tempPath, Buffer.from(arrayBuffer));
      filePath = tempPath;
      isTemp = true;
    } else {
      filePath = audioUrl;
    }
    
    // Check file size
    const stats = statSync(filePath);
    if (stats.size > MAX_FILE_SIZE_BYTES) {
      console.warn(`[Transcription] File too large for Cloudflare, skipping`);
      if (isTemp) await fs.unlink(filePath).catch(() => {});
      return null;
    }
    
    const fileBuffer = await fs.readFile(filePath);

    // Cloudflare Workers AI expects form data
    const formData = new FormData();
    const blob = new Blob([fileBuffer], { type: 'audio/mpeg' });
    formData.append('file', blob, 'audio.mp3');
    if (languageHint) {
      formData.append('language', languageHint);
    }

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/openai/whisper`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
        },
        body: formData,
      }
    );

    // Cleanup
    if (isTemp) {
      await fs.unlink(filePath).catch(() => {});
    }

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Cloudflare API error: ${error}`);
    }

    const data = await response.json();
    
    // Transform Cloudflare response to our format
    return {
      text: data.text || data.result?.text || '',
      language: data.language || languageHint || 'unknown',
      segments: (data.segments || data.result?.segments || []).map((seg: any) => ({
        start: seg.start || 0,
        end: seg.end || 0,
        text: seg.text || '',
        confidence: seg.confidence || undefined,
      })),
      confidence: data.confidence || 0.8,
    };
  } catch (error: any) {
    console.error('[Transcription] Cloudflare error:', error.message);
    return null;
  }
}
