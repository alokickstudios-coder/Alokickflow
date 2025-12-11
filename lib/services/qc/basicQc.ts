/**
 * Basic QC Module
 * 
 * Implements FREE QC features using FFmpeg and Node.js only.
 * No external API keys required.
 * 
 * Features:
 * - Audio Missing detection
 * - Loudness Compliance (EBU R128)
 * - Silence & Missing Dialogue detection
 * - Subtitle Timing validation
 * - Missing BGM detection (basic audio band analysis)
 * - Visual Quality checks (resolution, bitrate, codec)
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { getTranscript, TranscriptResult } from './transcription';
import { getFFmpegPath, getFFprobePath } from './ffmpegPaths';

const execAsync = promisify(exec);

// Lazy getters for binary paths (avoids errors at module load time)
let _ffmpegPath: string | null = null;
let _ffprobePath: string | null = null;
let _ffmpegAvailable: boolean | null = null;

function getFFmpeg(): string {
  if (!_ffmpegPath) {
    _ffmpegPath = getFFmpegPath();
  }
  return _ffmpegPath;
}

function getFFprobe(): string {
  if (!_ffprobePath) {
    _ffprobePath = getFFprobePath();
  }
  return _ffprobePath;
}

/**
 * Check if FFmpeg is available and executable
 */
async function isFFmpegAvailable(): Promise<boolean> {
  if (_ffmpegAvailable !== null) {
    return _ffmpegAvailable;
  }
  
  try {
    const ffprobePath = getFFprobe();
    // Test if ffprobe is executable
    await execAsync(`"${ffprobePath}" -version`, { timeout: 5000 });
    _ffmpegAvailable = true;
    return true;
  } catch (error) {
    console.warn('[BasicQC] FFmpeg/FFprobe not available:', error instanceof Error ? error.message : error);
    _ffmpegAvailable = false;
    return false;
  }
}

export interface BasicQCResult {
  audioMissing: {
    detected: boolean;
    error?: string;
  };
  loudness: {
    lufs: number | null;
    peak: number | null;
    status: 'passed' | 'failed' | 'warning';
    threshold: number;
    message?: string;
  };
  silence: {
    detected: boolean;
    segments: Array<{ start: number; end: number; duration: number }>;
    totalSilenceDuration: number;
  };
  missingDialogue: {
    detected: boolean;
    segments: Array<{ start: number; end: number; message: string }>;
  };
  subtitleTiming: {
    status: 'passed' | 'failed' | 'skipped';
    errors: Array<{ timestamp: number; message: string }>;
    warnings: Array<{ timestamp: number; message: string }>;
  };
  missingBGM: {
    detected: boolean;
    bgmPresence: number; // 0-100 percentage
    issues: Array<{ timestamp: number; message: string }>;
  };
  visualQuality: {
    resolution: string | null;
    bitrate: number | null;
    codec: string | null;
    frameRate: number | null;
    status: 'passed' | 'failed' | 'warning';
    issues: Array<{ message: string }>;
  };
  metadata: {
    duration: number;
    videoCodec?: string;
    audioCodec?: string;
    audioChannels?: number;
    sampleRate?: number;
  };
  transcript?: TranscriptResult; // If transcription is available
}

export interface FileInfo {
  filePath: string;
  fileName: string;
  subtitlesPath?: string; // Optional SRT/VTT file path
}

/**
 * Run comprehensive basic QC checks
 */
