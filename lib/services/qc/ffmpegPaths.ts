/**
 * FFmpeg/FFprobe Path Resolution
 * 
 * This module provides cross-platform paths to ffmpeg and ffprobe binaries.
 * In Docker/production, FFmpeg is installed via apk/apt.
 * In development, uses system-installed FFmpeg.
 */

import { execSync } from 'child_process';

// Cache for paths
let _ffmpegPath: string | null = null;
let _ffprobePath: string | null = null;

/**
 * Find system binary path
 */
function findBinary(name: string): string | null {
  try {
    // Try 'which' (Unix/Linux/Mac)
    const path = execSync(`which ${name} 2>/dev/null`, { encoding: 'utf-8' }).trim();
    if (path) return path;
  } catch (whichError: any) {
    // 'which' command failed, try common paths directly
    console.debug(`[FFmpegPaths] 'which ${name}' failed, checking common paths`);
    const commonPaths = [
      `/usr/bin/${name}`,
      `/usr/local/bin/${name}`,
      `/opt/homebrew/bin/${name}`,
    ];
    
    for (const p of commonPaths) {
      try {
        execSync(`test -x "${p}"`, { encoding: 'utf-8' });
        return p;
      } catch (pathError: any) {
        // Path doesn't exist or isn't executable, continue to next
        continue;
      }
    }
  }
  return null;
}

/**
 * Get the path to ffmpeg binary
 */
export function getFFmpegPath(): string {
  if (_ffmpegPath) return _ffmpegPath;
  
  const path = findBinary('ffmpeg');
  if (path) {
    _ffmpegPath = path;
    return path;
  }

  throw new Error(
    'FFmpeg not found. Please ensure FFmpeg is installed in the system. ' +
    'In Docker, add: RUN apk add --no-cache ffmpeg'
  );
}

/**
 * Get the path to ffprobe binary
 */
export function getFFprobePath(): string {
  if (_ffprobePath) return _ffprobePath;
  
  const path = findBinary('ffprobe');
  if (path) {
    _ffprobePath = path;
    return path;
  }

  throw new Error(
    'FFprobe not found. Please ensure FFmpeg is installed in the system. ' +
    'In Docker, add: RUN apk add --no-cache ffmpeg'
  );
}

/**
 * Check if FFmpeg is available
 */
export function isFFmpegAvailable(): boolean {
  try {
    getFFmpegPath();
    return true;
  } catch (error: any) {
    console.debug(`[FFmpegPaths] FFmpeg not available: ${error.message}`);
    return false;
  }
}

/**
 * Check if FFprobe is available
 */
export function isFFprobeAvailable(): boolean {
  try {
    getFFprobePath();
    return true;
  } catch (error: any) {
    console.debug(`[FFmpegPaths] FFprobe not available: ${error.message}`);
    return false;
  }
}

/**
 * Get diagnostic info about FFmpeg availability
 */
export function getFFmpegDiagnostics(): {
  ffmpegPath: string | null;
  ffprobePath: string | null;
  ffmpegAvailable: boolean;
  ffprobeAvailable: boolean;
} {
  let ffmpegPath: string | null = null;
  let ffprobePath: string | null = null;
  let ffmpegAvailable = false;
  let ffprobeAvailable = false;

  try {
    ffmpegPath = getFFmpegPath();
    ffmpegAvailable = true;
  } catch (ffmpegError: any) {
    console.debug(`[FFmpegPaths] FFmpeg diagnostic: ${ffmpegError.message}`);
  }

  try {
    ffprobePath = getFFprobePath();
    ffprobeAvailable = true;
  } catch (ffprobeError: any) {
    console.debug(`[FFmpegPaths] FFprobe diagnostic: ${ffprobeError.message}`);
  }

  return {
    ffmpegPath,
    ffprobePath,
    ffmpegAvailable,
    ffprobeAvailable,
  };
}
