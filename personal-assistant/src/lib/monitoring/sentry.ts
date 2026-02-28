/**
 * Sentry Error Tracking Initialization
 *
 * Configures Sentry for both client and server-side error capture.
 * Import this module early in the application lifecycle.
 *
 * NOTE: Requires `@sentry/nextjs` to be installed. If not present,
 * all functions gracefully degrade to console logging.
 */

interface SentryBreadcrumb {
  category: string;
  message: string;
  level: 'info' | 'warning' | 'error';
  data?: Record<string, unknown>;
}

/** Minimal Sentry SDK shape for duck typing */
interface SentrySDK {
  init: (config: Record<string, unknown>) => void;
  captureException: (error: Error, context?: Record<string, unknown>) => void;
  captureMessage: (message: string, level?: string) => void;
  addBreadcrumb: (breadcrumb: Record<string, unknown>) => void;
  setUser: (user: Record<string, unknown> | null) => void;
}

// Lazy-loaded Sentry SDK reference
let sentryInstance: SentrySDK | null = null;

export function isSentryConfigured(): boolean {
  return !!process.env.SENTRY_DSN;
}

/**
 * Initialize Sentry. Safe to call multiple times (idempotent).
 * Returns false if Sentry DSN is not configured or SDK not installed.
 */
export async function initSentry(): Promise<boolean> {
  if (!isSentryConfigured()) return false;
  if (sentryInstance) return true;

  try {
    // Use indirect eval to bypass static analysis of the import path
    const moduleName = '@sentry/nextjs';
    const Sentry = await (new Function('m', 'return import(m)')(moduleName)) as SentrySDK;

    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
      release: process.env.SENTRY_RELEASE || `bitbit@${process.env.VERCEL_GIT_COMMIT_SHA || 'local'}`,
      tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
      profilesSampleRate: parseFloat(process.env.SENTRY_PROFILES_SAMPLE_RATE || '0.1'),
    });

    sentryInstance = Sentry;
    return true;
  } catch (err) {
    console.warn('[sentry] Failed to initialize (SDK may not be installed):', err);
    return false;
  }
}

/**
 * Capture an exception with optional context tags.
 */
export async function captureException(
  error: Error,
  context?: Record<string, string>
): Promise<void> {
  if (!sentryInstance) await initSentry();
  if (sentryInstance) {
    sentryInstance.captureException(error, { tags: context });
  } else {
    console.error('[sentry:fallback]', error.message, context);
  }
}

/**
 * Capture a message with severity level.
 */
export async function captureMessage(
  message: string,
  level: 'info' | 'warning' | 'error' = 'info'
): Promise<void> {
  if (!sentryInstance) await initSentry();
  if (sentryInstance) {
    sentryInstance.captureMessage(message, level);
  } else {
    console[level === 'error' ? 'error' : level === 'warning' ? 'warn' : 'log'](
      `[sentry:fallback] ${message}`
    );
  }
}

/**
 * Add a breadcrumb for debugging context.
 */
export async function addBreadcrumb(breadcrumb: SentryBreadcrumb): Promise<void> {
  if (!sentryInstance) await initSentry();
  if (sentryInstance) {
    sentryInstance.addBreadcrumb({ ...breadcrumb });
  }
}

/**
 * Set user context for error attribution.
 */
export async function setUser(user: { id: string; orgId?: string }): Promise<void> {
  if (!sentryInstance) await initSentry();
  if (sentryInstance) {
    sentryInstance.setUser({ id: user.id, segment: user.orgId });
  }
}

/**
 * Wrap an async function with Sentry error capture.
 */
export function withSentry<T extends (...args: never[]) => Promise<unknown>>(
  fn: T,
  operationName: string
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (err) {
      await captureException(err instanceof Error ? err : new Error(String(err)), {
        operation: operationName,
      });
      throw err;
    }
  }) as T;
}

/**
 * Track performance metrics (latency, success/failure).
 */
export async function trackMetric(
  name: string,
  value: number,
  context?: Record<string, string>
): Promise<void> {
  if (sentryInstance) {
    sentryInstance.captureMessage(`metric: ${name}=${value}`, 'info');
  } else {
    console.log(`[sentry:fallback] metric: ${name}=${value}`, context);
  }
}

/**
 * Set custom context for debugging.
 */
export async function setContext(
  contextName: string,
  context: Record<string, unknown>
): Promise<void> {
  if (!sentryInstance) await initSentry();
  // Note: We're calling addBreadcrumb as a workaround since setContext isn't in our minimal interface
  if (sentryInstance && 'setContext' in sentryInstance) {
    (sentryInstance as any).setContext(contextName, context);
  }
}

/**
 * Create a performance span for tracing.
 */
export async function startSpan(
  operationName: string
): Promise<{ end: () => void; recordException: (err: Error) => void }> {
  const startTime = Date.now();

  return {
    end: () => {
      const duration = Date.now() - startTime;
      trackMetric(`span.${operationName}`, duration).catch(console.error);
    },
    recordException: (err: Error) => {
      captureException(err, { span: operationName }).catch(console.error);
    },
  };
}