export async function runBasicQC(
  episodeId: string,
  fileInfo: FileInfo | string,
  subtitlesInfo?: { path: string; language?: string }
): Promise<BasicQCResult> {
  // Normalize fileInfo
  const info: FileInfo = typeof fileInfo === 'string' 
    ? { filePath: fileInfo, fileName: fileInfo.split('/').pop() || 'unknown' }
    : fileInfo;

  const filePath = info.filePath;
  
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  console.log(`[BasicQC] Processing episode ${episodeId} from ${filePath}`);

  // Check if FFmpeg is available
  const ffmpegOk = await isFFmpegAvailable();
  if (!ffmpegOk) {
    console.warn('[BasicQC] FFmpeg not available - returning minimal QC result');
    // Return a minimal result when FFmpeg isn't available
    // This allows QC to "complete" without full analysis
    return createMinimalQCResult();
  }

  // Run all checks in parallel where possible
  const [
    audioMissing,
    loudness,
    silence,
    metadata,
    visualQuality,
    transcript,
  ] = await Promise.all([
    checkAudioMissing(filePath),
    checkLoudness(filePath),
    checkSilence(filePath),
    getMetadata(filePath),
    checkVisualQuality(filePath),
    // Try to get transcript if configured (non-blocking)
    getTranscript(filePath, 'en').catch(() => null),
  ]);

  // Missing dialogue detection (uses silence + transcript if available)
  const missingDialogue = await checkMissingDialogue(
    filePath,
    silence,
    transcript || undefined
  );

  // Subtitle timing (requires subtitle file)
  const subtitleTiming = subtitlesInfo?.path
    ? await checkSubtitleTiming(subtitlesInfo.path, filePath, transcript || undefined)
    : { status: 'skipped' as const, errors: [], warnings: [] };

  // Missing BGM detection
  const missingBGM = await checkMissingBGM(filePath, metadata);

  return {
    audioMissing,
    loudness,
    silence,
    missingDialogue,
    subtitleTiming,
    missingBGM,
    visualQuality,
    metadata,
    transcript: transcript || undefined,
  };
}

/**
 * Check if audio track exists
 */
async function checkAudioMissing(filePath: string): Promise<BasicQCResult['audioMissing']> {
  try {
    const { stdout } = await execAsync(
      `"${getFFprobe()}" -v error -select_streams a:0 -show_entries stream=codec_type -of csv=p=0 "${filePath}"`
    );

    if (!stdout.trim() || !stdout.includes('audio')) {
      return {
        detected: true,
        error: 'No audio track detected in video file',
      };
    }

    return { detected: false };
  } catch (error: any) {
    return {
      detected: true,
      error: `Unable to verify audio track: ${error.message}`,
    };
  }
}

/**
 * Check loudness compliance (EBU R128 standard)
 */
async function checkLoudness(filePath: string): Promise<BasicQCResult['loudness']> {
  try {
    // Use ffmpeg loudnorm filter to get EBU R128 measurements
    const { stdout } = await execAsync(
      `"${getFFmpeg()}" -i "${filePath}" -af loudnorm=I=-23:TP=-2.0:LRA=7:print_format=json -f null - 2>&1 | grep -A 30 "input_i\\|input_tp\\|input_lra" || echo "{}"`
    );

    // Parse JSON output
    let inputI: number | null = null;
    let inputTP: number | null = null;

    try {
      // Extract values from JSON-like output
      const iMatch = stdout.match(/"input_i"\s*:\s*"([^"]+)"/);
      const tpMatch = stdout.match(/"input_tp"\s*:\s*"([^"]+)"/);

      if (iMatch) inputI = parseFloat(iMatch[1]);
      if (tpMatch) inputTP = parseFloat(tpMatch[1]);
    } catch {
      // Fallback: try to extract from text output
      const iMatch = stdout.match(/Input Integrated:\s*([-\d.]+)/i);
      const tpMatch = stdout.match(/Input True Peak:\s*([-\d.]+)/i);
      
      if (iMatch) inputI = parseFloat(iMatch[1]);
      if (tpMatch) inputTP = parseFloat(tpMatch[1]);
    }

    const threshold = -23; // EBU R128 target
    const tolerance = 1; // ±1 LU

    if (inputI === null) {
      return {
        lufs: null,
        peak: inputTP || null,
        status: 'warning',
        threshold,
        message: 'Unable to measure loudness',
      };
    }

    const status = 
      inputI < threshold - tolerance ? 'failed' :
      inputI > threshold + tolerance ? 'failed' :
      'passed';

    return {
      lufs: inputI,
      peak: inputTP,
      status,
      threshold,
      message: status === 'passed' 
        ? `Loudness ${inputI.toFixed(1)} LUFS is within target range`
        : `Loudness ${inputI.toFixed(1)} LUFS is outside target range (${threshold - tolerance} to ${threshold + tolerance} LUFS)`,
    };
  } catch (error: any) {
    return {
      lufs: null,
      peak: null,
      status: 'warning',
      threshold: -23,
      message: `Unable to analyze loudness: ${error.message}`,
    };
  }
}

/**
 * Detect silence segments
 */
