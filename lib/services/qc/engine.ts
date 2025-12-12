/**
 * QC Engine - Environment-Agnostic
 * 
 * Main orchestrator for running comprehensive QC analysis.
 * Coordinates all QC modules based on enabled features.
 * 
 * This engine is designed to work in any environment:
 * - Local dev
 * - Vercel (serverless)
 * - Dedicated server
 * 
 * NO environment-specific assumptions.
 */

import { runBasicQC, BasicQCResult } from './basicQc';
import { runLipSyncQC, LipSyncQCResult } from './lipSyncQc';
import { runBGMQC, BGMQCResult } from './bgmQc';
import { runVideoGlitchQC, VideoGlitchQCResult } from './videoGlitchQc';
import { generatePremiumReport, PremiumQCReport } from './premiumReport';
import { hasFeature } from '@/lib/services/subscriptionService';

export interface QCFeatures {
  basicQC: boolean;
  lipSyncQC: boolean;
  videoGlitchQC: boolean;
  bgmQC: boolean;
  premiumReport: boolean;
  creativeQC: boolean; // Enterprise-only Creative QC (SPI)
}

export interface QCResult {
  episodeId: string;
  seriesId: string;
  organisationId: string;
  status: 'passed' | 'failed' | 'needs_review' | 'processing' | 'error';
  score: number; // 0-100
  basicQC: BasicQCResult;
  lipSync?: LipSyncQCResult;
  videoGlitch?: VideoGlitchQCResult;
  bgm?: BGMQCResult;
  premiumReport?: PremiumQCReport;
  // Creative QC (SPI) results - Enterprise only
  creativeQC?: {
    status: 'pending' | 'running' | 'completed' | 'failed';
    overallCreativeScore?: number;
    overallRiskScore?: number;
    overallBrandFitScore?: number;
    parameters?: Record<string, any>;
    summary?: string;
    recommendations?: string[];
    error?: string;
  };
  errors: Array<{
    module: string;
    error: string;
  }>;
  analyzedAt: string;
  processingTime: number; // milliseconds
}

export interface QcJobContext {
  filePath: string;
  fileName: string;
  cleanup?: () => Promise<void>;
}

export interface RunQCOptions {
  organisationId: string;
  seriesId: string;
  episodeId: string;
  fileInfo: {
    filePath: string;
    fileName: string;
    subtitlesPath?: string;
  };
  featuresEnabled: QCFeatures;
  deliveryId?: string;
}

// Progress callback type
export type ProgressCallback = (percent: number, stage?: string) => Promise<void>;

/**
 * Run QC for a job (used by worker)
 */
