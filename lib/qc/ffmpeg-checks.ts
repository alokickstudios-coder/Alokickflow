/**
 * FFmpeg-based QC Checks
 * Industry-standard quality control for video and audio files
 */

import { exec } from "child_process";
import { promisify } from "util";
import { readFile } from "fs/promises";
import { getFFmpegPath, getFFprobePath } from "../services/qc/ffmpegPaths";

const execAsync = promisify(exec);

// Get binary paths (works on both local and Vercel)
const FFMPEG = getFFmpegPath();
const FFPROBE = getFFprobePath();

export interface QCResult {
  status: "passed" | "failed";
  errors: QCError[];
  warnings: QCWarning[];
  metadata: {
    duration: number;
    videoCodec?: string;
    audioCodec?: string;
    resolution?: string;
    frameRate?: number;
    audioChannels?: number;
    sampleRate?: number;
  };
}

export interface QCError {
  type: string;
  message: string;
  timestamp: number;
  severity: "error" | "warning";
}

export interface QCWarning {
  type: string;
  message: string;
  timestamp: number;
}

export interface SRTQCResult {
  status: "passed" | "failed";
  errors: QCError[];
  warnings: QCWarning[];
  metadata: {
    totalSubtitles: number;
    totalDuration: number;
  };
}

/**
 * Check if audio track exists in video file
 */
export async function checkAudioMissing(filePath: string): Promise<QCError | null> {
  try {
    const { stdout } = await execAsync(
      `"${FFPROBE}" -v error -select_streams a:0 -show_entries stream=codec_type -of csv=p=0 "${filePath}"`
    );

    if (!stdout.trim() || !stdout.includes("audio")) {
      return {
        type: "Audio Missing",
        message: "No audio track detected in video file",
        timestamp: 0,
        severity: "error",
      };
    }
    return null;
  } catch (error) {
    return {
      type: "Audio Missing",
      message: "Unable to verify audio track",
      timestamp: 0,
      severity: "error",
    };
  }
}

/**
 * Check for missing dialogue (silence detection)
 */
export async function checkMissingDialogue(
  filePath: string,
  expectedDuration: number
): Promise<QCError[]> {
  const errors: QCError[] = [];

  try {
    // Detect silence using ffmpeg
    const { stdout } = await execAsync(
      `"${FFMPEG}" -i "${filePath}" -af silencedetect=noise=-30dB:d=2 -f null - 2>&1 | grep "silence_start"`
    );

    const silenceMatches = stdout.match(/silence_start: ([\d.]+)/g);
    if (silenceMatches) {
      const silenceDurations: number[] = [];
      let lastSilenceEnd = 0;

      silenceMatches.forEach((match) => {
        const start = parseFloat(match.split(": ")[1]);
        if (start - lastSilenceEnd > 5) {
          // More than 5 seconds of silence
          silenceDurations.push(start - lastSilenceEnd);
        }
        lastSilenceEnd = start;
      });

      if (silenceDurations.some((d) => d > 10)) {
        errors.push({
          type: "Missing Dialogue",
          message: "Extended silence detected (>10 seconds)",
          timestamp: lastSilenceEnd,
          severity: "error",
        });
      }
    }
  } catch (error) {
    // If no silence detected, that's fine
  }

  return errors;
}

/**
 * Check for lip-sync errors
 */
export async function checkLipSync(filePath: string): Promise<QCError[]> {
  const errors: QCError[] = [];

  try {
    // Get audio and video stream info
    const { stdout } = await execAsync(
      `"${FFPROBE}" -v error -show_entries stream=start_time,codec_type -of csv=p=0 "${filePath}"`
    );

    const lines = stdout.trim().split("\n");
    const audioStart = parseFloat(lines.find((l) => l.includes("audio"))?.split(",")[0] || "0");
    const videoStart = parseFloat(lines.find((l) => l.includes("video"))?.split(",")[0] || "0");

    const syncOffset = Math.abs(audioStart - videoStart);

    if (syncOffset > 0.1) {
      // More than 100ms offset
      errors.push({
        type: "Lip-Sync Error",
        message: `Audio-video sync offset detected: ${(syncOffset * 1000).toFixed(0)}ms`,
        timestamp: 0,
        severity: "error",
      });
    }
  } catch (error) {
    errors.push({
      type: "Lip-Sync Error",
      message: "Unable to verify lip-sync",
      timestamp: 0,
      severity: "warning",
    });
  }

  return errors;
}

/**
 * Check music and dialogue mix loudness (EBU R128 standard)
 */
