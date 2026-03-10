import * as Sentry from '@sentry/nextjs'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN
if (dsn) {
  const environment = process.env.NODE_ENV || 'development'

  Sentry.init({
    dsn,
    environment,
    tracesSampleRate: environment === 'production' ? 0.1 : 1.0,
    replaysSessionSampleRate: environment === 'production' ? 0.1 : 0,
    replaysOnErrorSampleRate: 1.0,
    integrations: [
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
  })
}
