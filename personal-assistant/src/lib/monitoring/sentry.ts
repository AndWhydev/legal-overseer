/**
 * Sentry Error Tracking Initialization
 *
 * Configures Sentry for both client and server-side error capture.
 * Import this module early in the application lifecycle.
 */

interface SentryConfig {
  dsn: string;
  environment: string;
  release: string;
  tracesSampleRate: number;
  profilesSampleRate: number;
}

interface SentryBreadcrumb {
  category: string;
  message: string;
  level: 'info' | 'warning' | 'error';
  data?: Record<string, unknown>;
}

// Lazy-loaded Sentry SDK reference
let sentryInstance: typeof import('@sentry/nextjs') | null = null;

function getConfig(): SentryConfig {
  return {
    dsn: process.env.SENTRY_DSN || '',
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    release: process.env.SENTRY_RELEASE || `bitbit@${process.env.VERCEL_GIT_COMMIT_SHA || 'local'}`,
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
    profilesSampleRate: parseFloat(process.env.SENTRY_PROFILES_SAMPLE_RATE || '0.1'),
  };
}

export function isSentryConfigured(): boolean {
  return !!process.env.SENTRY_DSN;
}

/**
 * Initialize Sentry. Safe to call multiple times (idempotent).
 * Returns false if Sentry DSN is not configured.
 */
export async function initSentry(): Promise<boolean> {
  if (!isSentryConfigured()) {
    return false;
  }

  if (sentryInstance) {
    return true;
  }

  try {
    const Sentry = await import('@sentry/nextjs');
    const config = getConfig();

    Sentry.init({
      dsn: config.dsn,
      environment: config.environment,
      release: config.release,
      tracesSampleRate: config.tracesSampleRate,
      profilesSampleRate: config.profilesSampleRate,
      integrations: [
        Sentry.captureConsoleIntegration({ levels: ['error'] }),
      ],
      beforeSend(event) {
        // Strip PII from error reports
        if (event.user) {
          delete event.user.email;
          delete event.user.ip_address;
        }
        return event;
      },
    });

    sentryInstance = Sentry;
    return true;
  } catch (err) {
    console.warn('[sentry] Failed to initialize:', err);
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
  if (!sentryInstance) {
    await initSentry();
  }

  if (sentryInstance) {
    sentryInstance.captureException(error, {
      tags: context,
    });
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
  if (!sentryInstance) {
    await initSentry();
  }

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
  if (!sentryInstance) {
    await initSentry();
  }

  if (sentryInstance) {
    sentryInstance.addBreadcrumb(breadcrumb);
  }
}

/**
 * Set user context for error attribution.
 */
export async function setUser(user: { id: string; orgId?: string }): Promise<void> {
  if (!sentryInstance) {
    await initSentry();
  }

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
