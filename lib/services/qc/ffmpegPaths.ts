/**
 * FFmpeg/FFprobe Path Resolution
 * 
 * This module provides cross-platform paths to ffmpeg and ffprobe binaries.
 * - In development (local): Uses system-installed ffmpeg if available, falls back to static
 * - In production (Vercel): Uses static binaries from npm packages
 * 
 * NOTE: Path resolution is lazy to avoid errors at module load time.
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';

// Lazy-loaded static binary paths (to avoid errors at module load time)
let ffmpegStaticPath: string | null | undefined = undefined;
let ffprobeStaticPath: string | null | undefined = undefined;

function loadStaticPaths() {
  if (ffmpegStaticPath === undefined) {
    try {
      // @ts-ignore - These are optional dependencies
      ffmpegStaticPath = require('ffmpeg-static');
    } catch {
      ffmpegStaticPath = null;
    }
  }

  if (ffprobeStaticPath === undefined) {
    try {
      // @ts-ignore - These are optional dependencies  
      ffprobeStaticPath = require('ffprobe-static').path;
    } catch {
      ffprobeStaticPath = null;
    }
  }
}

/**
 * Check if a system binary exists
 */
function systemBinaryExists(name: string): string | null {
  try {
    const path = execSync(`which ${name}`, { encoding: 'utf-8' }).trim();
    if (path && existsSync(path)) {
      return path;
    }
  } catch {
    // Not found
  }
  return null;
}

/**
 * Get the path to ffmpeg binary
 * Prefers system binary in development, falls back to static
 */
export function getFFmpegPath(): string {
  // Load static paths lazily
  loadStaticPaths();
  
  // In development, prefer system ffmpeg (usually faster)
  if (process.env.NODE_ENV === 'development') {
    const systemPath = systemBinaryExists('ffmpeg');
    if (systemPath) {
      return systemPath;
    }
  }

  // Use static binary
  if (ffmpegStaticPath) {
    return ffmpegStaticPath;
  }

  // Fallback to system path (might work on some systems)
  const systemPath = systemBinaryExists('ffmpeg');
  if (systemPath) {
    return systemPath;
  }

  throw new Error(
    'FFmpeg not found. Please install ffmpeg-static: npm install ffmpeg-static'
  );
}

/**
 * Get the path to ffprobe binary
 * Prefers system binary in development, falls back to static
 */
export function getFFprobePath(): string {
  // Load static paths lazily
  loadStaticPaths();
  
  // In development, prefer system ffprobe (usually faster)
  if (process.env.NODE_ENV === 'development') {
    const systemPath = systemBinaryExists('ffprobe');
    if (systemPath) {
      return systemPath;
    }
  }

  // Use static binary
  if (ffprobeStaticPath) {
    return ffprobeStaticPath;
  }

  // Fallback to system path (might work on some systems)
  const systemPath = systemBinaryExists('ffprobe');
  if (systemPath) {
    return systemPath;
  }

  throw new Error(
    'FFprobe not found. Please install ffprobe-static: npm install ffprobe-static'
  );
}

/**
 * Check if FFmpeg is available
 */
export function isFFmpegAvailable(): boolean {
  try {
    getFFmpegPath();
    return true;
  } catch {
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
  } catch {
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
  usingStatic: boolean;
} {
  // Load static paths lazily
  loadStaticPaths();
  
  let ffmpegPath: string | null = null;
  let ffprobePath: string | null = null;
  let ffmpegAvailable = false;
  let ffprobeAvailable = false;

  try {
    ffmpegPath = getFFmpegPath();
    ffmpegAvailable = true;
  } catch {
    // Not available
  }

  try {
    ffprobePath = getFFprobePath();
    ffprobeAvailable = true;
  } catch {
    // Not available
  }

  const usingStatic = 
    (ffmpegPath === ffmpegStaticPath) || 
    (ffprobePath === ffprobeStaticPath);

  return {
    ffmpegPath,
    ffprobePath,
    ffmpegAvailable,
    ffprobeAvailable,
    usingStatic,
  };
}