export async function runQcForJob(
  job: any,
  context: QcJobContext,
  featuresEnabled: QCFeatures,
  onProgress?: ProgressCallback
): Promise<QCResult> {
  const startTime = Date.now();
  const errors: QCResult['errors'] = [];

  console.log(`[QCEngine] Starting QC for job ${job.id}`);

  // Count enabled modules for progress tracking
  const enabledModules = [
    true, // basicQC always runs
    featuresEnabled.lipSyncQC,
    featuresEnabled.videoGlitchQC,
    featuresEnabled.bgmQC,
    featuresEnabled.premiumReport,
  ].filter(Boolean).length;
  let completedModules = 0;

  const reportProgress = async (stage: string) => {
    completedModules++;
    const percent = Math.floor((completedModules / enabledModules) * 100);
    if (onProgress) await onProgress(percent, stage);
  };

  // Always run basic QC if enabled
  let basicQC: BasicQCResult;
  try {
    if (onProgress) await onProgress(5, "basic_qc_start");
    basicQC = await runBasicQC(
      job.episode_id || job.id,
      {
        filePath: context.filePath,
        fileName: context.fileName,
      },
      undefined // subtitles can be added later if needed
    );
    await reportProgress("basic_qc_complete");
  } catch (error: any) {
    console.error('[QCEngine] Basic QC error:', error.message);
    errors.push({ module: 'basicQC', error: error.message });
    throw new Error(`Basic QC failed: ${error.message}`);
  }

  // Run premium modules based on features
  let lipSync: LipSyncQCResult | undefined;
  let videoGlitch: VideoGlitchQCResult | undefined;
  let bgm: BGMQCResult | undefined;
  let premiumReport: PremiumQCReport | undefined;

  // Lip-sync QC
  if (featuresEnabled.lipSyncQC) {
    try {
      if (onProgress) await onProgress(Math.floor((completedModules / enabledModules) * 100), "lipsync_start");
      lipSync = await runLipSyncQC(
        job.episode_id || job.id,
        context.filePath
      );
      if (lipSync.skipped) {
        console.log(`[QCEngine] Lip-sync QC skipped: ${lipSync.skipReason}`);
      }
      await reportProgress("lipsync_complete");
    } catch (error: any) {
      console.error('[QCEngine] Lip-sync QC error:', error.message);
      errors.push({ module: 'lipSyncQC', error: error.message });
      completedModules++; // Count as done even if failed
    }
  }

  // Video glitch QC
  if (featuresEnabled.videoGlitchQC) {
    try {
      if (onProgress) await onProgress(Math.floor((completedModules / enabledModules) * 100), "glitch_detection_start");
      videoGlitch = await runVideoGlitchQC(
        job.episode_id || job.id,
        context.filePath
      );
      await reportProgress("glitch_detection_complete");
    } catch (error: any) {
      console.error('[QCEngine] Video glitch QC error:', error.message);
      errors.push({ module: 'videoGlitchQC', error: error.message });
      completedModules++;
    }
  }

  // BGM QC
  if (featuresEnabled.bgmQC) {
    try {
      if (onProgress) await onProgress(Math.floor((completedModules / enabledModules) * 100), "bgm_detection_start");
      bgm = await runBGMQC(
        job.episode_id || job.id,
        context.filePath
      );
      await reportProgress("bgm_detection_complete");
    } catch (error: any) {
      console.error('[QCEngine] BGM QC error:', error.message);
      errors.push({ module: 'bgmQC', error: error.message });
      completedModules++;
    }
  }

  // Premium report (if enabled)
  if (featuresEnabled.premiumReport) {
    try {
      if (onProgress) await onProgress(Math.floor((completedModules / enabledModules) * 100), "report_generation_start");
      premiumReport = await generatePremiumReport(
        job.episode_id || job.id,
        basicQC,
        {
          lipSync,
          videoGlitch,
          bgm,
        }
      );
      if (premiumReport.skipped) {
        console.log(`[QCEngine] Premium report skipped: ${premiumReport.skipReason}`);
      }
      await reportProgress("report_generation_complete");
    } catch (error: any) {
      console.error('[QCEngine] Premium report error:', error.message);
      errors.push({ module: 'premiumReport', error: error.message });
      completedModules++;
    }
  }

  // Cleanup temp file if provided
  if (context.cleanup) {
    try {
      await context.cleanup();
    } catch (e) {
      console.warn("[QCEngine] Cleanup error:", e);
    }
  }

  // Calculate overall status and score
  const { status, score } = calculateOverallStatus(
    basicQC,
    lipSync,
    videoGlitch,
    bgm,
    premiumReport
  );

  const processingTime = Date.now() - startTime;

  console.log(`[QCEngine] QC completed for job ${job.id} in ${processingTime}ms`);

  return {
    episodeId: job.episode_id || job.id,
    seriesId: job.project_id || job.series_id || "",
    organisationId: job.organisation_id,
    status,
    score,
    basicQC,
    lipSync,
    videoGlitch,
    bgm,
    premiumReport,
    errors,
    analyzedAt: new Date().toISOString(),
    processingTime,
  };
}

/**
 * Run comprehensive QC analysis for an episode (legacy interface - kept for compatibility)
 */
export async function runQcForEpisode(options: RunQCOptions): Promise<QCResult> {
  const startTime = Date.now();
  const errors: QCResult['errors'] = [];

  console.log(`[QCEngine] Starting QC for episode ${options.episodeId}`);

  // Always run basic QC if enabled
  let basicQC: BasicQCResult;
  try {
    basicQC = await runBasicQC(
      options.episodeId,
      options.fileInfo,
      options.fileInfo.subtitlesPath 
        ? { path: options.fileInfo.subtitlesPath }
        : undefined
    );
  } catch (error: any) {
    console.error('[QCEngine] Basic QC error:', error.message);
    errors.push({ module: 'basicQC', error: error.message });
    throw new Error(`Basic QC failed: ${error.message}`);
  }

  // Run premium modules based on features
  let lipSync: LipSyncQCResult | undefined;
  let videoGlitch: VideoGlitchQCResult | undefined;
  let bgm: BGMQCResult | undefined;
  let premiumReport: PremiumQCReport | undefined;

  // Lip-sync QC
  if (options.featuresEnabled.lipSyncQC) {
    try {
      lipSync = await runLipSyncQC(
        options.episodeId,
        options.fileInfo.filePath
      );
      if (lipSync.skipped) {
        console.log(`[QCEngine] Lip-sync QC skipped: ${lipSync.skipReason}`);
      }
    } catch (error: any) {
      console.error('[QCEngine] Lip-sync QC error:', error.message);
      errors.push({ module: 'lipSyncQC', error: error.message });
      // Don't fail entire QC if premium module fails
    }
  }

  // Video glitch QC
  if (options.featuresEnabled.videoGlitchQC) {
    try {
      videoGlitch = await runVideoGlitchQC(
        options.episodeId,
        options.fileInfo.filePath
      );
    } catch (error: any) {
      console.error('[QCEngine] Video glitch QC error:', error.message);
      errors.push({ module: 'videoGlitchQC', error: error.message });
    }
  }

  // BGM QC
  if (options.featuresEnabled.bgmQC) {
    try {
      bgm = await runBGMQC(
        options.episodeId,
        options.fileInfo.filePath
      );
    } catch (error: any) {
      console.error('[QCEngine] BGM QC error:', error.message);
      errors.push({ module: 'bgmQC', error: error.message });
    }
  }

  // Premium report (if enabled)
  if (options.featuresEnabled.premiumReport) {
    try {
      premiumReport = await generatePremiumReport(
        options.episodeId,
        basicQC,
        {
          lipSync,
          videoGlitch,
          bgm,
        }
      );
      if (premiumReport.skipped) {
        console.log(`[QCEngine] Premium report skipped: ${premiumReport.skipReason}`);
      }
    } catch (error: any) {
      console.error('[QCEngine] Premium report error:', error.message);
      errors.push({ module: 'premiumReport', error: error.message });
    }
  }

  // Calculate overall status and score
  const { status, score } = calculateOverallStatus(
    basicQC,
    lipSync,
    videoGlitch,
    bgm,
    premiumReport
  );

  const processingTime = Date.now() - startTime;

  console.log(`[QCEngine] QC completed for episode ${options.episodeId} in ${processingTime}ms`);

  return {
    episodeId: options.episodeId,
    seriesId: options.seriesId,
    organisationId: options.organisationId,
    status,
    score,
    basicQC,
    lipSync,
    videoGlitch,
    bgm,
    premiumReport,
    errors,
    analyzedAt: new Date().toISOString(),
    processingTime,
  };
}

