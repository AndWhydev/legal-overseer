import { logger } from '@/lib/core/logger'

type OnboardingEvent =
  | 'onboarding_started'
  | 'chat_surface_selected' // user picked iMessage/WhatsApp/Android/Telegram/Web
  | 'chat_surface_connected' // chosen surface is provisioned & reachable
  | 'workspace_completed'
  | 'connections_entered'
  | 'connection_succeeded'
  | 'connections_skipped'
  | 'sync_started'
  | 'discovery_completed'
  | 'discovery_skipped'
  | 'agents_viewed'
  | 'agents_completed'
  | 'value_viewed'
  | 'onboarding_completed'
  | 'onboarding_abandoned'
  | 'onboarding_error'
  // ⭐ North-Star event: user has had their first bidirectional exchange with
  // BitBit on their chosen chat surface. Emitted from the channel ingestion
  // pipeline on the first round-trip, not from the onboarding UI.
  | 'activation_reached'

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
