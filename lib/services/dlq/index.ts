/**
 * Dead Letter Queue (DLQ) Service
 * 
 * Handles failed jobs that need human review or retry.
 * Feature-flagged via ENABLE_DLQ in feature-flags.ts
 */

import { getAdminClient } from "@/lib/api/auth-helpers";
import { isFeatureEnabled } from "@/lib/config/feature-flags";

// DLQ Entry Types
export interface DLQEntry {
  id: string;
  job_id: string;
  job_type: string;
  payload: Record<string, unknown>;
  failure_reason: string;
  failure_code?: string;
  failure_stack?: string;
  attempt_count: number;
  max_retries: number;
  last_attempt_at?: string;
  next_retry_at?: string;
  status: 'pending' | 'retrying' | 'resolved' | 'abandoned';
  metadata: Record<string, unknown>;
  organisation_id?: string;
  created_by?: string;
  resolved_by?: string;
  resolved_at?: string;
  resolution_notes?: string;
  created_at: string;
  updated_at: string;
}

export interface AddToDLQParams {
  jobId: string;
  jobType?: string;
  payload: Record<string, unknown>;
  failureReason: string;
  failureCode?: string;
  failureStack?: string;
  attemptCount?: number;
  maxRetries?: number;
  organisationId?: string;
  createdBy?: string;
  metadata?: Record<string, unknown>;
}

// Failure codes for categorization
export const FAILURE_CODES = {
  TIMEOUT: 'TIMEOUT',
  AUTH_ERROR: 'AUTH_ERROR',
  PARSE_ERROR: 'PARSE_ERROR',
  DOWNLOAD_ERROR: 'DOWNLOAD_ERROR',
  PROCESSING_ERROR: 'PROCESSING_ERROR',
  EXTERNAL_API_ERROR: 'EXTERNAL_API_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  RESOURCE_EXHAUSTED: 'RESOURCE_EXHAUSTED',
  UNKNOWN: 'UNKNOWN',
} as const;

/**
 * Add a failed job to the DLQ
 */
export async function addToDLQ(params: AddToDLQParams): Promise<DLQEntry | null> {
  // Check feature flag
  if (!isFeatureEnabled('DLQ_ENABLED')) {
    console.debug('[DLQ] Feature disabled, skipping DLQ entry');
    return null;
  }

  const adminClient = getAdminClient();
  if (!adminClient) {
    console.error('[DLQ] Admin client not available');
    return null;
  }

  try {
    const {
      jobId,
      jobType = 'qc_job',
      payload,
      failureReason,
      failureCode = FAILURE_CODES.UNKNOWN,
      failureStack,
      attemptCount = 1,
      maxRetries = 3,
      organisationId,
      createdBy,
      metadata = {},
    } = params;

    // Calculate next retry time (exponential backoff)
    const retryDelayMs = Math.min(
      1000 * 60 * Math.pow(2, attemptCount), // 2min, 4min, 8min, etc.
      1000 * 60 * 60 // Max 1 hour
    );
    const nextRetryAt = new Date(Date.now() + retryDelayMs).toISOString();

    const { data, error } = await adminClient
      .from('job_dlq')
      .insert({
        job_id: jobId,
        job_type: jobType,
        payload,
        failure_reason: failureReason,
        failure_code: failureCode,
        failure_stack: failureStack,
        attempt_count: attemptCount,
        max_retries: maxRetries,
        last_attempt_at: new Date().toISOString(),
        next_retry_at: attemptCount < maxRetries ? nextRetryAt : null,
        status: attemptCount >= maxRetries ? 'abandoned' : 'pending',
        metadata,
        organisation_id: organisationId,
        created_by: createdBy,
      })
      .select()
      .single();

    if (error) {
      console.error('[DLQ] Failed to add entry:', error.message);
      return null;
    }

    console.log(`[DLQ] Added job ${jobId} to DLQ (attempt ${attemptCount}/${maxRetries})`);
    return data as DLQEntry;
  } catch (error: any) {
    console.error('[DLQ] Unexpected error adding to DLQ:', error.message);
    return null;
  }
}