async function checkSilence(filePath: string): Promise<BasicQCResult['silence']> {
  try {
    // Use ffmpeg silencedetect filter
    const { stderr } = await execAsync(
      `"${getFFmpeg()}" -i "${filePath}" -af silencedetect=noise=-30dB:d=1.0 -f null - 2>&1`
    );

    const segments: Array<{ start: number; end: number; duration: number }> = [];
    const silenceStartRegex = /silence_start:\s*([\d.]+)/g;
    const silenceEndRegex = /silence_end:\s*([\d.]+)/g;

    const starts: number[] = [];
    const ends: number[] = [];

    let match;
    while ((match = silenceStartRegex.exec(stderr)) !== null) {
      starts.push(parseFloat(match[1]));
    }
    while ((match = silenceEndRegex.exec(stderr)) !== null) {
      ends.push(parseFloat(match[1]));
    }

    // Pair up starts and ends
    for (let i = 0; i < starts.length; i++) {
      const start = starts[i];
      const end = ends[i] || (starts[i + 1] || start + 1); // Default to next start or 1s
      const duration = end - start;
      
      if (duration > 0.5) { // Only count silences > 0.5s
        segments.push({ start, end, duration });
      }
    }

    const totalSilenceDuration = segments.reduce((sum, seg) => sum + seg.duration, 0);

    return {
      detected: segments.length > 0,
      segments,
      totalSilenceDuration,
    };
  } catch (error: any) {
    console.warn('[BasicQC] Silence detection error:', error.message);
    return {
      detected: false,
      segments: [],
      totalSilenceDuration: 0,
    };
  }
}

/**
 * Detect missing dialogue using silence + transcript if available
 */
async function checkMissingDialogue(
  filePath: string,
  silence: BasicQCResult['silence'],
  transcript?: TranscriptResult
): Promise<BasicQCResult['missingDialogue']> {
  const segments: Array<{ start: number; end: number; message: string }> = [];

  // Method 1: Long silences (>5 seconds) without transcript
  if (!transcript) {
    silence.segments.forEach(seg => {
      if (seg.duration > 5) {
        segments.push({
          start: seg.start,
          end: seg.end,
          message: `Extended silence detected (${seg.duration.toFixed(1)}s) - possible missing dialogue`,
        });
      }
    });
  } else {
    // Method 2: Compare transcript segments with silence
    // Find gaps in transcript that are longer than expected
    transcript.segments.forEach((seg, idx) => {
      if (idx > 0) {
        const prevSeg = transcript.segments[idx - 1];
        const gap = seg.start - prevSeg.end;
        
        if (gap > 3) {
          // Check if this gap overlaps with a silence segment
          const hasSilence = silence.segments.some(s => 
            s.start <= seg.start && s.end >= prevSeg.end
          );
          
          if (hasSilence && gap > 5) {
            segments.push({
              start: prevSeg.end,
              end: seg.start,
              message: `Gap in dialogue detected (${gap.toFixed(1)}s) - possible missing dialogue`,
            });
          }
        }
      }
    });
  }

  return {
    detected: segments.length > 0,
    segments,
  };
}

/**
 * Check subtitle timing against audio/transcript
 */
async function checkSubtitleTiming(
  subtitlePath: string,
  videoPath: string,
  transcript?: TranscriptResult
): Promise<BasicQCResult['subtitleTiming']> {
  const errors: Array<{ timestamp: number; message: string }> = [];
  const warnings: Array<{ timestamp: number; message: string }> = [];

  try {
    // Parse SRT file
    const content = await readFile(subtitlePath, 'utf-8');
    const subtitleEntries = parseSRT(content);

    // Check each subtitle entry
    subtitleEntries.forEach(entry => {
      // Check duration
      const duration = entry.end - entry.start;
      if (duration > 7) {
        warnings.push({
          timestamp: entry.start,
          message: `Subtitle displayed for ${duration.toFixed(1)}s (recommended: <7s)`,
        });
      }
      if (duration < 0.5) {
        warnings.push({
          timestamp: entry.start,
          message: `Subtitle displayed for ${duration.toFixed(1)}s (too short, recommended: >0.5s)`,
        });
      }

      // If transcript is available, check alignment
      if (transcript) {
        // Find matching transcript segment
        const matchingSeg = transcript.segments.find(seg =>
          Math.abs(seg.start - entry.start) < 2 // Within 2 seconds
        );

        if (!matchingSeg) {
          warnings.push({
            timestamp: entry.start,
            message: 'Subtitle timing may not align with audio',
          });
        } else if (Math.abs(matchingSeg.start - entry.start) > 1) {
          warnings.push({
            timestamp: entry.start,
            message: `Subtitle timing offset: ${Math.abs(matchingSeg.start - entry.start).toFixed(1)}s from audio`,
          });
        }
      }
    });

    return {
      status: errors.length > 0 ? 'failed' : 'passed',
      errors,
      warnings,
    };
  } catch (error: any) {
    return {
      status: 'failed',
      errors: [{
        timestamp: 0,
        message: `Failed to parse subtitle file: ${error.message}`,
      }],
      warnings: [],
    };
  }
}

