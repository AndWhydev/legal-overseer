import type { DealRotLevel, SpeedToLeadLevel, LeadScore } from './types'

const DAY_MS = 86_400_000
const MINUTE_MS = 60_000

// Deal rot thresholds (days since last activity)
const ROT_AGING = 3
const ROT_STALE = 7
const ROT_CRITICAL = 14

export function getDealRotLevel(lastActivityAt: string | null): DealRotLevel {
  if (!lastActivityAt) return 'critical'
  const daysSince = (Date.now() - new Date(lastActivityAt).getTime()) / DAY_MS
  if (daysSince >= ROT_CRITICAL) return 'critical'
  if (daysSince >= ROT_STALE) return 'stale'
  if (daysSince >= ROT_AGING) return 'aging'
  return 'fresh'
}

// Speed-to-lead thresholds (minutes from creation to first ack)
const SPEED_FAST = 5
const SPEED_OK = 30

export function getSpeedToLeadLevel(
  createdAt: string,
  firstAckAt: string | null,
): SpeedToLeadLevel {
  if (!firstAckAt) return 'slow'
  const minutes = (new Date(firstAckAt).getTime() - new Date(createdAt).getTime()) / MINUTE_MS
  if (minutes <= SPEED_FAST) return 'fast'
  if (minutes <= SPEED_OK) return 'ok'
  return 'slow'
}

export function formatSpeedToLead(createdAt: string, firstAckAt: string | null): string {
  if (!firstAckAt) return 'Not yet'
  const ms = new Date(firstAckAt).getTime() - new Date(createdAt).getTime()
  const minutes = Math.floor(ms / MINUTE_MS)
  if (minutes < 60) {
    const seconds = Math.floor((ms % MINUTE_MS) / 1000)
    return `${minutes}m ${seconds}s`
  }
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return `${hours}h ${remainingMinutes}m`
}

export function pccScoreToLeadScore(priorityScore: number | null): LeadScore {
  if (priorityScore == null) return 'cold'
  if (priorityScore >= 60) return 'hot'
  if (priorityScore >= 35) return 'warm'
  return 'cold'
}

export function formatPipelineValue(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`
  return `$${value}`
}

export function formatCurrency(value: number | null): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0,
  }).format(value)
}

export function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / DAY_MS)
}

export function relativeTime(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(ms / MINUTE_MS)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return `${Math.floor(days / 7)}w ago`
}
