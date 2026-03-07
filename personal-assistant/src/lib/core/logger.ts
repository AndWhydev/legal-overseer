type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  [key: string]: unknown;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const MIN_LEVEL = LOG_LEVELS[(process.env.LOG_LEVEL as LogLevel) || 'info'];
const IS_PROD = process.env.NODE_ENV === 'production';

function log(level: LogLevel, message: string, ...args: unknown[]) {
  if (LOG_LEVELS[level] < MIN_LEVEL) return;

  // Normalise variadic args into a single meta object
  let meta: Record<string, unknown> | undefined;
  if (args.length === 1) {
    const a = args[0];
    if (a && typeof a === 'object' && !Array.isArray(a)) {
      meta = a as Record<string, unknown>;
    } else {
      meta = { detail: a };
    }
  } else if (args.length > 1) {
    meta = { details: args };
  }

  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...meta,
  };

  if (IS_PROD) {
    // Structured JSON for log aggregation
    const output = JSON.stringify(entry);
    if (level === 'error') {
      console.error(output);
    } else if (level === 'warn') {
      console.warn(output);
    } else {
      console.log(output);
    }
  } else {
    // Colorized dev output
    const colors: Record<LogLevel, string> = {
      debug: '\x1b[90m',
      info: '\x1b[36m',
      warn: '\x1b[33m',
      error: '\x1b[31m',
    };
    const reset = '\x1b[0m';
    const prefix = `${colors[level]}[${level.toUpperCase()}]${reset}`;
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    if (level === 'error') {
      console.error(`${prefix} ${message}${metaStr}`);
    } else if (level === 'warn') {
      console.warn(`${prefix} ${message}${metaStr}`);
    } else {
      console.log(`${prefix} ${message}${metaStr}`);
    }
  }
}

export const logger = {
  debug: (message: string, ...args: unknown[]) => log('debug', message, ...args),
  info: (message: string, ...args: unknown[]) => log('info', message, ...args),
  warn: (message: string, ...args: unknown[]) => log('warn', message, ...args),
  error: (message: string, ...args: unknown[]) => log('error', message, ...args),
};
