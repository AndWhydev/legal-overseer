/**
 * Phase 51 D2 — render real connector freshness in the system prompt.
 *
 * Replaces the misleading "synced <date>" wording driven by channel_connections.last_sync.
 * Returns "active — last message {relative}" for recent activity, or a stale/silent label otherwise.
 * Never says "synced" — that concept doesn't apply to webhook-driven providers.
 */
export function formatConnectorFreshness(lastMessageAt: string | null | undefined): string {
  if (!lastMessageAt) return 'connected, no recent messages'

  const then = new Date(lastMessageAt).getTime()
  if (Number.isNaN(then)) return 'connected'

  const diffMs = Date.now() - then
  const diffMin = Math.floor(diffMs / 60_000)
  const diffHr = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHr / 24)

  if (diffMs < 0) return 'active' // clock skew — treat as now
  if (diffMin < 2) return 'active — last message just now'
  if (diffMin < 60) return `active — last message ${diffMin} minutes ago`
  if (diffHr < 24) return `active — last message ${diffHr} ${diffHr === 1 ? 'hour' : 'hours'} ago`
  if (diffDay < 7) return `active — last message ${diffDay} ${diffDay === 1 ? 'day' : 'days'} ago`
  if (diffDay < 30) return `connected, last message ${diffDay} days ago`
  return `connected, no messages in ${diffDay}+ days`
}
