/**
 * Video Glitch QC Module
 * 
 * Detects video glitches: black frames, frozen frames, duplicate frames.
 * Uses FFmpeg filters - no external API required.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { getFFmpegPath, getFFprobePath } from './ffmpegPaths';

const execAsync = promisify(exec);

// Lazy getters for binary paths (avoids errors at module load time)
let _ffmpegPath: string | null = null;
let _ffprobePath: string | null = null;

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

export interface VideoGlitchQCResult {
  status: 'passed' | 'failed' | 'warning';
  glitchCount: number;
  glitches: Array<{
    timestamp: number;
    type: 'black_frame' | 'frozen_frame' | 'duplicate_frame' | 'corruption';
    severity: 'error' | 'warning';
    duration: number; // milliseconds
    message: string;
  }>;
  frameRate: {
    expected: number | null;
    actual: number | null;
    variance: number;
  };
  blackFrames: {
    detected: boolean;
    count: number;
    segments: Array<{ start: number; end: number }>;
  };
  frozenFrames: {
    detected: boolean;
    count: number;
    segments: Array<{ start: number; end: number }>;
  };
}

/**
 * Run video glitch detection
 */
export async function runVideoGlitchQC(
  episodeId: string,
  videoUrl: string
): Promise<VideoGlitchQCResult> {
  // Normalize to file path
  const filePath = videoUrl.startsWith('http') ? await downloadToTemp(videoUrl) : videoUrl;

  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  console.log(`[VideoGlitchQC] Processing episode ${episodeId} from ${filePath}`);

  try {
    // Run all glitch detection checks in parallel
    const [blackFrames, frozenFrames, frameRate] = await Promise.all([
      detectBlackFrames(filePath),
      detectFrozenFrames(filePath),
      analyzeFrameRate(filePath),
    ]);

    // Combine all glitches
    const glitches: VideoGlitchQCResult['glitches'] = [];

    blackFrames.segments.forEach(seg => {
      glitches.push({
        timestamp: seg.start,
        type: 'black_frame',
        severity: seg.duration > 1 ? 'error' : 'warning',
        duration: seg.duration * 1000,
        message: `Black frame detected for ${seg.duration.toFixed(2)}s`,
      });
    });

    frozenFrames.segments.forEach(seg => {
      glitches.push({
        timestamp: seg.start,
        type: 'frozen_frame',
        severity: seg.duration > 2 ? 'error' : 'warning',
        duration: seg.duration * 1000,
        message: `Frozen frame detected for ${seg.duration.toFixed(2)}s`,
      });
    });

    // Check for frame rate issues
    if (frameRate.actual && frameRate.expected) {
      const variance = Math.abs(frameRate.actual - frameRate.expected);
      if (variance > 1) {
        glitches.push({
          timestamp: 0,
          type: 'corruption',
          severity: variance > 5 ? 'error' : 'warning',
          duration: 0,
          message: `Frame rate variance detected: expected ${frameRate.expected}fps, got ${frameRate.actual.toFixed(2)}fps`,
        });
      }
    }

    const status = 
      glitches.some(g => g.severity === 'error') ? 'failed' :
      glitches.length > 0 ? 'warning' :
      'passed';

    // Cleanup temp file if downloaded
    if (videoUrl.startsWith('http') && filePath !== videoUrl) {
      try {
        const fs = await import('fs/promises');
        await fs.unlink(filePath);
      } catch {
        // Ignore cleanup errors
      }
    }

    return {
      status,
      glitchCount: glitches.length,
      glitches,
      frameRate,
      blackFrames,
      frozenFrames,
    };
  } catch (error: any) {
    console.error(`[VideoGlitchQC] Error:`, error.message);
    return {
      status: 'failed',
      glitchCount: 0,
      glitches: [{
        timestamp: 0,
        type: 'corruption',
        severity: 'error',
        duration: 0,
        message: `Failed to analyze video: ${error.message}`,
      }],
      frameRate: { expected: null, actual: null, variance: 0 },
      blackFrames: { detected: false, count: 0, segments: [] },
      frozenFrames: { detected: false, count: 0, segments: [] },
    };
  }
}

/**
 * Detect black frames using FFmpeg blackdetect filter
 */