export async function checkLoudnessMix(filePath: string): Promise<QCError[]> {
  const errors: QCError[] = [];

  try {
    // Analyze loudness using EBU R128
    const { stdout } = await execAsync(
      `"${FFMPEG}" -i "${filePath}" -af loudnorm=I=-23:TP=-2.0:LRA=7:print_format=json -f null - 2>&1 | grep -A 20 "Input\|Output"`
    );

    // Parse loudness values
    const inputMatch = stdout.match(/"input_i"\s*:\s*"([^"]+)"/);
    const inputLoudness = inputMatch ? parseFloat(inputMatch[1]) : null;

    if (inputLoudness !== null) {
      // Target: -23 LUFS ± 1 LU
      if (inputLoudness < -24 || inputLoudness > -22) {
        errors.push({
          type: "Loudness Mix Error",
          message: `Loudness ${inputLoudness.toFixed(1)} LUFS is outside target range (-24 to -22 LUFS)`,
          timestamp: 0,
          severity: "error",
        });
      }

      // Check for dialogue vs music balance
      // This would require more sophisticated analysis
      if (inputLoudness < -26) {
        errors.push({
          type: "Loudness Mix Error",
          message: "Dialogue may be too quiet compared to music",
          timestamp: 0,
          severity: "warning",
        });
      }
    }
  } catch (error) {
    errors.push({
      type: "Loudness Mix Error",
      message: "Unable to analyze loudness",
      timestamp: 0,
      severity: "warning",
    });
  }

  return errors;
}

/**
 * Check for video glitches (frame drops, corruption)
 */
export async function checkVideoGlitches(filePath: string): Promise<QCError[]> {
  const errors: QCError[] = [];

  try {
    // Check for frame drops and errors
    const { stderr } = await execAsync(
      `"${FFMPEG}" -i "${filePath}" -f null - 2>&1`
    );

    // Look for common error patterns
    if (stderr.includes("error") || stderr.includes("corrupt")) {
      errors.push({
        type: "Video Glitch",
        message: "Potential video corruption or errors detected",
        timestamp: 0,
        severity: "error",
      });
    }

    // Check frame rate consistency
    const frameRateMatch = stderr.match(/(\d+\.?\d*)\s*fps/);
    if (frameRateMatch) {
      const frameRate = parseFloat(frameRateMatch[1]);
      if (frameRate < 23.97 || frameRate > 30) {
        errors.push({
          type: "Video Glitch",
          message: `Unusual frame rate detected: ${frameRate.toFixed(2)} fps`,
          timestamp: 0,
          severity: "warning",
        });
      }
    }
  } catch (error) {
    // FFmpeg errors are expected in stderr
  }

  return errors;
}

/**
 * Check for missing BGM (background music)
 */
export async function checkMissingBGM(filePath: string): Promise<QCError[]> {
  const errors: QCError[] = [];

  try {
    // Analyze audio spectrum to detect if BGM is present
    // This is a simplified check - in production, use more sophisticated audio analysis
    const { stdout } = await execAsync(
      `"${FFPROBE}" -v error -show_entries stream=channels -of csv=p=0 "${filePath}" -select_streams a:0`
    );

    const channels = parseInt(stdout.trim());
    
    // Mono audio might indicate missing BGM (stereo is more common with BGM)
    if (channels === 1) {
      errors.push({
        type: "Missing BGM",
        message: "Mono audio detected - BGM may be missing",
        timestamp: 0,
        severity: "warning",
      });
    }

    // Check audio levels throughout the file
    // Low dynamic range might indicate missing BGM
    const { stdout: levels } = await execAsync(
      `"${FFMPEG}" -i "${filePath}" -af "volumedetect" -f null - 2>&1 | grep "mean_volume"`
    );

    const meanVolumeMatch = levels.match(/mean_volume:\s*([-\d.]+)\s*dB/);
    if (meanVolumeMatch) {
      const meanVolume = parseFloat(meanVolumeMatch[1]);
      if (meanVolume < -30) {
        errors.push({
          type: "Missing BGM",
          message: "Very low audio levels detected - BGM may be missing",
          timestamp: 0,
          severity: "warning",
        });
      }
    }
  } catch (error) {
    errors.push({
      type: "Missing BGM",
      message: "Unable to verify BGM presence",
      timestamp: 0,
      severity: "warning",
    });
  }

  return errors;
}

/**
 * Check SRT subtitle file for errors
 */
