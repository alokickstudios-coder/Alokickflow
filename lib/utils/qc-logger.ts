/**
 * QC Pipeline Logger
 * 
 * Centralized logging for QC operations.
 * Can be swapped with an observability tool later.
 */

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface QCLogEvent {
  level: LogLevel;
  message: string;
  context?: {
    organisationId?: string;
    projectId?: string;
    episodeId?: string;
    deliveryId?: string;
    fileId?: string;
    fileName?: string;
    [key: string]: any;
  };
  error?: Error;
  timestamp: string;
}

class QCLogger {
  private log(event: QCLogEvent) {
    const prefix = `[QC:${event.level.toUpperCase()}]`;
    const contextStr = event.context
      ? ` ${JSON.stringify(event.context)}`
      : '';
    const errorStr = event.error
      ? `\nError: ${event.error.message}\nStack: ${event.error.stack}`
      : '';

    const logMessage = `${prefix} ${event.message}${contextStr}${errorStr}`;

    switch (event.level) {
      case 'error':
        console.error(logMessage);
        break;
      case 'warn':
        console.warn(logMessage);
        break;
      case 'debug':
        if (process.env.NODE_ENV === 'development') {
          console.debug(logMessage);
        }
        break;
      default:
        console.log(logMessage);
    }

    // In production, you could send to an observability service here
    // e.g., Sentry, Datadog, CloudWatch, etc.
  }

  info(message: string, context?: QCLogEvent['context']) {
    this.log({
      level: 'info',
      message,
      context,
      timestamp: new Date().toISOString(),
    });
  }

  warn(message: string, context?: QCLogEvent['context'], error?: Error) {
    this.log({
      level: 'warn',
      message,
      context,
      error,
      timestamp: new Date().toISOString(),
    });
  }

  error(message: string, context?: QCLogEvent['context'], error?: Error) {
    this.log({
      level: 'error',
      message,
      context,
      error: error || (context as any)?.error,
      timestamp: new Date().toISOString(),
    });
  }

  debug(message: string, context?: QCLogEvent['context']) {
    this.log({
      level: 'debug',
      message,
      context,
      timestamp: new Date().toISOString(),
    });
  }
}

export const qcLogger = new QCLogger();

/**
 * Helper functions for common QC logging scenarios
 */
export const logQCEvent = {
  fileUploaded: (fileName: string, deliveryId: string, organisationId: string) => {
    qcLogger.info('File uploaded for QC', {
      fileName,
      deliveryId,
      organisationId,
    });
  },

  qcStarted: (deliveryId: string, organisationId: string, projectId: string) => {
    qcLogger.info('QC processing started', {
      deliveryId,
      organisationId,
      projectId,
    });
  },

  qcCompleted: (
    deliveryId: string,
    status: string,
    score: number | undefined,
    organisationId: string
  ) => {
    qcLogger.info('QC processing completed', {
      deliveryId,
      status,
      score,
      organisationId,
    });
  },

  qcFailed: (deliveryId: string, error: Error, organisationId: string) => {
    qcLogger.error('QC processing failed', {
      deliveryId,
      organisationId,
    }, error);
  },

  jobCreated: (jobId: string, deliveryId: string, organisationId: string) => {
    qcLogger.info('QC job created', {
      jobId,
      deliveryId,
      organisationId,
    });
  },

  exportStarted: (projectId: string, rowCount: number, organisationId: string) => {
    qcLogger.info('Export to Google Sheets started', {
      projectId,
      rowCount,
      organisationId,
    });
  },

  exportCompleted: (spreadsheetId: string, projectId: string, organisationId: string) => {
    qcLogger.info('Export to Google Sheets completed', {
      spreadsheetId,
      projectId,
      organisationId,
    });
  },

  exportFailed: (projectId: string, error: Error, organisationId: string) => {
    qcLogger.error('Export to Google Sheets failed', {
      projectId,
      organisationId,
    }, error);
  },
};



