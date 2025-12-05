/**
 * Transcription Service
 * 
 * Wraps Groq Whisper or Cloudflare Whisper for high-quality transcripts.
 * Gracefully falls back if API keys are not configured.
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
      return await getTranscriptGroq(audioUrl, languageHint);
    } else if (config.whisper.provider === 'cloudflare') {
      return await getTranscriptCloudflare(audioUrl, languageHint);
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
 */
async function getTranscriptGroq(
  audioUrl: string,
  languageHint?: string
): Promise<TranscriptResult | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return null;
  }

  // For Groq, we need to:
  // 1. Download the audio file if it's a URL
  // 2. Convert to base64 or upload to a temporary location
  // 3. Call Groq API
  
  // Note: Groq Whisper API expects audio data
  // This is a simplified implementation - in production, handle file downloads properly
  
  try {
    // If audioUrl is a local file path, read it
    // If it's a URL, download it first
    let audioData: Buffer;
    
    if (audioUrl.startsWith('http://') || audioUrl.startsWith('https://')) {
      const response = await fetch(audioUrl);
      if (!response.ok) {
        throw new Error(`Failed to download audio: ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      audioData = Buffer.from(arrayBuffer);
    } else {
      // Local file path
      const fs = await import('fs/promises');
      audioData = await fs.readFile(audioUrl);
    }

    // Convert to base64 for Groq API
    const base64Audio = audioData.toString('base64');
    
    // Call Groq Whisper API
    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'whisper-large-v3',
        file: `data:audio/mpeg;base64,${base64Audio}`,
        language: languageHint || undefined,
        response_format: 'verbose_json',
        timestamp_granularities: ['segment'],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Groq API error: ${error}`);
    }

    const data = await response.json();
    
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
    return null;
  }

  try {
    // Cloudflare Workers AI Whisper endpoint
    // Note: This is a placeholder - adjust based on actual Cloudflare API
    
    // Download audio if URL
    let audioData: Buffer;
    if (audioUrl.startsWith('http://') || audioUrl.startsWith('https://')) {
      const response = await fetch(audioUrl);
      if (!response.ok) {
        throw new Error(`Failed to download audio: ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      audioData = Buffer.from(arrayBuffer);
    } else {
      const fs = await import('fs/promises');
      audioData = await fs.readFile(audioUrl);
    }

    // Cloudflare Workers AI expects form data
    const formData = new FormData();
    const blob = new Blob([audioData as any]);
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

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Cloudflare API error: ${error}`);
    }

    const data = await response.json();
    
    // Transform Cloudflare response to our format
    // Note: Adjust based on actual Cloudflare API response structure
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