/**
 * Calculate overall QC status and score
 */
function calculateOverallStatus(
  basicQC: BasicQCResult,
  lipSync?: LipSyncQCResult,
  videoGlitch?: VideoGlitchQCResult,
  bgm?: BGMQCResult,
  premiumReport?: PremiumQCReport
): { status: QCResult['status']; score: number } {
  // Start with base score
  let score = 100;
  let hasCriticalErrors = false;
  let hasWarnings = false;

  // Basic QC checks
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

  if (basicQC.subtitleTiming.status === 'failed') {
    score -= 10;
    hasWarnings = true;
  }

  if (basicQC.missingBGM.detected && basicQC.missingBGM.bgmPresence < 30) {
    score -= 5;
    hasWarnings = true;
  }

  if (basicQC.visualQuality.status === 'failed') {
    score -= 15;
    hasCriticalErrors = true;
  } else if (basicQC.visualQuality.status === 'warning') {
    score -= 5;
    hasWarnings = true;
  }

  // Premium module checks
  if (lipSync && !lipSync.skipped) {
    if (lipSync.status === 'failed') {
      score -= 10;
      hasWarnings = true;
    } else if (lipSync.status === 'warning') {
      score -= 5;
    }
  }

  if (videoGlitch) {
    if (videoGlitch.status === 'failed') {
      score -= 15;
      hasCriticalErrors = true;
    } else if (videoGlitch.status === 'warning') {
      score -= 5;
      hasWarnings = true;
    }
  }

  if (bgm) {
    if (bgm.status === 'failed') {
      score -= 10;
      hasWarnings = true;
    } else if (bgm.status === 'warning') {
      score -= 5;
    }
  }

  // Use premium report score if available
  if (premiumReport && !premiumReport.skipped) {
    score = premiumReport.summary.score;
  }

  // Clamp score
  score = Math.max(0, Math.min(100, score));

  // Determine status
  let status: QCResult['status'];
  if (hasCriticalErrors || score < 50) {
    status = 'failed';
  } else if (hasWarnings || score < 70) {
    status = 'needs_review';
  } else {
    status = 'passed';
  }

  return { status, score };
}

/**
 * Determine which QC features are enabled for an organization
 */
export async function getEnabledQCFeatures(organisationId: string): Promise<QCFeatures> {
  // Basic QC is always available if subscription allows
  const hasBasic = await hasFeature(organisationId, 'basic_qc');
  const hasFull = await hasFeature(organisationId, 'full_qc');

  // Creative QC requires enterprise plan AND the feature to be enabled
  const hasCreativeQC = await hasFeature(organisationId, 'creative_qc_spi');
  const creativeQCEnabled = hasCreativeQC && await isCreativeQCToggleEnabled(organisationId);

  return {
    basicQC: hasBasic || hasFull,
    lipSyncQC: hasFull || await hasFeature(organisationId, 'lip_sync_qc'),
    videoGlitchQC: hasFull || await hasFeature(organisationId, 'video_glitch_qc'),
    bgmQC: hasFull || await hasFeature(organisationId, 'bgm_detection'),
    premiumReport: hasFull || await hasFeature(organisationId, 'premium_qc_report'),
    creativeQC: creativeQCEnabled,
  };
}

/**
 * Check if Creative QC toggle is enabled for an organization
 */
async function isCreativeQCToggleEnabled(organisationId: string): Promise<boolean> {
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) return false;

    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data } = await adminClient
      .from("organizations")
      .select("creative_qc_settings")
      .eq("id", organisationId)
      .single();

    return data?.creative_qc_settings?.enabled === true;
  } catch {
    return false;
  }
}