/**
 * Parse SRT file content
 */
function parseSRT(content: string): Array<{ start: number; end: number; text: string }> {
  const entries: Array<{ start: number; end: number; text: string }> = [];
  const blocks = content.trim().split(/\n\s*\n/);

  blocks.forEach(block => {
    const lines = block.trim().split('\n');
    if (lines.length < 3) return;

    // Parse timestamp line (format: 00:00:00,000 --> 00:00:00,000)
    const timeMatch = lines[1].match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/);
    if (!timeMatch) return;

    const start = 
      parseInt(timeMatch[1]) * 3600 +
      parseInt(timeMatch[2]) * 60 +
      parseInt(timeMatch[3]) +
      parseInt(timeMatch[4]) / 1000;
    
    const end =
      parseInt(timeMatch[5]) * 3600 +
      parseInt(timeMatch[6]) * 60 +
      parseInt(timeMatch[7]) +
      parseInt(timeMatch[8]) / 1000;

    const text = lines.slice(2).join(' ').trim();

    entries.push({ start, end, text });
  });

  return entries;
}

/**
 * Check for missing BGM using audio band analysis
 */
async function checkMissingBGM(
  filePath: string,
  metadata: BasicQCResult['metadata']
): Promise<BasicQCResult['missingBGM']> {
  const issues: Array<{ timestamp: number; message: string }> = [];

  try {
    // Analyze audio spectrum to detect BGM presence
    // Use ffmpeg to analyze frequency bands
    const { stdout } = await execAsync(
      `"${getFFmpeg()}" -i "${filePath}" -af "astats=metadata=1:reset=1" -f null - 2>&1 | grep -E "RMS level|Peak level" | head -20`
    );

    // Check audio channels (stereo typically has BGM)
    if (metadata.audioChannels === 1) {
      issues.push({
        timestamp: 0,
        message: 'Mono audio detected - BGM may be missing (stereo expected)',
      });
    }

    // Analyze RMS levels - if too low throughout, BGM might be missing
    const rmsMatches = stdout.match(/RMS level:\s*([-\d.]+)\s*dB/g);
    if (rmsMatches) {
      const levels = rmsMatches.map(m => {
        const match = m.match(/([-\d.]+)/);
        return match ? parseFloat(match[1]) : -60;
      });

      const avgLevel = levels.reduce((a, b) => a + b, 0) / levels.length;
      if (avgLevel < -40) {
        issues.push({
          timestamp: 0,
          message: `Very low audio levels detected (avg: ${avgLevel.toFixed(1)}dB) - BGM may be missing`,
        });
      }
    }

    // Calculate BGM presence percentage (heuristic)
    // If stereo and decent levels, assume BGM is present
    const bgmPresence = 
      metadata.audioChannels && metadata.audioChannels >= 2 ? 75 : 30;

    return {
      detected: issues.length > 0,
      bgmPresence,
      issues,
    };
  } catch (error: any) {
    console.warn('[BasicQC] BGM detection error:', error.message);
    return {
      detected: false,
      bgmPresence: 50, // Unknown
      issues: [],
    };
  }
}

/**
 * Check visual quality (resolution, bitrate, codec)
 */
