/**
 * Feature Flags
 * 
 * Simple feature flag implementation for safe rollouts.
 * Flags default to OFF in production unless explicitly enabled.
 * 
 * Usage:
 *   if (isFeatureEnabled('NEW_ERROR_HANDLING')) {
 *     // New code path
 *   } else {
 *     // Legacy code path
 *   }
 */

export type FeatureFlag = 
  | 'STRUCTURED_ERROR_HANDLING'   // Replace silent catch with structured errors
  | 'JOB_HEARTBEAT'               // Enable heartbeat mechanism
  | 'TOKEN_PREVALIDATION'         // Validate tokens before download
  | 'DLQ_ENABLED'                 // Enable dead letter queue
  | 'STRICT_PROGRESS_TRACKING'    // No hardcoded progress fallbacks
  | 'STRUCTURED_LOGGING';         // Use JSON structured logs

interface FlagConfig {
  defaultEnabled: boolean;
  description: string;
  rolloutPercentage: number; // 0-100
}

const FLAG_CONFIGS: Record<FeatureFlag, FlagConfig> = {
  STRUCTURED_ERROR_HANDLING: {
    defaultEnabled: true,  // Safe to enable - only adds logging
    description: 'Replace silent catch blocks with structured error logging',
    rolloutPercentage: 100,
  },
  JOB_HEARTBEAT: {
    defaultEnabled: false, // Requires DB schema change
    description: 'Enable job heartbeat mechanism for stuck detection',
    rolloutPercentage: 0,
  },
  TOKEN_PREVALIDATION: {
    defaultEnabled: true,  // Safe to enable - adds validation
    description: 'Validate Google tokens before attempting download',
    rolloutPercentage: 100,
  },
  DLQ_ENABLED: {
    defaultEnabled: false, // Requires DLQ table
    description: 'Enable dead letter queue for failed jobs',
    rolloutPercentage: 0,
  },
  STRICT_PROGRESS_TRACKING: {
    defaultEnabled: true,  // Safe to enable
    description: 'Use nullish coalescing instead of OR fallbacks for progress',
    rolloutPercentage: 100,
  },
  STRUCTURED_LOGGING: {
    defaultEnabled: true,  // Safe to enable
    description: 'Use JSON structured logging',
    rolloutPercentage: 100,
  },
};

/**
 * Check if a feature flag is enabled
 * 
 * Priority:
 * 1. Environment variable override (FEATURE_FLAG_<NAME>=true/false)
 * 2. Rollout percentage (for gradual rollouts)
 * 3. Default value
 */
export function isFeatureEnabled(flag: FeatureFlag, userId?: string): boolean {
  const config = FLAG_CONFIGS[flag];
  if (!config) {
    console.warn(`[FeatureFlags] Unknown flag: ${flag}`);
    return false;
  }

  // Check environment variable override
  const envKey = `FEATURE_FLAG_${flag}`;
  const envValue = process.env[envKey];
  
  if (envValue !== undefined) {
    return envValue.toLowerCase() === 'true';
  }

  // Check rollout percentage
  if (config.rolloutPercentage < 100) {
    // Use userId for consistent rollout per user
    // If no userId, use a random value (request-level randomness)
    const seed = userId || Math.random().toString();
    const hash = simpleHash(seed + flag);
    const bucket = hash % 100;
    
    return bucket < config.rolloutPercentage;
  }

  return config.defaultEnabled;
}

/**
 * Get all flag states (for debugging)
 */
export function getAllFlagStates(): Record<FeatureFlag, boolean> {
  const states: Partial<Record<FeatureFlag, boolean>> = {};
  
  for (const flag of Object.keys(FLAG_CONFIGS) as FeatureFlag[]) {
    states[flag] = isFeatureEnabled(flag);
  }
  
  return states as Record<FeatureFlag, boolean>;
}

/**
 * Simple hash function for consistent bucketing
 */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Log flag usage for analytics
 */
export function trackFlagUsage(flag: FeatureFlag, enabled: boolean, context?: Record<string, unknown>): void {
  if (process.env.DEBUG === 'true') {
    console.log(`[FeatureFlags] ${flag}=${enabled}`, context || '');
  }
}
