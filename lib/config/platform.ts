/**
 * Platform Configuration
 * 
 * Centralized, auto-adjustable platform configuration.
 * Automatically detects hosting platform AND resource limits.
 * Scales file size limits based on available memory.
 * 
 * Supports: Render, Vercel, Railway, Heroku, AWS, GCP, Azure, DigitalOcean, Self-hosted
 * 
 * Environment Variables (all optional - auto-detected):
 * - APP_URL: Primary app URL
 * - MAX_FILE_SIZE_MB: Override max file size (for paid tiers)
 * - MAX_MEMORY_MB: Override detected memory
 * - MAX_CONCURRENT_JOBS: Override concurrent job limit
 */

export interface PlatformInfo {
  name: string;
  isCloud: boolean;
  isServerless: boolean;
  hasFFmpeg: boolean;
  maxMemoryMB: number;
  maxExecutionSeconds: number;
  tier: "free" | "starter" | "standard" | "pro" | "enterprise";
}

export interface PlatformConfig {
  appUrl: string;
  apiUrl: string;
  platform: PlatformInfo;
  features: {
    canProcessLargeFiles: boolean;
    canRunLongTasks: boolean;
    hasNativeFFmpeg: boolean;
    maxFileSizeMB: number;
    maxConcurrentJobs: number;
  };
  limits: {
    maxFileSizeMB: number;
    maxFileSizeBytes: number;
    maxConcurrentJobs: number;
    chunkSizeMB: number;
    timeoutSeconds: number;
    maxQueueSize: number;
  };
}

/**
 * Render.com instance types and their memory
 * https://render.com/docs/instance-types
 */
const RENDER_INSTANCE_MEMORY: Record<string, number> = {
  free: 512,
  starter: 512,
  "starter-plus": 1024,
  standard: 2048,
  "standard-plus": 4096,
  pro: 8192,
  "pro-plus": 16384,
  "pro-max": 32768,
  "pro-ultra": 65536,
};

/**
 * Detect Render instance type from environment
 */
function detectRenderMemory(): number {
  // Check explicit memory override first
  if (process.env.MAX_MEMORY_MB) {
    return parseInt(process.env.MAX_MEMORY_MB, 10);
  }
  
  // Render provides instance type in RENDER_INSTANCE_TYPE
  const instanceType = process.env.RENDER_INSTANCE_TYPE?.toLowerCase();
  if (instanceType && RENDER_INSTANCE_MEMORY[instanceType]) {
    return RENDER_INSTANCE_MEMORY[instanceType];
  }
  
  // Check RENDER_MEMORY_MB if set
  if (process.env.RENDER_MEMORY_MB) {
    return parseInt(process.env.RENDER_MEMORY_MB, 10);
  }
  
  // Default to free tier
  return 512;
}

/**
 * Detect service tier based on memory
 */
function detectTier(memoryMB: number): PlatformInfo["tier"] {
  if (memoryMB >= 16384) return "enterprise";
  if (memoryMB >= 4096) return "pro";
  if (memoryMB >= 2048) return "standard";
  if (memoryMB >= 1024) return "starter";
  return "free";
}

/**
 * Detect current hosting platform
 */