export async function checkSubtitleErrors(srtPath: string): Promise<SRTQCResult> {
  const errors: QCError[] = [];
  const warnings: QCWarning[] = [];

  try {
    const content = await readFile(srtPath, "utf-8");
    const lines = content.split("\n");

    let subtitleCount = 0;
    let currentSubtitle: { start?: number; end?: number; text?: string } = {};
    let lineNumber = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      lineNumber = i + 1;

      // Check for subtitle number
      if (/^\d+$/.test(line)) {
        subtitleCount++;
        currentSubtitle = {};
        continue;
      }

      // Check for timestamp
      const timestampMatch = line.match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/);
      if (timestampMatch) {
        const startTime =
          parseInt(timestampMatch[1]) * 3600 +
          parseInt(timestampMatch[2]) * 60 +
          parseInt(timestampMatch[3]) +
          parseInt(timestampMatch[4]) / 1000;
        const endTime =
          parseInt(timestampMatch[5]) * 3600 +
          parseInt(timestampMatch[6]) * 60 +
          parseInt(timestampMatch[7]) +
          parseInt(timestampMatch[8]) / 1000;

        currentSubtitle.start = startTime;
        currentSubtitle.end = endTime;

        if (endTime <= startTime) {
          errors.push({
            type: "Subtitle Error",
            message: `Invalid timestamp: end time must be after start time (line ${lineNumber})`,
            timestamp: startTime,
            severity: "error",
          });
        }

        if (endTime - startTime > 7) {
          warnings.push({
            type: "Subtitle Warning",
            message: `Subtitle displayed for more than 7 seconds (line ${lineNumber})`,
            timestamp: startTime,
          });
        }

        if (endTime - startTime < 0.5) {
          warnings.push({
            type: "Subtitle Warning",
            message: `Subtitle displayed for less than 0.5 seconds (line ${lineNumber})`,
            timestamp: startTime,
          });
        }
        continue;
      }

      // Check for subtitle text
      if (line && !timestampMatch && !/^\d+$/.test(line)) {
        currentSubtitle.text = line;

        // Check for common errors
        if (line.length > 42) {
          warnings.push({
            type: "Subtitle Warning",
            message: `Subtitle text exceeds recommended length (42 characters) at line ${lineNumber}`,
            timestamp: currentSubtitle.start || 0,
          });
        }

        // Check for HTML tags (should be removed)
        if (/<[^>]+>/.test(line)) {
          errors.push({
            type: "Subtitle Error",
            message: `HTML tags found in subtitle text (line ${lineNumber})`,
            timestamp: currentSubtitle.start || 0,
            severity: "error",
          });
        }
      }
    }

    if (subtitleCount === 0) {
      errors.push({
        type: "Subtitle Error",
        message: "No subtitles found in SRT file",
        timestamp: 0,
        severity: "error",
      });
    }

    return {
      status: errors.length > 0 ? "failed" : "passed",
      errors,
      warnings,
      metadata: {
        totalSubtitles: subtitleCount,
        totalDuration: 0, // Would need to calculate from last subtitle
      },
    };
  } catch (error: any) {
    return {
      status: "failed",
      errors: [
        {
          type: "Subtitle Error",
          message: `Failed to parse SRT file: ${error.message}`,
          timestamp: 0,
          severity: "error",
        },
      ],
      warnings: [],
      metadata: {
        totalSubtitles: 0,
        totalDuration: 0,
      },
    };
  }
}

/**
 * Run all QC checks on a video file
 */
export async function runVideoQC(filePath: string): Promise<QCResult> {
  const errors: QCError[] = [];
  const warnings: QCWarning[] = [];

  // Run all checks in parallel
  const [
    audioMissing,
    missingDialogue,
    lipSync,
    loudness,
    glitches,
    missingBGM,
  ] = await Promise.all([
    checkAudioMissing(filePath),
    checkMissingDialogue(filePath, 0),
    checkLipSync(filePath),
    checkLoudnessMix(filePath),
    checkVideoGlitches(filePath),
    checkMissingBGM(filePath),
  ]);

  if (audioMissing) errors.push(audioMissing);
  errors.push(...missingDialogue);
  errors.push(...lipSync);
  errors.push(...loudness);
  errors.push(...glitches);
  warnings.push(...missingBGM);

  // Get metadata
  let metadata = {
    duration: 0,
    videoCodec: undefined as string | undefined,
    audioCodec: undefined as string | undefined,
    resolution: undefined as string | undefined,
    frameRate: undefined as number | undefined,
    audioChannels: undefined as number | undefined,
    sampleRate: undefined as number | undefined,
  };

  try {
    const { stdout } = await execAsync(
      `"${FFPROBE}" -v error -show_entries format=duration -show_entries stream=codec_name,width,height,r_frame_rate,channels,sample_rate -of json "${filePath}"`
    );

    const probeData = JSON.parse(stdout);
    metadata.duration = parseFloat(probeData.format?.duration || "0");

    const videoStream = probeData.streams?.find((s: any) => s.codec_type === "video");
    const audioStream = probeData.streams?.find((s: any) => s.codec_type === "audio");

    if (videoStream) {
      metadata.videoCodec = videoStream.codec_name;
      metadata.resolution = `${videoStream.width}x${videoStream.height}`;
      if (videoStream.r_frame_rate) {
        const [num, den] = videoStream.r_frame_rate.split("/");
        metadata.frameRate = parseFloat(num) / parseFloat(den);
      }
    }

    if (audioStream) {
      metadata.audioCodec = audioStream.codec_name;
      metadata.audioChannels = audioStream.channels;
      metadata.sampleRate = parseInt(audioStream.sample_rate || "0");
    }
  } catch (error) {
    console.error("Error getting metadata:", error);
  }

  return {
    status: errors.length > 0 ? "failed" : "passed",
    errors,
    warnings,
    metadata,
  };
}

