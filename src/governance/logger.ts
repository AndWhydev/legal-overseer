/**
 * Safe logging module for BitBit
 *
 * Wraps all logging with PII redaction to prevent sensitive data leakage.
 * All logs should go through this module for privacy protection.
 */

import { redact, redactObject, redactStackTrace } from './pii-redactor.js';
import { logAuditEvent, type AuditEntry } from '../db/repositories/audit.js';

/**
 * Log levels
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Format timestamp for logs
 */
function formatTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Format log entry for console output
 */
function formatLogEntry(
  level: LogLevel,
  prefix: string,
  message: string,
  data?: unknown
): string {
  const timestamp = formatTimestamp();
  const levelStr = level.toUpperCase().padEnd(5);
  const prefixStr = prefix ? `[${prefix}] ` : '';
  const dataStr = data !== undefined ? ` ${JSON.stringify(data)}` : '';

  return `[${timestamp}] [${levelStr}] ${prefixStr}${message}${dataStr}`;
}

/**
 * Log with PII redaction
 *
 * All sensitive data in message and data will be redacted before logging.
 *
 * @param level - Log level
 * @param message - Log message
 * @param data - Optional structured data to log
 */
export function logSafe(
  level: LogLevel,
  message: string,
  data?: unknown
): void {
  const safeMessage = redact(message);
  const safeData = data !== undefined ? redactObject(data) : undefined;

  const logEntry = formatLogEntry(level, '', safeMessage, safeData);

  switch (level) {
    case 'debug':
      if (process.env.DEBUG) {
        console.log(logEntry);
      }
      break;
    case 'info':
      console.log(logEntry);
      break;
    case 'warn':
      console.warn(logEntry);
      break;
    case 'error':
      console.error(logEntry);
      break;
  }
}

/**
 * Log audit event with PII redaction
 *
 * Wraps logAuditEvent to ensure action_detail is redacted.
 *
 * @param entry - Audit entry to log
 * @returns The generated audit log ID
 */
export function logAuditSafe(entry: AuditEntry): string {
  const safeEntry: AuditEntry = {
    ...entry,
    actionDetail: redact(entry.actionDetail),
  };

  return logAuditEvent(safeEntry);
}

/**
 * Log error with stack trace redaction
 *
 * Safely logs errors with PII removed from messages and stacks.
 *
 * @param error - Error to log
 * @param context - Optional context string describing where error occurred
 */
export function logError(error: Error, context?: string): void {
  const safeStack = redactStackTrace(error);
  const contextStr = context ? `[${context}] ` : '';

  console.error(
    `[${formatTimestamp()}] [ERROR] ${contextStr}${safeStack}`
  );
}

/**
 * Logger interface for scoped loggers
 */
export interface ScopedLogger {
  debug: (message: string, data?: unknown) => void;
  info: (message: string, data?: unknown) => void;
  warn: (message: string, data?: unknown) => void;
  error: (message: string, data?: unknown) => void;
  logError: (error: Error, context?: string) => void;
}

/**
 * Create a scoped logger with a prefix
 *
 * Returns a logger that prepends the prefix to all log messages.
 *
 * @param prefix - Prefix to add to all log messages
 * @returns Scoped logger interface
 */
export function createSafeLogger(prefix: string): ScopedLogger {
  const log = (level: LogLevel, message: string, data?: unknown): void => {
    const safeMessage = redact(message);
    const safeData = data !== undefined ? redactObject(data) : undefined;
    const logEntry = formatLogEntry(level, prefix, safeMessage, safeData);

    switch (level) {
      case 'debug':
        if (process.env.DEBUG) {
          console.log(logEntry);
        }
        break;
      case 'info':
        console.log(logEntry);
        break;
      case 'warn':
        console.warn(logEntry);
        break;
      case 'error':
        console.error(logEntry);
        break;
    }
  };

  return {
    debug: (message: string, data?: unknown) => log('debug', message, data),
    info: (message: string, data?: unknown) => log('info', message, data),
    warn: (message: string, data?: unknown) => log('warn', message, data),
    error: (message: string, data?: unknown) => log('error', message, data),
    logError: (error: Error, context?: string) => {
      const safeStack = redactStackTrace(error);
      const contextStr = context ? `[${context}] ` : '';
      console.error(
        `[${formatTimestamp()}] [ERROR] [${prefix}] ${contextStr}${safeStack}`
      );
    },
  };
}
