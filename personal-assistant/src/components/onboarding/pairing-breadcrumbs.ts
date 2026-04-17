import * as Sentry from '@sentry/nextjs'

/**
 * Add a Sentry breadcrumb for a bridge-pairing state transition. Crucial
 * for field debugging — when a user reports "the QR never appeared" or
 * "the connect page hung," these breadcrumbs give the engineer the
 * state machine trace leading up to the failure.
 *
 * Safe no-op when Sentry isn't initialised (e.g. local dev without DSN).
 */
export function pairingBreadcrumb(opts: {
  surface: 'imessage' | 'whatsapp' | 'android-messages' | 'telegram'
  event: string
  level?: 'info' | 'warning' | 'error'
  data?: Record<string, unknown>
}): void {
  try {
    Sentry.addBreadcrumb({
      category: 'pairing',
      level: opts.level ?? 'info',
      message: `[${opts.surface}] ${opts.event}`,
      data: opts.data,
    })
  } catch {
    // Sentry missing / disabled / SSR — never let breadcrumbs break the UI.
  }
}
