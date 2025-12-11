/**
 * QC Worker Client
 * 
 * Communicates with the dedicated QC Worker server for FFmpeg-based processing.
 * Used when running on Vercel (serverless) to offload video processing.
 */

export interface WorkerQCRequest {
  fileUrl?: string;
  storagePath?: string;
  fileName: string;
  jobData?: Record<string, any>;
}

export interface WorkerQCResponse {
  success: boolean;
  jobId: string;
  status?: 'passed' | 'failed' | 'needs_review';
  score?: number;
  basicQC?: any;
  videoGlitch?: any;
  processingTime?: number;
  processedAt?: string;
  error?: string;
}

const WORKER_URL = process.env.QC_WORKER_URL;
const WORKER_SECRET = process.env.QC_WORKER_SECRET;

/**
 * Check if the QC Worker is configured and available
 */
export function isWorkerConfigured(): boolean {
  return !!(WORKER_URL && WORKER_SECRET);
}

/**
 * Check if the QC Worker is healthy
 */
export async function checkWorkerHealth(): Promise<{
  available: boolean;
  ffmpegReady: boolean;
  error?: string;
}> {
  if (!isWorkerConfigured()) {
    return { 
      available: false, 
      ffmpegReady: false, 
      error: 'QC Worker not configured (QC_WORKER_URL or QC_WORKER_SECRET missing)' 
    };
  }

  try {
    const response = await fetch(`${WORKER_URL}/ffmpeg-check`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      return { 
        available: true, 
        ffmpegReady: false, 
        error: `Worker returned ${response.status}` 
      };
    }

    const data = await response.json();
    return {
      available: true,
      ffmpegReady: data.status === 'ok',
      error: data.error,
    };
  } catch (error: any) {
    return {
      available: false,
      ffmpegReady: false,
      error: error.message,
    };
  }
}

/**
 * Process a QC job using the dedicated worker
 */
export async function processWithWorker(
  request: WorkerQCRequest
): Promise<WorkerQCResponse> {
  if (!isWorkerConfigured()) {
    throw new Error('QC Worker not configured');
  }

  console.log(`[WorkerClient] Sending job to worker: ${WORKER_URL}`);

  const response = await fetch(`${WORKER_URL}/qc/process`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${WORKER_SECRET}`,
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Worker request failed (${response.status}): ${errorText}`);
  }

  const result: WorkerQCResponse = await response.json();
  console.log(`[WorkerClient] Job ${result.jobId} completed: ${result.status}`);

  return result;
}

/**
 * Get worker configuration status for diagnostics
 */
export function getWorkerConfig(): {
  configured: boolean;
  url: string | undefined;
  hasSecret: boolean;
} {
  return {
    configured: isWorkerConfigured(),
    url: WORKER_URL,
    hasSecret: !!WORKER_SECRET,
  };
}
