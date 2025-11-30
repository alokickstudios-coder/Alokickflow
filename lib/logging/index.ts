/**
 * Centralized Logging Service
 * Production-ready logging with different levels and destinations
 */

export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: Record<string, any>;
  userId?: string;
  organizationId?: string;
  requestId?: string;
  stack?: string;
}

// Log level priorities
const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

// Current log level from environment
const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || "info";

/**
 * Format log entry for console output
 */
function formatLog(entry: LogEntry): string {
  const parts = [
    `[${entry.timestamp}]`,
    `[${entry.level.toUpperCase()}]`,
    entry.requestId ? `[${entry.requestId}]` : "",
    entry.message,
  ];

  if (entry.context && Object.keys(entry.context).length > 0) {
    parts.push(JSON.stringify(entry.context));
  }

  return parts.filter(Boolean).join(" ");
}

/**
 * Should this log level be output?
 */
function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

/**
 * Create a log entry
 */
function createLogEntry(
  level: LogLevel,
  message: string,
  context?: Record<string, any>,
  error?: Error
): LogEntry {
  return {
    level,
    message,
    timestamp: new Date().toISOString(),
    context,
    stack: error?.stack,
  };
}

/**
 * Output log to appropriate destination
 */
async function outputLog(entry: LogEntry): Promise<void> {
  if (!shouldLog(entry.level)) return;

  const formattedLog = formatLog(entry);

  // Console output
  switch (entry.level) {
    case "debug":
      console.debug(formattedLog);
      break;
    case "info":
      console.info(formattedLog);
      break;
    case "warn":
      console.warn(formattedLog);
      break;
    case "error":
    case "fatal":
      console.error(formattedLog);
      if (entry.stack) {
        console.error(entry.stack);
      }
      break;
  }

  // In production, store critical logs in database
  if (process.env.NODE_ENV === "production" && (entry.level === "error" || entry.level === "fatal")) {
    try {
      // Store critical logs asynchronously
      const { supabase } = await import("@/lib/supabase/client");
      const { error } = await supabase.from("audit_logs").insert({
        action: `LOG_${entry.level.toUpperCase()}`,
        details: {
          message: entry.message,
          context: entry.context,
          stack: entry.stack,
        },
        user_id: entry.userId,
        organization_id: entry.organizationId,
      });
      // Silently ignore errors
      if (error) {
        console.debug("Failed to log to database:", error.message);
      }
    } catch (e) {
      // Database logging failed, already logged to console
    }
  }
}

/**
 * Logger class with context binding
 */
export class Logger {
  private context: Record<string, any> = {};
  private userId?: string;
  private organizationId?: string;
  private requestId?: string;

  constructor(context?: Record<string, any>) {
    this.context = context || {};
  }

  /**
   * Set user context
   */
  setUser(userId: string, organizationId?: string): Logger {
    this.userId = userId;
    this.organizationId = organizationId;
    return this;
  }

  /**
   * Set request ID for tracing
   */
  setRequestId(requestId: string): Logger {
    this.requestId = requestId;
    return this;
  }

  /**
   * Add context
   */
  with(context: Record<string, any>): Logger {
    return new Logger({ ...this.context, ...context });
  }

  /**
   * Debug level log
   */
  debug(message: string, context?: Record<string, any>): void {
    outputLog({
      ...createLogEntry("debug", message, { ...this.context, ...context }),
      userId: this.userId,
      organizationId: this.organizationId,
      requestId: this.requestId,
    });
  }

  /**
   * Info level log
   */
  info(message: string, context?: Record<string, any>): void {
    outputLog({
      ...createLogEntry("info", message, { ...this.context, ...context }),
      userId: this.userId,
      organizationId: this.organizationId,
      requestId: this.requestId,
    });
  }

  /**
   * Warning level log
   */
  warn(message: string, context?: Record<string, any>): void {
    outputLog({
      ...createLogEntry("warn", message, { ...this.context, ...context }),
      userId: this.userId,
      organizationId: this.organizationId,
      requestId: this.requestId,
    });
  }

  /**
   * Error level log
   */
  error(message: string, error?: Error | unknown, context?: Record<string, any>): void {
    const err = error instanceof Error ? error : undefined;
    outputLog({
      ...createLogEntry("error", message, { ...this.context, ...context }, err),
      userId: this.userId,
      organizationId: this.organizationId,
      requestId: this.requestId,
    });
  }

  /**
   * Fatal level log
   */
  fatal(message: string, error?: Error | unknown, context?: Record<string, any>): void {
    const err = error instanceof Error ? error : undefined;
    outputLog({
      ...createLogEntry("fatal", message, { ...this.context, ...context }, err),
      userId: this.userId,
      organizationId: this.organizationId,
      requestId: this.requestId,
    });
  }
}

// Default logger instance
export const logger = new Logger();

// Named loggers for different modules
export function createLogger(name: string): Logger {
  return new Logger({ module: name });
}

// API request logger middleware helper
export function logApiRequest(
  req: { method: string; url: string; headers?: any },
  userId?: string
): Logger {
  const requestId = crypto.randomUUID();
  const log = new Logger({
    method: req.method,
    url: req.url,
    userAgent: req.headers?.["user-agent"],
  });
  
  if (userId) {
    log.setUser(userId);
  }
  
  log.setRequestId(requestId);
  log.info("API Request");
  
  return log;
}

// Performance timing helper
export function measureTime<T>(
  name: string,
  fn: () => Promise<T>,
  log: Logger = logger
): Promise<T> {
  const start = performance.now();
  
  return fn().then(
    (result) => {
      const duration = performance.now() - start;
      log.debug(`${name} completed`, { durationMs: Math.round(duration) });
      return result;
    },
    (error) => {
      const duration = performance.now() - start;
      log.error(`${name} failed`, error, { durationMs: Math.round(duration) });
      throw error;
    }
  );
}

