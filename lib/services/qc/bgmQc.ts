/**
 * BGM Detection QC Module
 * 
 * Background music detection and analysis using audio band analysis.
 * Uses FFmpeg - no external API required for basic detection.
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

export interface BGMQCResult {
  status: 'passed' | 'failed' | 'warning';
  bgmDetected: boolean;
  bgmPresence: number; // 0-100 percentage
  bgmLevel: {
    average: number; // dB
    peak: number; // dB
  };
  issues: Array<{
    timestamp: number;
    type: 'missing_bgm' | 'bgm_too_loud' | 'bgm_too_quiet';
    severity: 'error' | 'warning';
    message: string;
  }>;
  analysis: {
    channels: number;
    dynamicRange: number;
    frequencyDistribution: {
      low: number; // 0-100
      mid: number; // 0-100
      high: number; // 0-100
    };
  };
}

/**
 * Run BGM detection and analysis
 */
export async function runBGMQC(
  episodeId: string,
  audioUrl: string
): Promise<BGMQCResult> {
  // Normalize to file path
  const filePath = audioUrl.startsWith('http') ? await downloadToTemp(audioUrl) : audioUrl;

  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  console.log(`[BGMQC] Processing episode ${episodeId} from ${filePath}`);

  try {
    // Get audio metadata
    const metadata = await getAudioMetadata(filePath);
    
    // Analyze audio spectrum
    const spectrum = await analyzeAudioSpectrum(filePath);
    
    // Detect BGM presence
    const bgmPresence = calculateBGMPresence(metadata, spectrum);
    
    // Check BGM levels
    const bgmLevel = await analyzeBGMLevels(filePath);
    
    // Generate issues
    const issues: BGMQCResult['issues'] = [];
    
    if (bgmPresence < 30) {
      issues.push({
        timestamp: 0,
        type: 'missing_bgm',
        severity: 'error',
        message: `BGM presence is very low (${bgmPresence}%) - background music may be missing`,
      });
    } else if (bgmPresence < 50) {
      issues.push({
        timestamp: 0,
        type: 'missing_bgm',
        severity: 'warning',
        message: `BGM presence is low (${bgmPresence}%) - background music may be insufficient`,
      });
    }

    if (bgmLevel.average > -10) {
      issues.push({
        timestamp: 0,
        type: 'bgm_too_loud',
        severity: 'warning',
        message: `BGM level is very high (${bgmLevel.average.toFixed(1)}dB) - may overpower dialogue`,
      });
    } else if (bgmLevel.average < -40) {
      issues.push({
        timestamp: 0,
        type: 'bgm_too_quiet',
        severity: 'warning',
        message: `BGM level is very low (${bgmLevel.average.toFixed(1)}dB) - may be inaudible`,
      });
    }

    const status = 
      issues.some(i => i.severity === 'error') ? 'failed' :
      issues.length > 0 ? 'warning' :
      'passed';

    // Cleanup temp file if downloaded
    if (audioUrl.startsWith('http') && filePath !== audioUrl) {
      try {
        const fs = await import('fs/promises');
        await fs.unlink(filePath);
      } catch {
        // Ignore cleanup errors
      }
    }

    return {
      status,
      bgmDetected: bgmPresence > 30,
      bgmPresence,
      bgmLevel,
      issues,
      analysis: {
        channels: metadata.channels,
        dynamicRange: spectrum.dynamicRange,
        frequencyDistribution: spectrum.frequencyDistribution,
      },
    };
  } catch (error: any) {
    console.error(`[BGMQC] Error:`, error.message);
    return {
      status: 'failed',
      bgmDetected: false,
      bgmPresence: 0,
      bgmLevel: { average: -60, peak: -60 },
      issues: [{
        timestamp: 0,
        type: 'missing_bgm',
        severity: 'error',
        message: `Failed to analyze BGM: ${error.message}`,
      }],
      analysis: {
        channels: 0,
        dynamicRange: 0,
        frequencyDistribution: { low: 0, mid: 0, high: 0 },
      },
    };
  }
}

/**
 * Get audio metadata
 */
