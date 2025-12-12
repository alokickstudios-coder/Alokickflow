/**
 * Structured Logger
 * 
 * Production-grade logging with:
 * - Correlation IDs for request tracing
 * - Job IDs for async operation tracking
 * - Log levels (debug, info, warn, error)
 * - JSON output for log aggregation
 * - Debug mode toggle via DEBUG env var
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  correlationId?: string;
  jobId?: string;
  userId?: string;
  orgId?: string;
  stage?: string;
  duration?: number;
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  service: string;
  context: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class StructuredLogger {
  private service: string;
  private minLevel: LogLevel;
  private isDebugMode: boolean;

  constructor(service: string) {
    this.service = service;
    this.minLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';
    this.isDebugMode = process.env.DEBUG === 'true';
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.minLevel];
  }

  private formatEntry(
    level: LogLevel,
    message: string,
    context: LogContext = {},
    error?: Error
  ): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      service: this.service,
      context,
    };

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: this.isDebugMode ? error.stack : undefined,
      };
    }

    return entry;
  }

  private output(entry: LogEntry): void {
    // In production, output JSON for log aggregation
    // In development with DEBUG=true, output human-readable
    if (this.isDebugMode) {
      const prefix = `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.service}]`;
      const contextStr = Object.keys(entry.context).length > 0 
        ? ` ${JSON.stringify(entry.context)}` 
        : '';
      
      switch (entry.level) {
        case 'error':
          console.error(`${prefix} ${entry.message}${contextStr}`, entry.error || '');
          break;
        case 'warn':
          console.warn(`${prefix} ${entry.message}${contextStr}`);
          break;
        case 'debug':
          console.debug(`${prefix} ${entry.message}${contextStr}`);
          break;
        default:
          console.log(`${prefix} ${entry.message}${contextStr}`);
      }
    } else {
      // JSON output for log aggregation (CloudWatch, DataDog, etc.)
      const output = JSON.stringify(entry);
      switch (entry.level) {
        case 'error':
          console.error(output);
          break;
        case 'warn':
          console.warn(output);
          break;
        default:
          console.log(output);
      }
    }
  }

  debug(message: string, context?: LogContext): void {
    if (this.shouldLog('debug')) {
      this.output(this.formatEntry('debug', message, context));
    }
  }

  info(message: string, context?: LogContext): void {
    if (this.shouldLog('info')) {
      this.output(this.formatEntry('info', message, context));
    }
  }

  warn(message: string, context?: LogContext, error?: Error): void {
    if (this.shouldLog('warn')) {
      this.output(this.formatEntry('warn', message, context, error));
    }
  }

  error(message: string, context?: LogContext, error?: Error): void {
    if (this.shouldLog('error')) {
      this.output(this.formatEntry('error', message, context, error));
    }
  }

  /**
   * Create a child logger with inherited context
   */
  child(inheritedContext: LogContext): StructuredLogger {
    const childLogger = new StructuredLogger(this.service);
    const originalOutput = childLogger.output.bind(childLogger);
    
    childLogger.output = (entry: LogEntry) => {
      entry.context = { ...inheritedContext, ...entry.context };
      originalOutput(entry);
    };

    return childLogger;
  }

  /**
   * Log job lifecycle events with standard format
   */
  jobEvent(
    event: 'started' | 'progress' | 'completed' | 'failed' | 'cancelled' | 'heartbeat',
    jobId: string,
    details?: LogContext
  ): void {
    const level: LogLevel = event === 'failed' ? 'error' : 'info';
    const message = `Job ${event}`;
    
    this.output(this.formatEntry(level, message, {
      jobId,
      event,
      ...details,
    }));
  }

  /**
   * Track operation duration
   */
  async trackDuration<T>(
    operation: string,
    fn: () => Promise<T>,
    context?: LogContext
  ): Promise<T> {
    const startTime = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - startTime;
      this.info(`${operation} completed`, { ...context, duration });
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.error(`${operation} failed`, { ...context, duration }, error as Error);
      throw error;
    }
  }
}

// Pre-configured loggers for different services
export const qcWorkerLogger = new StructuredLogger('QCWorker');
export const apiLogger = new StructuredLogger('API');
export const driveLogger = new StructuredLogger('GoogleDrive');
export const authLogger = new StructuredLogger('Auth');

// Factory for creating custom loggers
export const createLogger = (service: string): StructuredLogger => {
  return new StructuredLogger(service);
};

export default StructuredLogger;