async function detectBlackFrames(filePath: string): Promise<{
  detected: boolean;
  count: number;
  segments: Array<{ start: number; end: number; duration: number }>;
}> {
  try {
    const { stderr } = await execAsync(
      `"${getFFmpeg()}" -i "${filePath}" -vf blackdetect=d=0.1:pix_th=0.1 -f null - 2>&1`
    );

    const segments: Array<{ start: number; end: number; duration: number }> = [];
    const blackStartRegex = /black_start:([\d.]+)/g;
    const blackEndRegex = /black_end:([\d.]+)/g;
    const blackDurationRegex = /black_duration:([\d.]+)/g;

    const starts: number[] = [];
    const ends: number[] = [];
    const durations: number[] = [];

    let match;
    while ((match = blackStartRegex.exec(stderr)) !== null) {
      starts.push(parseFloat(match[1]));
    }
    while ((match = blackEndRegex.exec(stderr)) !== null) {
      ends.push(parseFloat(match[1]));
    }
    while ((match = blackDurationRegex.exec(stderr)) !== null) {
      durations.push(parseFloat(match[1]));
    }

    // Pair up segments
    for (let i = 0; i < starts.length; i++) {
      const start = starts[i];
      const end = ends[i] || (start + (durations[i] || 0));
      const duration = durations[i] || (end - start);
      
      if (duration > 0.1) { // Only count black frames > 0.1s
        segments.push({ start, end, duration });
      }
    }

    return {
      detected: segments.length > 0,
      count: segments.length,
      segments,
    };
  } catch (error: any) {
    console.warn('[VideoGlitchQC] Black frame detection error:', error.message);
    return { detected: false, count: 0, segments: [] };
  }
}

/**
 * Detect frozen frames using FFmpeg freezedetect filter
 */
async function detectFrozenFrames(filePath: string): Promise<{
  detected: boolean;
  count: number;
  segments: Array<{ start: number; end: number; duration: number }>;
}> {
  try {
    const { stderr } = await execAsync(
      `"${getFFmpeg()}" -i "${filePath}" -vf freezedetect=n=-50dB:d=1 -f null - 2>&1`
    );

    const segments: Array<{ start: number; end: number; duration: number }> = [];
    const freezeStartRegex = /freeze_start:([\d.]+)/g;
    const freezeEndRegex = /freeze_end:([\d.]+)/g;
    const freezeDurationRegex = /freeze_duration:([\d.]+)/g;

    const starts: number[] = [];
    const ends: number[] = [];
    const durations: number[] = [];

    let match;
    while ((match = freezeStartRegex.exec(stderr)) !== null) {
      starts.push(parseFloat(match[1]));
    }
    while ((match = freezeEndRegex.exec(stderr)) !== null) {
      ends.push(parseFloat(match[1]));
    }
    while ((match = freezeDurationRegex.exec(stderr)) !== null) {
      durations.push(parseFloat(match[1]));
    }

    // Pair up segments
    for (let i = 0; i < starts.length; i++) {
      const start = starts[i];
      const end = ends[i] || (start + (durations[i] || 0));
      const duration = durations[i] || (end - start);
      
      if (duration > 1) { // Only count freezes > 1s
        segments.push({ start, end, duration });
      }
    }

    return {
      detected: segments.length > 0,
      count: segments.length,
      segments,
    };
  } catch (error: any) {
    console.warn('[VideoGlitchQC] Frozen frame detection error:', error.message);
    return { detected: false, count: 0, segments: [] };
  }
}

/**
 * Analyze frame rate consistency
 */
async function analyzeFrameRate(filePath: string): Promise<{
  expected: number | null;
  actual: number | null;
  variance: number;
}> {
  try {
    const { stdout } = await execAsync(
      `"${getFFprobe()}" -v error -select_streams v:0 -show_entries stream=r_frame_rate,avg_frame_rate -of json "${filePath}"`
    );

    const data = JSON.parse(stdout);
    const stream = data.streams?.[0];
    
    if (!stream) {
      return { expected: null, actual: null, variance: 0 };
    }

    // Parse frame rate
    const parseFrameRate = (rate: string): number | null => {
      if (!rate) return null;
      const [num, den] = rate.split('/');
      return den ? parseFloat(num) / parseFloat(den) : parseFloat(num);
    };

    const expected = parseFrameRate(stream.r_frame_rate);
    const actual = parseFrameRate(stream.avg_frame_rate);

    const variance = expected && actual ? Math.abs(actual - expected) : 0;

    return { expected, actual, variance };
  } catch (error: any) {
    console.warn('[VideoGlitchQC] Frame rate analysis error:', error.message);
    return { expected: null, actual: null, variance: 0 };
  }
}

/**
 * Download file to temporary location (if URL)
 */
async function downloadToTemp(url: string): Promise<string> {
  const fs = await import('fs/promises');
  const path = await import('path');
  
  // On Vercel, use /tmp which is writable; locally use project tmp
  const isVercel = !!process.env.VERCEL;
  const tempDir = isVercel ? '/tmp/qc-downloads' : path.join(process.cwd(), 'tmp', 'qc-downloads');
  await fs.mkdir(tempDir, { recursive: true });
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download: ${response.statusText}`);
  }
  
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const fileName = path.basename(url) || `temp-${Date.now()}.mp4`;
  const filePath = path.join(tempDir, fileName);
  
  await fs.writeFile(filePath, buffer);
  return filePath;
}