function detectPlatform(): PlatformInfo {
  // Check for explicit memory override
  const overrideMemory = process.env.MAX_MEMORY_MB 
    ? parseInt(process.env.MAX_MEMORY_MB, 10) 
    : null;

  // Render.com
  if (process.env.RENDER) {
    const memoryMB = overrideMemory || detectRenderMemory();
    return {
      name: "render",
      isCloud: true,
      isServerless: false,
      hasFFmpeg: true,
      maxMemoryMB: memoryMB,
      maxExecutionSeconds: 3600, // Render allows long-running processes
      tier: detectTier(memoryMB),
    };
  }

  // Vercel
  if (process.env.VERCEL) {
    const memoryMB = overrideMemory || 1024;
    return {
      name: "vercel",
      isCloud: true,
      isServerless: true,
      hasFFmpeg: false,
      maxMemoryMB: memoryMB,
      maxExecutionSeconds: parseInt(process.env.VERCEL_MAX_DURATION || "60", 10),
      tier: process.env.VERCEL_ENV === "production" ? "starter" : "free",
    };
  }

  // Railway
  if (process.env.RAILWAY_ENVIRONMENT) {
    const memoryMB = overrideMemory || parseInt(process.env.RAILWAY_MEMORY_MB || "512", 10);
    return {
      name: "railway",
      isCloud: true,
      isServerless: false,
      hasFFmpeg: true,
      maxMemoryMB: memoryMB,
      maxExecutionSeconds: 3600,
      tier: detectTier(memoryMB),
    };
  }

  // Heroku
  if (process.env.DYNO) {
    const dynoType = process.env.DYNO_TYPE?.toLowerCase() || "";
    let memoryMB = 512;
    if (dynoType.includes("performance")) memoryMB = 2560;
    else if (dynoType.includes("standard-2x")) memoryMB = 1024;
    memoryMB = overrideMemory || memoryMB;
    
    return {
      name: "heroku",
      isCloud: true,
      isServerless: false,
      hasFFmpeg: !!process.env.FFMPEG_BUILDPACK,
      maxMemoryMB: memoryMB,
      maxExecutionSeconds: 30,
      tier: detectTier(memoryMB),
    };
  }

  // AWS Lambda
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const memoryMB = overrideMemory || parseInt(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE || "128", 10);
    return {
      name: "aws-lambda",
      isCloud: true,
      isServerless: true,
      hasFFmpeg: !!process.env.FFMPEG_LAYER,
      maxMemoryMB: memoryMB,
      maxExecutionSeconds: 900,
      tier: detectTier(memoryMB),
    };
  }

  // AWS ECS/Fargate
  if (process.env.ECS_CONTAINER_METADATA_URI) {
    const memoryMB = overrideMemory || parseInt(process.env.ECS_MEMORY_MB || "2048", 10);
    return {
      name: "aws-ecs",
      isCloud: true,
      isServerless: false,
      hasFFmpeg: true,
      maxMemoryMB: memoryMB,
      maxExecutionSeconds: 3600,
      tier: detectTier(memoryMB),
    };
  }

  // Google Cloud Run
  if (process.env.K_SERVICE) {
    const memoryMB = overrideMemory || parseInt(process.env.CLOUD_RUN_MEMORY_MB || "2048", 10);
    return {
      name: "cloud-run",
      isCloud: true,
      isServerless: true,
      hasFFmpeg: true,
      maxMemoryMB: memoryMB,
      maxExecutionSeconds: 3600,
      tier: detectTier(memoryMB),
    };
  }

  // DigitalOcean App Platform
  if (process.env.DIGITALOCEAN_APP_ID) {
    const memoryMB = overrideMemory || parseInt(process.env.DO_MEMORY_MB || "1024", 10);
    return {
      name: "digitalocean",
      isCloud: true,
      isServerless: false,
      hasFFmpeg: true,
      maxMemoryMB: memoryMB,
      maxExecutionSeconds: 3600,
      tier: detectTier(memoryMB),
    };
  }

  // Azure Container Apps
  if (process.env.CONTAINER_APP_NAME) {
    const memoryMB = overrideMemory || parseInt(process.env.AZURE_MEMORY_MB || "2048", 10);
    return {
      name: "azure-container",
      isCloud: true,
      isServerless: false,
      hasFFmpeg: true,
      maxMemoryMB: memoryMB,
      maxExecutionSeconds: 3600,
      tier: detectTier(memoryMB),
    };
  }

  // Docker (generic)
  if (process.env.DOCKER_CONTAINER || process.env.HOSTNAME?.includes("docker")) {
    const memoryMB = overrideMemory || parseInt(process.env.DOCKER_MEMORY_MB || "4096", 10);
    return {
      name: "docker",
      isCloud: false,
      isServerless: false,
      hasFFmpeg: true,
      maxMemoryMB: memoryMB,
      maxExecutionSeconds: 3600,
      tier: detectTier(memoryMB),
    };
  }

  // Kubernetes
  if (process.env.KUBERNETES_SERVICE_HOST) {
    const memoryMB = overrideMemory || parseInt(process.env.K8S_MEMORY_MB || "4096", 10);
    return {
      name: "kubernetes",
      isCloud: true,
      isServerless: false,
      hasFFmpeg: true,
      maxMemoryMB: memoryMB,
      maxExecutionSeconds: 3600,
      tier: detectTier(memoryMB),
    };
  }

  // Local development
  const localMemory = overrideMemory || 8192; // Assume 8GB for local dev
  return {
    name: "local",
    isCloud: false,
    isServerless: false,
    hasFFmpeg: true,
    maxMemoryMB: localMemory,
    maxExecutionSeconds: 3600,
    tier: "enterprise", // Local dev has no limits
  };
}

/**
 * Get the application URL
 */
function getAppUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL;
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.RENDER_EXTERNAL_URL) return process.env.RENDER_EXTERNAL_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  if (process.env.RAILWAY_STATIC_URL) return `https://${process.env.RAILWAY_STATIC_URL}`;
  if (process.env.HEROKU_APP_NAME) return `https://${process.env.HEROKU_APP_NAME}.herokuapp.com`;
  
  const port = process.env.PORT || "3000";
  return `http://localhost:${port}`;
}

/**
 * Calculate dynamic limits based on available resources
 * 
 * This is the KEY function that auto-adjusts limits based on:
 * 1. Available memory
 * 2. Service tier
 * 3. Explicit overrides
 */
