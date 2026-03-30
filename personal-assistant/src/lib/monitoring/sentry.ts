import * as Sentry from '@sentry/nextjs'

let sentryInitialized = false

export function initSentry(): void {
  if (sentryInitialized) return

  const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN
  if (!dsn) return

  const environment = process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV || 'development'
  const release = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA
  const tracesSampleRate = environment === 'production' ? 0.1 : 1.0

  Sentry.init({
    dsn,
    environment,
    release,
    tracesSampleRate,
    integrations: [Sentry.httpIntegration(), Sentry.expressIntegration()],
  })

  sentryInitialized = true
}

export function captureAgentError(
  agentName: string,
  error: Error,
  context?: Record<string, unknown>,
): void {
  initSentry()

  Sentry.withScope((scope) => {
    scope.setTag('agent_name', agentName)
    if (context) {
      scope.setExtras(context)
    }

    Sentry.captureException(error)
  })
}

export function captureChannelError(
  channelName: string,
  error: Error,
  context?: Record<string, unknown>,
): void {
  initSentry()

  Sentry.withScope((scope) => {
    scope.setTag('channel_name', channelName)
    if (context) {
      scope.setExtras(context)
    }

    Sentry.captureException(error)
  })
}

export function setSentryUserContext(userId: string, orgId: string, email?: string) {
  Sentry.setUser({ id: userId, email })
  Sentry.setTag('org_id', orgId)
}

export async function withMonitoring<T>(name: string, fn: () => Promise<T>): Promise<T> {
  initSentry()

  const transaction = Sentry.startInactiveSpan({
    name,
    op: 'monitoring',
  })

  try {
    return await fn()
  } catch (error) {
    const normalizedError =
      error instanceof Error ? error : new Error(`Non-error thrown in ${name}: ${String(error)}`)
    Sentry.captureException(normalizedError)
    throw error
  } finally {
    transaction.end()
  }
}