/**
 * Get DLQ entries for an organization
 */
export async function getDLQEntries(
  organisationId: string,
  options: {
    status?: DLQEntry['status'];
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ entries: DLQEntry[]; total: number }> {
  if (!isFeatureEnabled('DLQ_ENABLED')) {
    return { entries: [], total: 0 };
  }

  const adminClient = getAdminClient();
  if (!adminClient) {
    return { entries: [], total: 0 };
  }

  try {
    const { status, limit = 50, offset = 0 } = options;

    let query = adminClient
      .from('job_dlq')
      .select('*', { count: 'exact' })
      .eq('organisation_id', organisationId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('[DLQ] Failed to fetch entries:', error.message);
      return { entries: [], total: 0 };
    }

    return {
      entries: (data || []) as DLQEntry[],
      total: count || 0,
    };
  } catch (error: any) {
    console.error('[DLQ] Unexpected error fetching entries:', error.message);
    return { entries: [], total: 0 };
  }
}

/**
 * Get a single DLQ entry
 */
export async function getDLQEntry(id: string): Promise<DLQEntry | null> {
  if (!isFeatureEnabled('DLQ_ENABLED')) {
    return null;
  }

  const adminClient = getAdminClient();
  if (!adminClient) {
    return null;
  }

  try {
    const { data, error } = await adminClient
      .from('job_dlq')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('[DLQ] Failed to fetch entry:', error.message);
      return null;
    }

    return data as DLQEntry;
  } catch (error: any) {
    console.error('[DLQ] Unexpected error fetching entry:', error.message);
    return null;
  }
}

/**
 * Retry a DLQ entry (re-enqueue the job)
 */
