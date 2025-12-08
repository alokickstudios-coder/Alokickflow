/**
 * Groq Whisper Transcription Provider
 * 
 * Uses Groq Cloud's Whisper implementation for audio/video transcription.
 * Groq provides an OpenAI-compatible API for Whisper models.
 * 
 * Environment Variables:
 * - GROQ_API_KEY: Your Groq API key (required)
 * - GROQ_API_BASE: API base URL (optional, defaults to https://api.groq.com/openai/v1)
 * - GROQ_WHISPER_MODEL: Model name (optional, defaults to whisper-large-v3-turbo)
 */

import {
  TranscriptionProvider,
  TranscriptionJobContext,
  TranscriptResult,
  TranscriptSegment,
} from "./types";

// Environment configuration
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_BASE = process.env.GROQ_API_BASE || "https://api.groq.com/openai/v1";
const GROQ_WHISPER_MODEL = process.env.GROQ_WHISPER_MODEL || "whisper-large-v3-turbo";

// Supported audio formats for Groq Whisper
const SUPPORTED_AUDIO_FORMATS = [
  "audio/flac",
  "audio/m4a",
  "audio/mp3",
  "audio/mpeg",
  "audio/mpga",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "video/mp4",
  "video/webm",
  "video/mpeg",
];

export class GroqWhisperTranscriptionProvider implements TranscriptionProvider {
  readonly name = "groq_whisper";

  /**
   * Check if the provider is properly configured
   */
  isConfigured(): boolean {
    return !!GROQ_API_KEY;
  }

  /**
   * Transcribe audio/video content using Groq Whisper
   */
  async transcribe(context: TranscriptionJobContext): Promise<TranscriptResult> {
    const startTime = Date.now();

    if (!this.isConfigured()) {
      throw new Error(
        "Groq Whisper is not configured. Please set GROQ_API_KEY environment variable."
      );
    }

    console.log(`[GroqWhisper] Starting transcription for job ${context.jobId}`);

    // Get file data
    let fileBuffer: Buffer;
    let fileName: string;
    let mimeType: string;

    if (context.fileBuffer) {
      fileBuffer = context.fileBuffer;
      fileName = `audio_${context.jobId}.mp3`;
      mimeType = context.mimeType || "audio/mpeg";
    } else if (context.filePath) {
      // Read from local file
      const fs = await import("fs/promises");
      const path = await import("path");
      fileBuffer = await fs.readFile(context.filePath);
      fileName = path.basename(context.filePath);
      mimeType = context.mimeType || this.getMimeType(fileName);
    } else if (context.fileUrl) {
      // Download from URL
      const response = await fetch(context.fileUrl);
      if (!response.ok) {
        throw new Error(`Failed to download file: ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      fileBuffer = Buffer.from(arrayBuffer);
      fileName = `audio_${context.jobId}.mp3`;
      mimeType = context.mimeType || response.headers.get("content-type") || "audio/mpeg";
    } else {
      throw new Error("No file provided for transcription");
    }

    // Validate file size (Groq has a 25MB limit)
    const maxSize = 25 * 1024 * 1024; // 25MB
    if (fileBuffer.length > maxSize) {
      throw new Error(
        `File too large for Groq Whisper. Maximum size is 25MB, got ${(fileBuffer.length / (1024 * 1024)).toFixed(2)}MB`
      );
    }

    // Prepare form data
    const formData = new FormData();
    const blob = new Blob([fileBuffer], { type: mimeType });
    formData.append("file", blob, fileName);
    formData.append("model", GROQ_WHISPER_MODEL);
    formData.append("response_format", "verbose_json"); // Get detailed response with segments
    
    if (context.language) {
      formData.append("language", context.language);
    }

    // Call Groq API
    const apiUrl = `${GROQ_API_BASE}/audio/transcriptions`;
    
    console.log(`[GroqWhisper] Calling ${apiUrl} with model ${GROQ_WHISPER_MODEL}`);

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[GroqWhisper] API error: ${response.status} - ${errorText}`);
      throw new Error(`Groq Whisper API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    
    console.log(`[GroqWhisper] Transcription completed for job ${context.jobId}`);

    // Parse segments if available
    const segments: TranscriptSegment[] = (data.segments || []).map((seg: any) => ({
      start: seg.start,
      end: seg.end,
      text: seg.text,
      confidence: seg.confidence,
    }));

    return {
      text: data.text || "",
      language: data.language,
      duration: data.duration,
      segments,
      confidence: this.calculateAverageConfidence(segments),
      provider: this.name,
      processingTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Get MIME type from file extension
   */
  private getMimeType(fileName: string): string {
    const ext = fileName.split(".").pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      mp3: "audio/mpeg",
      wav: "audio/wav",
      flac: "audio/flac",
      m4a: "audio/m4a",
      ogg: "audio/ogg",
      webm: "audio/webm",
      mp4: "video/mp4",
      mpeg: "video/mpeg",
    };
    return mimeTypes[ext || ""] || "audio/mpeg";
  }

  /**
   * Calculate average confidence from segments
   */
  private calculateAverageConfidence(segments: TranscriptSegment[]): number | undefined {
    const confidences = segments
      .map((s) => s.confidence)
      .filter((c): c is number => c !== undefined);
    
    if (confidences.length === 0) return undefined;
    
    return confidences.reduce((sum, c) => sum + c, 0) / confidences.length;
  }
}

// Export singleton instance
export const groqWhisperProvider = new GroqWhisperTranscriptionProvider();

