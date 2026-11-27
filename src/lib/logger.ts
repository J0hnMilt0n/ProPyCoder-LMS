/**
 * Centralized error logging utility
 * Provides structured logging with levels, context, and integration points for monitoring
 */

export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

export interface LogContext {
  /** Request ID for tracing */
  requestId?: string;
  /** User ID if authenticated */
  userId?: string;
  /** Session ID */
  sessionId?: string;
  /** API endpoint or route */
  endpoint?: string;
  /** HTTP method */
  method?: string;
  /** Request duration in ms */
  duration?: number;
  /** Request status */
  status?: "success" | "error";
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  /** Error cause */
  cause?: Error;
  /** Stack trace */
  stack?: string;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context: LogContext;
  /** Service/component name */
  service: string;
  /** Environment */
  environment: string;
}

class Logger {
  private service: string;
  private environment: string;
  private minLevel: LogLevel;
  private isDevelopment: boolean;

  private static levelOrder: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
    fatal: 4,
  };

  constructor(service: string = "propycoder-lms") {
    this.service = service;
    this.environment = process.env.NODE_ENV ?? "development";
    this.isDevelopment = this.environment === "development";
    this.minLevel =
      (process.env.LOG_LEVEL as LogLevel) ??
      (this.isDevelopment ? "debug" : "info");
  }

  private shouldLog(level: LogLevel): boolean {
    return Logger.levelOrder[level] >= Logger.levelOrder[this.minLevel];
  }

  private formatEntry(
    level: LogLevel,
    message: string,
    context: LogContext = {},
  ): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: {
        ...context,
        stack: context.cause?.stack ?? context.stack,
      },
      service: this.service,
      environment: this.environment,
    };
  }

  private output(entry: LogEntry): void {
    const { level, message, context, timestamp, service } = entry;

    // In development, use console with colors
    if (this.isDevelopment) {
      const colors: Record<LogLevel, string> = {
        debug: "\x1b[36m", // cyan
        info: "\x1b[32m", // green
        warn: "\x1b[33m", // yellow
        error: "\x1b[31m", // red
        fatal: "\x1b[35m", // magenta
      };
      const reset = "\x1b[0m";
      const color = colors[level] ?? "";

      const contextStr =
        Object.keys(context).length > 0
          ? ` ${JSON.stringify(context, null, 2)}`
          : "";

      console.log(
        `${color}[${timestamp}] [${level.toUpperCase()}] [${service}]${reset} ${message}${contextStr}`,
      );
    } else {
      // In production, output structured JSON for log aggregation
      console.log(JSON.stringify(entry));
    }
  }

  debug(message: string, context?: LogContext): void {
    if (this.shouldLog("debug")) {
      this.output(this.formatEntry("debug", message, context));
    }
  }

  info(message: string, context?: LogContext): void {
    if (this.shouldLog("info")) {
      this.output(this.formatEntry("info", message, context));
    }
  }

  warn(message: string, context?: LogContext): void {
    if (this.shouldLog("warn")) {
      this.output(this.formatEntry("warn", message, context));
    }
  }

  error(message: string, context?: LogContext): void {
    if (this.shouldLog("error")) {
      this.output(this.formatEntry("error", message, context));
    }
  }

  fatal(message: string, context?: LogContext): void {
    if (this.shouldLog("fatal")) {
      this.output(this.formatEntry("fatal", message, context));
    }
  }

  /**
   * Log an error with automatic context extraction
   */
  logError(error: Error, context?: LogContext): void {
    this.error(error.message, {
      ...context,
      cause: error,
      stack: error.stack,
    });
  }

  /**
   * Create a child logger with additional context
   */
  child(defaultContext: LogContext): Logger {
    const childLogger = new Logger(this.service);
    const originalMethods = {
      debug: childLogger.debug.bind(childLogger),
      info: childLogger.info.bind(childLogger),
      warn: childLogger.warn.bind(childLogger),
      error: childLogger.error.bind(childLogger),
      fatal: childLogger.fatal.bind(childLogger),
      logError: childLogger.logError.bind(childLogger),
    };

    childLogger.debug = (message: string, context?: LogContext) =>
      originalMethods.debug(message, { ...defaultContext, ...context });
    childLogger.info = (message: string, context?: LogContext) =>
      originalMethods.info(message, { ...defaultContext, ...context });
    childLogger.warn = (message: string, context?: LogContext) =>
      originalMethods.warn(message, { ...defaultContext, ...context });
    childLogger.error = (message: string, context?: LogContext) =>
      originalMethods.error(message, { ...defaultContext, ...context });
    childLogger.fatal = (message: string, context?: LogContext) =>
      originalMethods.fatal(message, { ...defaultContext, ...context });
    childLogger.logError = (error: Error, context?: LogContext) =>
      originalMethods.logError(error, { ...defaultContext, ...context });

    return childLogger;
  }

  /**
   * Create a request-scoped logger
   */
  forRequest(
    requestId: string,
    endpoint?: string,
    method?: string,
    userId?: string,
  ): Logger {
    return this.child({ requestId, endpoint, method, userId });
  }
}

// Default logger instance
export const logger = new Logger();

/**
 * Create a logger for a specific module/service
 */
export function createLogger(service: string): Logger {
  return new Logger(service);
}

/**
 * Middleware helper to add request logging
 */
export function withRequestLogging<
  T extends (...args: unknown[]) => Promise<unknown>,
>(handler: T, loggerInstance: Logger = logger): T {
  return (async (...args: unknown[]) => {
    const request = args[0] as
      { headers?: { get: (name: string) => string | null } } | undefined;
    const requestId =
      request?.headers?.get("x-request-id") ?? crypto.randomUUID();
    const endpoint = request?.headers?.get("x-endpoint") ?? "unknown";
    const method = request?.headers?.get("x-method") ?? "unknown";

    const requestLogger = loggerInstance.forRequest(
      requestId,
      endpoint,
      method,
    );
    const startTime = Date.now();

    requestLogger.info("Request started", { endpoint, method });

    try {
      const result = await handler(...args);
      const duration = Date.now() - startTime;
      requestLogger.info("Request completed", { duration, status: "success" });
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      requestLogger.logError(error as Error, { duration, status: "error" });
      throw error;
    }
  }) as T;
}