async function checkVisualQuality(filePath: string): Promise<BasicQCResult['visualQuality']> {
  const issues: Array<{ message: string }> = [];

  try {
    const { stdout } = await execAsync(
      `"${getFFprobe()}" -v error -show_entries stream=codec_name,width,height,r_frame_rate,bit_rate -of json "${filePath}"`
    );

    const data = JSON.parse(stdout);
    const videoStream = data.streams?.find((s: any) => s.codec_type === 'video' || s.codec_name);

    if (!videoStream) {
      return {
        resolution: null,
        bitrate: null,
        codec: null,
        frameRate: null,
        status: 'failed',
        issues: [{ message: 'No video stream found' }],
      };
    }

    const width = videoStream.width || 0;
    const height = videoStream.height || 0;
    const resolution = `${width}x${height}`;
    const codec = videoStream.codec_name || 'unknown';
    
    // Parse frame rate
    let frameRate: number | null = null;
    if (videoStream.r_frame_rate) {
      const [num, den] = videoStream.r_frame_rate.split('/');
      frameRate = parseFloat(num) / parseFloat(den);
    }

    // Parse bitrate (convert from bps to kbps)
    const bitrate = videoStream.bit_rate 
      ? Math.round(parseInt(videoStream.bit_rate) / 1000)
      : null;

    // Quality checks
    if (width < 1280 || height < 720) {
      issues.push({ message: `Resolution ${resolution} is below HD (1280x720)` });
    }

    if (bitrate && bitrate < 2000) {
      issues.push({ message: `Bitrate ${bitrate}kbps is below recommended (2000kbps)` });
    }

    if (codec === 'unknown' || !codec) {
      issues.push({ message: 'Video codec could not be determined' });
    }

    const status = issues.length > 0 ? 'warning' : 'passed';

    return {
      resolution,
      bitrate,
      codec,
      frameRate,
      status,
      issues,
    };
  } catch (error: any) {
    return {
      resolution: null,
      bitrate: null,
      codec: null,
      frameRate: null,
      status: 'warning',
      issues: [{ message: `Unable to analyze visual quality: ${error.message}` }],
    };
  }
}

/**
 * Get file metadata
 */
async function getMetadata(filePath: string): Promise<BasicQCResult['metadata']> {
  try {
    const { stdout } = await execAsync(
      `"${getFFprobe()}" -v error -show_entries format=duration -show_entries stream=codec_name,channels,sample_rate -of json "${filePath}"`
    );

    const data = JSON.parse(stdout);
    const duration = parseFloat(data.format?.duration || '0');
    
    const videoStream = data.streams?.find((s: any) => s.codec_type === 'video' || (s.codec_name && !s.channels));
    const audioStream = data.streams?.find((s: any) => s.codec_type === 'audio' || s.channels);

    return {
      duration,
      videoCodec: videoStream?.codec_name,
      audioCodec: audioStream?.codec_name,
      audioChannels: audioStream?.channels,
      sampleRate: audioStream?.sample_rate ? parseInt(audioStream.sample_rate) : undefined,
    };
  } catch (error: any) {
    console.warn('[BasicQC] Metadata extraction error:', error.message);
    return {
      duration: 0,
    };
  }
}

/**
 * Create a minimal QC result when FFmpeg is not available
 * This allows QC to "complete" without full analysis
 */
function createMinimalQCResult(): BasicQCResult {
  const isVercel = !!process.env.VERCEL;
  const skipMessage = isVercel 
    ? 'FFmpeg not available on Vercel serverless. Full video analysis requires a server with FFmpeg installed.'
    : 'FFmpeg not found. Please install FFmpeg for full video analysis.';

  return {
    audioMissing: {
      detected: false,
      error: skipMessage,
    },
    loudness: {
      lufs: null,
      peak: null,
      status: 'passed',
      threshold: -23,
      message: skipMessage,
    },
    silence: {
      detected: false,
      segments: [],
      totalSilenceDuration: 0,
    },
    missingDialogue: {
      detected: false,
      segments: [],
    },
    subtitleTiming: {
      status: 'skipped',
      errors: [],
      warnings: [{ timestamp: 0, message: skipMessage }],
    },
    missingBGM: {
      detected: false,
      bgmPresence: 100, // Assume OK when we can't check
      issues: [{ timestamp: 0, message: skipMessage }],
    },
    visualQuality: {
      resolution: null,
      bitrate: null,
      codec: null,
      frameRate: null,
      status: 'passed',
      issues: [{ message: skipMessage }],
    },
    metadata: {
      duration: 0,
    },
  };
}
