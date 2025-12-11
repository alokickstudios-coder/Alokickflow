/**
 * AlokickFlow QC Worker
 * 
 * Dedicated server for video processing with FFmpeg.
 * Deployed on Railway (free tier) to handle QC jobs.
 * 
 * Endpoints:
 * - POST /qc/process - Process a QC job
 * - GET /health - Health check
 * - GET /ffmpeg-check - Verify FFmpeg is available
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');

const execAsync = promisify(exec);
const app = express();

// Configuration
const PORT = process.env.PORT || 3001;
const WORKER_SECRET = process.env.WORKER_SECRET || 'dev-secret';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const TEMP_DIR = '/tmp/qc-worker';

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Auth middleware
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${WORKER_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// Supabase client
function getSupabase() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error('Supabase configuration missing');
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'alokickflow-qc-worker'
  });
});

// FFmpeg availability check
app.get('/ffmpeg-check', async (req, res) => {
  try {
    const { stdout: ffmpegVersion } = await execAsync('ffmpeg -version');
    const { stdout: ffprobeVersion } = await execAsync('ffprobe -version');
    
    res.json({
      status: 'ok',
      ffmpeg: ffmpegVersion.split('\n')[0],
      ffprobe: ffprobeVersion.split('\n')[0],
      tempDir: TEMP_DIR,
      tempDirExists: fs.existsSync(TEMP_DIR)
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message,
      hint: 'FFmpeg may not be installed'
    });
  }
});

// Download file from URL to temp
async function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);
    
    protocol.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Follow redirect
        downloadFile(response.headers.location, destPath)
          .then(resolve)
          .catch(reject);
        return;
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`Download failed: ${response.statusCode}`));
        return;
      }
      
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(destPath);
      });
    }).on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

// FFmpeg-based QC checks
async function runFFmpegQC(filePath) {
  const result = {
    audioMissing: { detected: false },
    loudness: { lufs: null, peak: null, status: 'passed', threshold: -23 },
    silence: { detected: false, segments: [], totalSilenceDuration: 0 },
    missingDialogue: { detected: false, segments: [] },
    subtitleTiming: { status: 'skipped', errors: [], warnings: [] },
    missingBGM: { detected: false, bgmPresence: 100, issues: [] },
    visualQuality: { resolution: null, bitrate: null, codec: null, frameRate: null, status: 'passed', issues: [] },
    metadata: { duration: 0 }
  };

  try {
    // 1. Get metadata
    console.log('[QC Worker] Getting metadata...');
    const { stdout: metaJson } = await execAsync(
      `ffprobe -v error -show_entries format=duration,bit_rate -show_entries stream=codec_name,codec_type,width,height,r_frame_rate,channels,sample_rate -of json "${filePath}"`
    );
    
    const meta = JSON.parse(metaJson);
    const videoStream = meta.streams?.find(s => s.codec_type === 'video');
    const audioStream = meta.streams?.find(s => s.codec_type === 'audio');
    
    result.metadata.duration = parseFloat(meta.format?.duration || '0');
    result.metadata.videoCodec = videoStream?.codec_name;
    result.metadata.audioCodec = audioStream?.codec_name;
    result.metadata.audioChannels = audioStream?.channels;
    result.metadata.sampleRate = audioStream?.sample_rate ? parseInt(audioStream.sample_rate) : undefined;
    
    // Visual quality
    if (videoStream) {
      result.visualQuality.resolution = videoStream.width && videoStream.height 
        ? `${videoStream.width}x${videoStream.height}` 
        : null;
      result.visualQuality.codec = videoStream.codec_name;
      
      if (videoStream.r_frame_rate) {
        const [num, den] = videoStream.r_frame_rate.split('/');
        result.visualQuality.frameRate = den ? Math.round(parseInt(num) / parseInt(den)) : parseInt(num);
      }
      
      // Check resolution
      const minWidth = 1280;
      const minHeight = 720;
      if (videoStream.width < minWidth || videoStream.height < minHeight) {
        result.visualQuality.status = 'warning';
        result.visualQuality.issues.push({ 
          message: `Resolution ${videoStream.width}x${videoStream.height} is below recommended ${minWidth}x${minHeight}` 
        });
      }
    }
    
    if (meta.format?.bit_rate) {
      result.visualQuality.bitrate = parseInt(meta.format.bit_rate);
    }

    // 2. Check audio missing
    console.log('[QC Worker] Checking audio...');
    if (!audioStream) {
      result.audioMissing.detected = true;
      result.audioMissing.error = 'No audio stream found';
    }

    // 3. Loudness analysis (EBU R128)
    if (audioStream) {
      console.log('[QC Worker] Analyzing loudness...');
      try {
        const { stderr: loudnessOutput } = await execAsync(
          `ffmpeg -i "${filePath}" -af "loudnorm=I=-23:TP=-1:LRA=11:print_format=json" -f null - 2>&1 | grep -A 20 "input_i"`,
          { timeout: 120000 }
        );
        
        // Parse loudness from output
        const lufsMatch = loudnessOutput.match(/"input_i"\s*:\s*"(-?\d+\.?\d*)"/);
        const peakMatch = loudnessOutput.match(/"input_tp"\s*:\s*"(-?\d+\.?\d*)"/);
        
        if (lufsMatch) {
          result.loudness.lufs = parseFloat(lufsMatch[1]);
          result.loudness.peak = peakMatch ? parseFloat(peakMatch[1]) : null;
          
          // Check against EBU R128 standard (-24 to -22 LUFS)
          if (result.loudness.lufs < -26 || result.loudness.lufs > -20) {
            result.loudness.status = 'failed';
            result.loudness.message = `Loudness ${result.loudness.lufs.toFixed(1)} LUFS is outside recommended range (-24 to -22 LUFS)`;
          } else if (result.loudness.lufs < -24 || result.loudness.lufs > -22) {
            result.loudness.status = 'warning';
            result.loudness.message = `Loudness ${result.loudness.lufs.toFixed(1)} LUFS is slightly outside target (-23 LUFS)`;
          }
        }
      } catch (e) {
        console.warn('[QC Worker] Loudness analysis failed:', e.message);
        result.loudness.message = 'Loudness analysis failed';
      }
    }

    // 4. Silence detection
    if (audioStream) {
      console.log('[QC Worker] Detecting silence...');
      try {
        const { stderr: silenceOutput } = await execAsync(
          `ffmpeg -i "${filePath}" -af "silencedetect=n=-50dB:d=2" -f null - 2>&1`,
          { timeout: 120000 }
        );
        
        const silenceRegex = /silence_start: ([\d.]+)[\s\S]*?silence_end: ([\d.]+)/g;
        let match;
        const segments = [];
        let totalSilence = 0;
        
        while ((match = silenceRegex.exec(silenceOutput)) !== null) {
          const start = parseFloat(match[1]);
          const end = parseFloat(match[2]);
          const duration = end - start;
          segments.push({ start, end, duration });
          totalSilence += duration;
        }
        
        result.silence.segments = segments;
        result.silence.totalSilenceDuration = totalSilence;
        result.silence.detected = segments.length > 0;
        
        // Flag if excessive silence
        if (segments.length > 5 || totalSilence > result.metadata.duration * 0.2) {
          result.missingDialogue.detected = true;
          result.missingDialogue.segments = segments.slice(0, 10).map(s => ({
            start: s.start,
            end: s.end,
            message: `Extended silence (${s.duration.toFixed(1)}s)`
          }));
        }
      } catch (e) {
        console.warn('[QC Worker] Silence detection failed:', e.message);
      }
    }

    // 5. BGM presence check (basic frequency analysis)
    if (audioStream && result.metadata.duration > 0) {
      console.log('[QC Worker] Checking BGM presence...');
      try {
        // Check for low frequency content (typically BGM)
        const { stderr: spectrumOutput } = await execAsync(
          `ffmpeg -i "${filePath}" -af "lowpass=f=300,volumedetect" -f null - 2>&1`,
          { timeout: 60000 }
        );
        
        const meanVolMatch = spectrumOutput.match(/mean_volume:\s*(-?\d+\.?\d*)/);
        if (meanVolMatch) {
          const meanVol = parseFloat(meanVolMatch[1]);
          // If low frequency content is very quiet, BGM might be missing
          if (meanVol < -40) {
            result.missingBGM.detected = true;
            result.missingBGM.bgmPresence = Math.max(0, 100 + (meanVol + 40) * 2);
            result.missingBGM.issues.push({
              timestamp: 0,
              message: 'Low background music presence detected'
            });
          }
        }
      } catch (e) {
        console.warn('[QC Worker] BGM check failed:', e.message);
      }
    }

    console.log('[QC Worker] QC analysis complete');
    return result;
    
  } catch (error) {
    console.error('[QC Worker] FFmpeg QC error:', error);
    throw error;
  }
}

// Video glitch detection (black frames, frozen frames)
async function runVideoGlitchQC(filePath) {
  const result = {
    status: 'passed',
    blackFrames: [],
    frozenFrames: [],
    frameRateIssues: []
  };

  try {
    // Detect black frames
    console.log('[QC Worker] Detecting black frames...');
    const { stderr: blackOutput } = await execAsync(
      `ffmpeg -i "${filePath}" -vf "blackdetect=d=0.5:pix_th=0.10" -f null - 2>&1`,
      { timeout: 120000 }
    );
    
    const blackRegex = /black_start:([\d.]+)\s+black_end:([\d.]+)/g;
    let match;
    while ((match = blackRegex.exec(blackOutput)) !== null) {
      result.blackFrames.push({
        start: parseFloat(match[1]),
        end: parseFloat(match[2]),
        duration: parseFloat(match[2]) - parseFloat(match[1])
      });
    }
    
    if (result.blackFrames.length > 0) {
      result.status = result.blackFrames.length > 3 ? 'failed' : 'warning';
    }
    
    // Detect frozen frames
    console.log('[QC Worker] Detecting frozen frames...');
    const { stderr: freezeOutput } = await execAsync(
      `ffmpeg -i "${filePath}" -vf "freezedetect=n=0.003:d=1" -f null - 2>&1`,
      { timeout: 120000 }
    );
    
    const freezeRegex = /freeze_start:([\d.]+)\s+freeze_end:([\d.]+)/g;
    while ((match = freezeRegex.exec(freezeOutput)) !== null) {
      result.frozenFrames.push({
        start: parseFloat(match[1]),
        end: parseFloat(match[2]),
        duration: parseFloat(match[2]) - parseFloat(match[1])
      });
    }
    
    if (result.frozenFrames.length > 0) {
      result.status = result.frozenFrames.length > 2 ? 'failed' : 'warning';
    }
    
    return result;
  } catch (error) {
    console.warn('[QC Worker] Video glitch detection error:', error.message);
    return { ...result, error: error.message };
  }
}

// Main QC processing endpoint
app.post('/qc/process', authMiddleware, async (req, res) => {
  const jobId = uuidv4();
  const startTime = Date.now();
  
  console.log(`[QC Worker] Job ${jobId} started`);
  
  try {
    const { fileUrl, storagePath, fileName, jobData } = req.body;
    
    if (!fileUrl && !storagePath) {
      return res.status(400).json({ error: 'fileUrl or storagePath required' });
    }
    
    // Create temp file path
    const ext = path.extname(fileName || 'video.mp4') || '.mp4';
    const tempPath = path.join(TEMP_DIR, `${jobId}${ext}`);
    
    // Download file
    console.log(`[QC Worker] Downloading file...`);
    let downloadUrl = fileUrl;
    
    // If storagePath provided, get signed URL from Supabase
    if (storagePath && !fileUrl) {
      const supabase = getSupabase();
      const { data, error } = await supabase.storage
        .from('deliveries')
        .createSignedUrl(storagePath, 3600); // 1 hour expiry
      
      if (error) throw new Error(`Failed to get signed URL: ${error.message}`);
      downloadUrl = data.signedUrl;
    }
    
    await downloadFile(downloadUrl, tempPath);
    console.log(`[QC Worker] File downloaded to ${tempPath}`);
    
    // Verify file exists
    const stats = fs.statSync(tempPath);
    console.log(`[QC Worker] File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    
    // Run QC checks
    const basicQC = await runFFmpegQC(tempPath);
    const videoGlitch = await runVideoGlitchQC(tempPath);
    
    // Cleanup
    try {
      fs.unlinkSync(tempPath);
      console.log(`[QC Worker] Temp file cleaned up`);
    } catch (e) {
      console.warn(`[QC Worker] Cleanup failed:`, e.message);
    }
    
    const processingTime = Date.now() - startTime;
    console.log(`[QC Worker] Job ${jobId} completed in ${processingTime}ms`);
    
    // Calculate overall score and status
    let score = 100;
    let hasCriticalErrors = false;
    let hasWarnings = false;
    
    if (basicQC.audioMissing.detected) {
      score -= 30;
      hasCriticalErrors = true;
    }
    if (basicQC.loudness.status === 'failed') {
      score -= 15;
      hasCriticalErrors = true;
    } else if (basicQC.loudness.status === 'warning') {
      score -= 5;
      hasWarnings = true;
    }
    if (basicQC.silence.detected && basicQC.silence.segments.length > 5) {
      score -= 10;
      hasWarnings = true;
    }
    if (basicQC.missingDialogue.detected) {
      score -= 10;
      hasWarnings = true;
    }
    if (basicQC.visualQuality.status === 'failed') {
      score -= 15;
      hasCriticalErrors = true;
    } else if (basicQC.visualQuality.status === 'warning') {
      score -= 5;
      hasWarnings = true;
    }
    if (videoGlitch.status === 'failed') {
      score -= 15;
      hasCriticalErrors = true;
    } else if (videoGlitch.status === 'warning') {
      score -= 5;
      hasWarnings = true;
    }
    
    score = Math.max(0, Math.min(100, score));
    
    let status = 'passed';
    if (hasCriticalErrors || score < 50) {
      status = 'failed';
    } else if (hasWarnings || score < 70) {
      status = 'needs_review';
    }
    
    res.json({
      success: true,
      jobId,
      status,
      score,
      basicQC,
      videoGlitch,
      processingTime,
      processedAt: new Date().toISOString()
    });
    
  } catch (error) {
    console.error(`[QC Worker] Job ${jobId} failed:`, error);
    res.status(500).json({
      success: false,
      jobId,
      error: error.message,
      processingTime: Date.now() - startTime
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 AlokickFlow QC Worker running on port ${PORT}`);
  console.log(`📁 Temp directory: ${TEMP_DIR}`);
  
  // Check FFmpeg availability on startup
  exec('ffmpeg -version', (err, stdout) => {
    if (err) {
      console.error('⚠️  FFmpeg not found! Install FFmpeg for QC to work.');
    } else {
      console.log('✅ FFmpeg available:', stdout.split('\n')[0]);
    }
  });
});
