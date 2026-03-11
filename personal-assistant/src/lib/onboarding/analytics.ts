import { logger } from '@/lib/core/logger'

type OnboardingEvent =
  | 'onboarding_started'
  | 'workspace_completed'
  | 'connections_entered'
  | 'connection_succeeded'
  | 'connections_skipped'
  | 'sync_started'
  | 'agents_viewed'
  | 'agents_completed'
  | 'value_viewed'
  | 'onboarding_completed'
  | 'onboarding_abandoned'

export function trackOnboardingEvent(
  event: OnboardingEvent,
  metadata?: Record<string, unknown>
) {
  logger.info(`[onboarding] ${event}`, { event, ...metadata })

  try {
    fetch('/api/analytics/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, metadata, timestamp: new Date().toISOString() }),
    }).catch(() => {})
  } catch {
    // best effort — never block onboarding flow
  }
}