export async function retryDLQEntry(
  id: string,
  options: { dryRun?: boolean } = {}
): Promise<{ success: boolean; message: string; newJobId?: string }> {
  if (!isFeatureEnabled('DLQ_ENABLED')) {
    return { success: false, message: 'DLQ feature is disabled' };
  }

  const adminClient = getAdminClient();
  if (!adminClient) {
    return { success: false, message: 'Admin client not available' };
  }

  try {
    // Get the DLQ entry
    const entry = await getDLQEntry(id);
    if (!entry) {
      return { success: false, message: 'DLQ entry not found' };
    }

    if (entry.status === 'resolved') {
      return { success: false, message: 'Entry already resolved' };
    }

    if (entry.attempt_count >= entry.max_retries && !options.dryRun) {
      return { success: false, message: 'Max retries exceeded. Use force retry or resolve manually.' };
    }

    if (options.dryRun) {
      return {
        success: true,
        message: `DRY RUN: Would retry job ${entry.job_id} (attempt ${entry.attempt_count + 1}/${entry.max_retries})`,
      };
    }

    // Update DLQ entry status
    await adminClient
      .from('job_dlq')
      .update({
        status: 'retrying',
        attempt_count: entry.attempt_count + 1,
        last_attempt_at: new Date().toISOString(),
      })
      .eq('id', id);

    // Re-create the job (reset to queued status)
    if (entry.job_type === 'qc_job') {
      const { data: newJob, error: jobError } = await adminClient
        .from('qc_jobs')
        .update({
          status: 'queued',
          progress: 0,
          error_message: null,
          started_at: null,
          completed_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', entry.job_id)
        .select()
        .single();

      if (jobError) {
        // Revert DLQ status
        await adminClient
          .from('job_dlq')
          .update({ status: 'pending' })
          .eq('id', id);
        return { success: false, message: `Failed to re-queue job: ${jobError.message}` };
      }

      // Trigger worker
      try {
        const { getAppBaseUrl } = await import("@/lib/config/platform");
        fetch(`${getAppBaseUrl()}/api/qc/process-queue`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-internal-trigger": "true" },
          body: JSON.stringify({ limit: 5 }),
        }).catch(() => {});
      } catch {}

      console.log(`[DLQ] Retried job ${entry.job_id} (attempt ${entry.attempt_count + 1})`);
      return {
        success: true,
        message: `Job ${entry.job_id} re-queued for processing`,
        newJobId: newJob?.id,
      };
    }

    return { success: false, message: `Unknown job type: ${entry.job_type}` };
  } catch (error: any) {
    console.error('[DLQ] Unexpected error retrying entry:', error.message);
    return { success: false, message: error.message };
  }
}

/**
 * Resolve a DLQ entry (mark as handled)
 */
export async function resolveDLQEntry(
  id: string,
  resolvedBy: string,
  notes?: string
): Promise<boolean> {
  if (!isFeatureEnabled('DLQ_ENABLED')) {
    return false;
  }

  const adminClient = getAdminClient();
  if (!adminClient) {
    return false;
  }

  try {
    const { error } = await adminClient
      .from('job_dlq')
      .update({
        status: 'resolved',
        resolved_by: resolvedBy,
        resolved_at: new Date().toISOString(),
        resolution_notes: notes,
      })
      .eq('id', id);

    if (error) {
      console.error('[DLQ] Failed to resolve entry:', error.message);
      return false;
    }

    console.log(`[DLQ] Resolved entry ${id}`);
    return true;
  } catch (error: any) {
    console.error('[DLQ] Unexpected error resolving entry:', error.message);
    return false;
  }
}

/**
 * Purge resolved/abandoned DLQ entries older than X days
 */
export async function purgeDLQ(
  options: { olderThanDays?: number; status?: DLQEntry['status'] } = {}
): Promise<number> {
  if (!isFeatureEnabled('DLQ_ENABLED')) {
    return 0;
  }

  const adminClient = getAdminClient();
  if (!adminClient) {
    return 0;
  }

  try {
    const { olderThanDays = 30, status } = options;
    const cutoffDate = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();

    let query = adminClient
      .from('job_dlq')
      .delete()
      .lt('created_at', cutoffDate);

    if (status) {
      query = query.eq('status', status);
    } else {
      // By default, only purge resolved or abandoned
      query = query.in('status', ['resolved', 'abandoned']);
    }

    const { data, error } = await query.select('id');

    if (error) {
      console.error('[DLQ] Failed to purge entries:', error.message);
      return 0;
    }

    const count = data?.length || 0;
    console.log(`[DLQ] Purged ${count} entries older than ${olderThanDays} days`);
    return count;
  } catch (error: any) {
    console.error('[DLQ] Unexpected error purging entries:', error.message);
    return 0;
  }
}

/**
 * Get DLQ statistics
 */
export async function getDLQStats(organisationId?: string): Promise<{
  total: number;
  pending: number;
  retrying: number;
  resolved: number;
  abandoned: number;
  byFailureCode: Record<string, number>;
}> {
  if (!isFeatureEnabled('DLQ_ENABLED')) {
    return { total: 0, pending: 0, retrying: 0, resolved: 0, abandoned: 0, byFailureCode: {} };
  }

  const adminClient = getAdminClient();
  if (!adminClient) {
    return { total: 0, pending: 0, retrying: 0, resolved: 0, abandoned: 0, byFailureCode: {} };
  }

  try {
    let query = adminClient
      .from('job_dlq')
      .select('status, failure_code');

    if (organisationId) {
      query = query.eq('organisation_id', organisationId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[DLQ] Failed to fetch stats:', error.message);
      return { total: 0, pending: 0, retrying: 0, resolved: 0, abandoned: 0, byFailureCode: {} };
    }

    const entries = data || [];
    const byStatus = entries.reduce((acc, e) => {
      acc[e.status] = (acc[e.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const byFailureCode = entries.reduce((acc, e) => {
      const code = e.failure_code || 'UNKNOWN';
      acc[code] = (acc[code] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      total: entries.length,
      pending: byStatus.pending || 0,
      retrying: byStatus.retrying || 0,
      resolved: byStatus.resolved || 0,
      abandoned: byStatus.abandoned || 0,
      byFailureCode,
    };
  } catch (error: any) {
    console.error('[DLQ] Unexpected error fetching stats:', error.message);
    return { total: 0, pending: 0, retrying: 0, resolved: 0, abandoned: 0, byFailureCode: {} };
  }
}
