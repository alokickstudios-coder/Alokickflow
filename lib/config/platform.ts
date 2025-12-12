/**
 * Platform Configuration
 * 
 * Centralized platform-agnostic configuration.
 * Automatically detects the hosting platform and provides consistent APIs.
 * 
 * Supports: Render, Vercel, Railway, Heroku, AWS, GCP, Azure, Self-hosted
 * 
 * Environment Variables:
 * - APP_URL: Primary app URL (auto-detected if not set)
 * - NODE_ENV: Environment (development, production)
 */

export interface PlatformInfo {
  name: string;
  isCloud: boolean;
  isServerless: boolean;
  hasFFmpeg: boolean;
  maxMemoryMB: number;
  maxExecutionSeconds: number;
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
}

/**
 * Detect current hosting platform
 */
function detectPlatform(): PlatformInfo {
  // Render.com
  if (process.env.RENDER) {
    return {
      name: "render",
      isCloud: true,
      isServerless: false, // Render uses persistent containers
      hasFFmpeg: true, // We install it in Dockerfile
      maxMemoryMB: parseInt(process.env.RENDER_MEMORY_MB || "512", 10),
      maxExecutionSeconds: 300, // 5 minutes typical
    };
  }

  // Vercel
  if (process.env.VERCEL) {
    return {
      name: "vercel",
      isCloud: true,
      isServerless: true,
      hasFFmpeg: false, // Vercel doesn't have FFmpeg
      maxMemoryMB: 1024, // Vercel Pro
      maxExecutionSeconds: parseInt(process.env.VERCEL_MAX_DURATION || "60", 10),
    };
  }

  // Railway
  if (process.env.RAILWAY_ENVIRONMENT) {
    return {
      name: "railway",
      isCloud: true,
      isServerless: false,
      hasFFmpeg: true,
      maxMemoryMB: parseInt(process.env.RAILWAY_MEMORY_MB || "512", 10),
      maxExecutionSeconds: 300,
    };
  }

  // Heroku
  if (process.env.DYNO) {
    return {
      name: "heroku",
      isCloud: true,
      isServerless: false,
      hasFFmpeg: false, // Needs buildpack
      maxMemoryMB: 512,
      maxExecutionSeconds: 30,
    };
  }

  // AWS Lambda
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return {
      name: "aws-lambda",
      isCloud: true,
      isServerless: true,
      hasFFmpeg: false,
      maxMemoryMB: parseInt(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE || "128", 10),
      maxExecutionSeconds: 900, // 15 minutes max
    };
  }

  // Google Cloud Run
  if (process.env.K_SERVICE) {
    return {
      name: "cloud-run",
      isCloud: true,
      isServerless: true,
      hasFFmpeg: true,
      maxMemoryMB: 2048,
      maxExecutionSeconds: 3600,
    };
  }

  // Docker (generic)
  if (process.env.DOCKER_CONTAINER || process.env.HOSTNAME?.startsWith("docker")) {
    return {
      name: "docker",
      isCloud: false,
      isServerless: false,
      hasFFmpeg: true,
      maxMemoryMB: 2048,
      maxExecutionSeconds: 3600,
    };
  }

  // Local development
  return {
    name: "local",
    isCloud: false,
    isServerless: false,
    hasFFmpeg: true, // Assume installed locally
    maxMemoryMB: 4096,
    maxExecutionSeconds: 3600,
  };
}

/**
 * Get the application URL
 * Checks multiple environment variables in priority order
 */
function getAppUrl(): string {
  // Explicit configuration (highest priority)
  if (process.env.APP_URL) {
    return process.env.APP_URL;
  }
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }

  // Platform-specific URLs
  if (process.env.RENDER_EXTERNAL_URL) {
    return process.env.RENDER_EXTERNAL_URL;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  if (process.env.RAILWAY_STATIC_URL) {
    return `https://${process.env.RAILWAY_STATIC_URL}`;
  }
  if (process.env.HEROKU_APP_NAME) {
    return `https://${process.env.HEROKU_APP_NAME}.herokuapp.com`;
  }

  // Fallback for local development
  const port = process.env.PORT || "3000";
  return `http://localhost:${port}`;
}

/**
 * Calculate feature availability based on platform
 */
function getFeatures(platform: PlatformInfo): PlatformConfig["features"] {
  // Memory-based limits (conservative for stability)
  const memoryMB = platform.maxMemoryMB;
  
  // Max file size: 50MB per 512MB RAM, capped at 500MB
  const maxFileSizeMB = Math.min(500, Math.floor(memoryMB / 10));
  
  // Max concurrent jobs: 1 per 256MB RAM, max 3 for stability
  const maxConcurrentJobs = platform.isServerless ? 1 : Math.min(3, Math.floor(memoryMB / 256));

  return {
    canProcessLargeFiles: memoryMB >= 512 && !platform.isServerless,
    canRunLongTasks: platform.maxExecutionSeconds >= 60,
    hasNativeFFmpeg: platform.hasFFmpeg,
    maxFileSizeMB,
    maxConcurrentJobs,
  };
}

/**
 * Get complete platform configuration
 */
export function getPlatformConfig(): PlatformConfig {
  const platform = detectPlatform();
  const appUrl = getAppUrl();
  
  return {
    appUrl,
    apiUrl: `${appUrl}/api`,
    platform,
    features: getFeatures(platform),
  };
}

/**
 * Check if current platform is cloud-hosted
 */
export function isCloudEnvironment(): boolean {
  return getPlatformConfig().platform.isCloud;
}

/**
 * Check if FFmpeg is available
 */
export function hasFFmpegSupport(): boolean {
  return getPlatformConfig().features.hasNativeFFmpeg;
}

/**
 * Get the app URL (convenience function)
 */
export function getAppBaseUrl(): string {
  return getPlatformConfig().appUrl;
}

/**
 * Get memory-safe limits for file processing
 */
export function getProcessingLimits(): {
  maxFileSizeMB: number;
  maxConcurrentJobs: number;
  chunkSizeMB: number;
  timeoutSeconds: number;
} {
  const config = getPlatformConfig();
  
  return {
    maxFileSizeMB: config.features.maxFileSizeMB,
    maxConcurrentJobs: config.features.maxConcurrentJobs,
    chunkSizeMB: Math.min(50, config.features.maxFileSizeMB / 4), // Stream in chunks
    timeoutSeconds: Math.min(120, config.platform.maxExecutionSeconds - 10),
  };
}

// Export singleton config (cached)
let _config: PlatformConfig | null = null;

export function config(): PlatformConfig {
  if (!_config) {
    _config = getPlatformConfig();
    console.log(`[Platform] Detected: ${_config.platform.name}, URL: ${_config.appUrl}`);
    console.log(`[Platform] Features: FFmpeg=${_config.features.hasNativeFFmpeg}, MaxFile=${_config.features.maxFileSizeMB}MB, Concurrent=${_config.features.maxConcurrentJobs}`);
  }
  return _config;
}

export default config;
