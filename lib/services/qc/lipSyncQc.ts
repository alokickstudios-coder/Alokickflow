/**
 * Lip Sync QC Module
 * 
 * Advanced lip-sync detection using external service.
 * Gracefully falls back if not configured.
 */

import { isLipSyncConfigured, getQCProviderConfig } from '@/config/qcProviders';

export interface LipSyncQCResult {
  status: 'passed' | 'failed' | 'warning' | 'skipped';
  syncScore: number; // 0-100
  detectedIssues: Array<{
    timestamp: number;
    severity: 'error' | 'warning';
    message: string;
  }>;
  averageDelay: number; // milliseconds
  skipped?: boolean;
  skipReason?: string;
}

/**
 * Run lip-sync QC checks
 */
export async function runLipSyncQC(
  episodeId: string,
  videoUrl: string,
  audioUrl?: string
): Promise<LipSyncQCResult> {
  if (!isLipSyncConfigured()) {
    console.log('[LipSyncQC] Lip-sync service not configured, skipping');
    return {
      status: 'skipped',
      syncScore: 0,
      detectedIssues: [],
      averageDelay: 0,
      skipped: true,
      skipReason: 'Lip-sync service not configured. Add LIPSYNC_SERVICE_URL and LIPSYNC_API_KEY to enable.',
    };
  }

  const config = getQCProviderConfig();

  try {
    if (config.lipSync.provider === 'syncnet') {
      return await runSyncNetQC(episodeId, videoUrl, audioUrl);
    }
  } catch (error: any) {
    console.error('[LipSyncQC] Error:', error.message);
    return {
      status: 'failed',
      syncScore: 0,
      detectedIssues: [{
        timestamp: 0,
        severity: 'error',
        message: `Lip-sync analysis failed: ${error.message}`,
      }],
      averageDelay: 0,
    };
  }

  return {
    status: 'skipped',
    syncScore: 0,
    detectedIssues: [],
    averageDelay: 0,
    skipped: true,
    skipReason: 'Unknown lip-sync provider',
  };
}

/**
 * Run SyncNet-based lip-sync detection
 */
async function runSyncNetQC(
  episodeId: string,
  videoUrl: string,
  audioUrl?: string
): Promise<LipSyncQCResult> {
  const serviceUrl = process.env.LIPSYNC_SERVICE_URL;
  const apiKey = process.env.LIPSYNC_API_KEY;

  if (!serviceUrl || !apiKey) {
    return {
      status: 'skipped',
      syncScore: 0,
      detectedIssues: [],
      averageDelay: 0,
      skipped: true,
      skipReason: 'Lip-sync service URL or API key not configured',
    };
  }

  try {
    // Call external lip-sync service
    // Adjust the request format based on your actual service API
    const response = await fetch(`${serviceUrl}/analyze`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        video_url: videoUrl,
        audio_url: audioUrl || videoUrl, // Use video if audio not provided
        episode_id: episodeId,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Lip-sync service error: ${error}`);
    }

    const data = await response.json();

    // Transform service response to our format
    // Adjust based on actual service response structure
    const syncScore = data.sync_score || data.score || 0;
    const averageDelay = data.average_delay || data.delay || 0;
    const issues = (data.issues || data.errors || []).map((issue: any) => ({
      timestamp: issue.timestamp || issue.time || 0,
      severity: issue.severity || (issue.type === 'error' ? 'error' : 'warning'),
      message: issue.message || issue.description || 'Lip-sync issue detected',
    }));

    const status = 
      syncScore < 50 ? 'failed' :
      syncScore < 70 ? 'warning' :
      'passed';

    return {
      status,
      syncScore,
      detectedIssues: issues,
      averageDelay,
    };
  } catch (error: any) {
    console.error('[LipSyncQC] SyncNet error:', error.message);
    return {
      status: 'failed',
      syncScore: 0,
      detectedIssues: [{
        timestamp: 0,
        severity: 'error',
        message: `Failed to analyze lip-sync: ${error.message}`,
      }],
      averageDelay: 0,
    };
  }
}