function calculateLimits(platform: PlatformInfo): PlatformConfig["limits"] {
  const memoryMB = platform.maxMemoryMB;
  
  // Check for explicit overrides first (highest priority)
  const overrideMaxFileSize = process.env.MAX_FILE_SIZE_MB 
    ? parseInt(process.env.MAX_FILE_SIZE_MB, 10) 
    : null;
  const overrideConcurrentJobs = process.env.MAX_CONCURRENT_JOBS 
    ? parseInt(process.env.MAX_CONCURRENT_JOBS, 10) 
    : null;

  // Calculate memory-based file size limit
  // Formula: Allow files up to 15% of available memory for processing headroom
  // But cap based on tier to prevent abuse
  const tierCaps: Record<PlatformInfo["tier"], number> = {
    free: 100,        // 100MB max for free tier
    starter: 500,     // 500MB for starter
    standard: 2048,   // 2GB for standard
    pro: 5120,        // 5GB for pro
    enterprise: 10240 // 10GB for enterprise
  };
  
  const memoryBasedLimit = Math.floor(memoryMB * 0.15);
  const tierCap = tierCaps[platform.tier];
  const calculatedFileSize = Math.min(memoryBasedLimit, tierCap);
  
  const maxFileSizeMB = overrideMaxFileSize || calculatedFileSize;
  
  // Calculate concurrent jobs based on memory
  // Each job needs ~200MB headroom for FFmpeg processing
  const jobsFromMemory = Math.floor(memoryMB / 300);
  const maxConcurrentJobs = overrideConcurrentJobs || 
    (platform.isServerless ? 1 : Math.max(1, Math.min(5, jobsFromMemory)));

  // Chunk size for streaming (smaller chunks = less memory)
  const chunkSizeMB = Math.min(50, Math.max(10, Math.floor(memoryMB / 50)));

  // Timeout based on file size allowance and execution limits
  const timeoutSeconds = Math.min(
    platform.maxExecutionSeconds - 30, // Leave 30s buffer
    Math.max(60, Math.floor(maxFileSizeMB / 2)) // ~30 seconds per 60MB
  );

  // Queue size based on tier
  const queueSizes: Record<PlatformInfo["tier"], number> = {
    free: 10,
    starter: 50,
    standard: 200,
    pro: 1000,
    enterprise: 10000
  };

  return {
    maxFileSizeMB,
    maxFileSizeBytes: maxFileSizeMB * 1024 * 1024,
    maxConcurrentJobs,
    chunkSizeMB,
    timeoutSeconds,
    maxQueueSize: queueSizes[platform.tier],
  };
}

/**
 * Calculate feature availability
 */
function getFeatures(platform: PlatformInfo, limits: PlatformConfig["limits"]): PlatformConfig["features"] {
  return {
    canProcessLargeFiles: limits.maxFileSizeMB >= 500,
    canRunLongTasks: platform.maxExecutionSeconds >= 60,
    hasNativeFFmpeg: platform.hasFFmpeg,
    maxFileSizeMB: limits.maxFileSizeMB,
    maxConcurrentJobs: limits.maxConcurrentJobs,
  };
}

/**
 * Get complete platform configuration
 */
export function getPlatformConfig(): PlatformConfig {
  const platform = detectPlatform();
  const appUrl = getAppUrl();
  const limits = calculateLimits(platform);
  
  return {
    appUrl,
    apiUrl: `${appUrl}/api`,
    platform,
    features: getFeatures(platform, limits),
    limits,
  };
}

// Convenience exports
export const isCloudEnvironment = () => getPlatformConfig().platform.isCloud;
export const hasFFmpegSupport = () => getPlatformConfig().features.hasNativeFFmpeg;
export const getAppBaseUrl = () => getPlatformConfig().appUrl;

export function getProcessingLimits() {
  const config = getPlatformConfig();
  return config.limits;
}

/**
 * Get human-readable limit description for UI
 */
export function getLimitDescription(): string {
  const config = getPlatformConfig();
  const { limits, platform } = config;
  
  if (limits.maxFileSizeMB >= 1024) {
    return `Up to ${(limits.maxFileSizeMB / 1024).toFixed(1)}GB files (${platform.tier} tier)`;
  }
  return `Up to ${limits.maxFileSizeMB}MB files (${platform.tier} tier)`;
}

/**
 * Check if a file size is allowed
 */
export function isFileSizeAllowed(sizeBytes: number): { allowed: boolean; message?: string } {
  const config = getPlatformConfig();
  const sizeMB = sizeBytes / (1024 * 1024);
  
  if (sizeMB <= config.limits.maxFileSizeMB) {
    return { allowed: true };
  }
  
  return {
    allowed: false,
    message: `File size (${sizeMB.toFixed(1)}MB) exceeds limit (${config.limits.maxFileSizeMB}MB). ${
      config.platform.tier === "free" || config.platform.tier === "starter"
        ? "Upgrade your plan for larger files."
        : "Contact support for increased limits."
    }`
  };
}

// Singleton cache
let _config: PlatformConfig | null = null;

export function config(): PlatformConfig {
  if (!_config) {
    _config = getPlatformConfig();
    console.log(`[Platform] ${_config.platform.name} (${_config.platform.tier} tier)`);
    console.log(`[Platform] Memory: ${_config.platform.maxMemoryMB}MB, MaxFile: ${_config.limits.maxFileSizeMB}MB`);
    console.log(`[Platform] Concurrent: ${_config.limits.maxConcurrentJobs}, Timeout: ${_config.limits.timeoutSeconds}s`);
  }
  return _config;
}

/**
 * Force refresh config (useful after env change)
 */
export function refreshConfig(): PlatformConfig {
  _config = null;
  return config();
}

export default config;