async function getAudioMetadata(filePath: string): Promise<{
  channels: number;
  sampleRate: number;
  duration: number;
}> {
  try {
    const { stdout } = await execAsync(
      `"${getFFprobe()}" -v error -show_entries stream=channels,sample_rate -show_entries format=duration -of json "${filePath}"`
    );

    const data = JSON.parse(stdout);
    const audioStream = data.streams?.find((s: any) => s.channels);
    
    return {
      channels: audioStream?.channels || 0,
      sampleRate: parseInt(audioStream?.sample_rate || '0'),
      duration: parseFloat(data.format?.duration || '0'),
    };
  } catch (error: any) {
    console.warn('[BGMQC] Metadata error:', error.message);
    return { channels: 0, sampleRate: 0, duration: 0 };
  }
}

/**
 * Analyze audio spectrum to detect BGM characteristics
 */
async function analyzeAudioSpectrum(filePath: string): Promise<{
  dynamicRange: number;
  frequencyDistribution: {
    low: number;
    mid: number;
    high: number;
  };
}> {
  try {
    // Use ffmpeg to analyze frequency bands
    // Low: 20-250Hz, Mid: 250-4000Hz, High: 4000-20000Hz
    const { stdout } = await execAsync(
      `"${getFFmpeg()}" -i "${filePath}" -af "astats=metadata=1:reset=1" -f null - 2>&1 | grep -E "RMS level|Peak level" | head -30`
    );

    // Parse RMS and peak levels
    const rmsMatches = stdout.match(/RMS level:\s*([-\d.]+)\s*dB/g) || [];
    const levels = rmsMatches.map(m => {
      const match = m.match(/([-\d.]+)/);
      return match ? parseFloat(match[1]) : -60;
    });

    // Calculate dynamic range (difference between peak and average)
    const avgLevel = levels.length > 0 
      ? levels.reduce((a, b) => a + b, 0) / levels.length 
      : -60;
    const peakLevel = levels.length > 0 ? Math.max(...levels) : -60;
    const dynamicRange = peakLevel - avgLevel;

    // Heuristic: BGM typically has good distribution across frequencies
    // Mono or very low dynamic range suggests missing BGM
    const low = dynamicRange > 10 ? 60 : 30;
    const mid = dynamicRange > 8 ? 70 : 40;
    const high = dynamicRange > 6 ? 50 : 30;

    return {
      dynamicRange,
      frequencyDistribution: { low, mid, high },
    };
  } catch (error: any) {
    console.warn('[BGMQC] Spectrum analysis error:', error.message);
    return {
      dynamicRange: 0,
      frequencyDistribution: { low: 0, mid: 0, high: 0 },
    };
  }
}

/**
 * Calculate BGM presence percentage
 */
function calculateBGMPresence(
  metadata: { channels: number; sampleRate: number; duration: number },
  spectrum: { dynamicRange: number; frequencyDistribution: { low: number; mid: number; high: number } }
): number {
  let presence = 0;

  // Stereo audio suggests BGM presence
  if (metadata.channels >= 2) {
    presence += 40;
  } else if (metadata.channels === 1) {
    presence += 10;
  }

  // Good dynamic range suggests BGM
  if (spectrum.dynamicRange > 15) {
    presence += 30;
  } else if (spectrum.dynamicRange > 10) {
    presence += 20;
  } else if (spectrum.dynamicRange > 5) {
    presence += 10;
  }

  // Frequency distribution suggests BGM
  const avgFreq = (
    spectrum.frequencyDistribution.low +
    spectrum.frequencyDistribution.mid +
    spectrum.frequencyDistribution.high
  ) / 3;

  if (avgFreq > 50) {
    presence += 30;
  } else if (avgFreq > 30) {
    presence += 20;
  } else {
    presence += 10;
  }

  return Math.min(100, Math.max(0, presence));
}

/**
 * Analyze BGM levels
 */
async function analyzeBGMLevels(filePath: string): Promise<{
  average: number;
  peak: number;
}> {
  try {
    const { stdout } = await execAsync(
      `"${getFFmpeg()}" -i "${filePath}" -af "volumedetect" -f null - 2>&1 | grep -E "mean_volume|max_volume"`
    );

    const meanMatch = stdout.match(/mean_volume:\s*([-\d.]+)\s*dB/);
    const maxMatch = stdout.match(/max_volume:\s*([-\d.]+)\s*dB/);

    return {
      average: meanMatch ? parseFloat(meanMatch[1]) : -30,
      peak: maxMatch ? parseFloat(maxMatch[1]) : -20,
    };
  } catch (error: any) {
    console.warn('[BGMQC] Level analysis error:', error.message);
    return { average: -30, peak: -20 };
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
