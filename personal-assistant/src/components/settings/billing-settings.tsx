'use client'

import { useState, useEffect, useCallback } from 'react'
import { CreditCard, ExternalLink, AlertTriangle, Clock } from 'lucide-react'
import { S, C } from '@/lib/styles/design-tokens'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SubscriptionData {
  plan: string
  status: string
  currentPeriodEnd: string | null
  trialEndsAt: string | null
  daysRemaining: number | null
  features: Record<string, unknown>
  canUpgrade: boolean
  nextTier: string | null
}

interface UsageData {
  orgId: string
  period: string
  totalTokens: number
  totalAgentRuns: number
  totalStorageMB: number
  estimatedCostUSD: number
}

// Plan token limits for usage bars
const PLAN_TOKEN_LIMITS: Record<string, number> = {
  free: 10000,
  starter: 50000,
  growth: 200000,
  scale: 500000,
}

const PLAN_STORAGE_LIMITS_MB: Record<string, number> = {
  free: 100,
  starter: 500,
  growth: 2000,
  scale: 10000,
}

const PLAN_AGENT_RUN_LIMITS: Record<string, number> = {
  free: 50,
  starter: 500,
  growth: 2000,
  scale: 10000,
}

// ---------------------------------------------------------------------------
// Usage Bar
// ---------------------------------------------------------------------------

function UsageBar({
  label,
  used,
  limit,
  unit,
}: {
  label: string
  used: number
  limit: number
  unit: string
}) {
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0
  const barColor =
    pct > 80 ? C.statusError : pct > 60 ? C.statusWarning : C.statusSuccess

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ color: C.textSecondary, fontSize: 14 }}>
          {label}
        </span>
        <span
          style={{
            color: C.textSecondary,
            fontSize: 14,
            fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
          }}
        >
          {formatNumber(used)} / {formatNumber(limit)} {unit}
        </span>
      </div>
      <div
        style={{
          height: 8,
          borderRadius: 8,
          background: 'rgba(255, 255, 255, 0.06)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            borderRadius: 8,
            background: barColor,
            transition: 'width 0.5s ease',
          }}
        />
      </div>
    </div>
  )
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return n.toFixed(0)
}

// ---------------------------------------------------------------------------
// Status badge helper (monochrome -- no blue)
// ---------------------------------------------------------------------------

function getStatusStyle(status: string): React.CSSProperties {
  switch (status) {
    case 'active':
      return { background: C.statusSuccessBg, color: C.statusSuccess }
    case 'trialing':
      // Monochrome: white-on-dark badge for trial instead of blue
      return { background: 'rgba(255, 255, 255, 0.08)', color: C.textPrimary }
    case 'past_due':
      return { background: C.statusErrorBg, color: C.statusError }
    default:
      return { background: 'rgba(255, 255, 255, 0.06)', color: C.textSecondary }
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'active': return 'Active'
    case 'trialing': return 'Trial'
    case 'past_due': return 'Past Due'
    default: return 'No Plan'
  }
}

// ---------------------------------------------------------------------------
// BillingSettings component
// ---------------------------------------------------------------------------

export function BillingSettings() {
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null)
  const [usage, setUsage] = useState<UsageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [portalLoading, setPortalLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [subRes, usageRes] = await Promise.all([
        fetch('/api/billing/subscription'),
        fetch('/api/billing/usage'),
      ])

      if (subRes.ok) {
        setSubscription((await subRes.json()) as SubscriptionData)
      }
      if (usageRes.ok) {
        setUsage((await usageRes.json()) as UsageData)
      }
    } catch {
      setError('Failed to load billing data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  async function handlePortalRedirect() {
    setPortalLoading(true)
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as Record<string, string>
        throw new Error(data.error || 'Failed to open billing portal')
      }
      const { url } = (await res.json()) as { url: string }
      window.location.href = url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open portal')
      setPortalLoading(false)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 32, textAlign: 'center' }}>
        <span style={{ ...S.secondary }}>
          Loading billing information...
        </span>
      </div>
    )
  }

  const plan = subscription?.plan ?? 'free'
  const status = subscription?.status ?? 'none'
  const isTrialing = status === 'trialing'
  const isPastDue = status === 'past_due'
  const trialEndsAt = subscription?.trialEndsAt
  const tokenLimit = PLAN_TOKEN_LIMITS[plan] ?? 10000
  const storageLimit = PLAN_STORAGE_LIMITS_MB[plan] ?? 100
  const agentRunLimit = PLAN_AGENT_RUN_LIMITS[plan] ?? 50

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Past Due Warning Banner */}
      {isPastDue && (
        <div
          style={{
            background: C.statusErrorBg,
            border: `1px solid rgba(239, 68, 68, 0.3)`,
            borderRadius: 12,
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <AlertTriangle size={20} style={{ color: C.statusError, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <p style={{ color: C.statusError, fontWeight: 500, fontSize: 14, margin: 0 }}>
              Payment past due
            </p>
            <p style={{ color: C.textSecondary, fontSize: 14, margin: '4px 0 0 0' }}>
              Last payment failed. Update the payment method to avoid service interruption.
            </p>
          </div>
          <button
            onClick={handlePortalRedirect}
            disabled={portalLoading}
            style={{
              ...S.button,
              ...S.buttonDestructive,
              height: 40,
              padding: '0 16px',
              cursor: portalLoading ? 'wait' : 'pointer',
              opacity: portalLoading ? 0.6 : 1,
              whiteSpace: 'nowrap',
            }}
          >
            Update Payment
          </button>
        </div>
      )}

      {/* Current Plan Card */}
      <div
        style={{
          ...S.card,
          padding: 24,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CreditCard size={20} style={{ color: C.textSecondary }} />
            <h3 style={{ ...S.cardTitle, margin: 0 }}>
              Current Plan
            </h3>
          </div>
          <span
            style={{
              ...S.badge,
              fontSize: 14,
              borderRadius: 8,
              ...getStatusStyle(status),
            }}
          >
            {getStatusLabel(status)}
          </span>
        </div>

        <div style={{ marginBottom: 12 }}>
          <span
            style={{
              ...S.mono,
              fontSize: 16,
            }}
          >
            {plan.charAt(0).toUpperCase() + plan.slice(1)}
          </span>
        </div>

        {subscription?.currentPeriodEnd && (
          <p style={{ color: C.textSecondary, fontSize: 14, margin: 0 }}>
            {isTrialing ? 'Trial ends' : 'Billing period ends'}:{' '}
            {new Date(subscription.currentPeriodEnd).toLocaleDateString('en-AU', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </p>
        )}
      </div>

      {/* Trial Status (only when trialing) -- monochrome, no blue */}
      {isTrialing && trialEndsAt && (
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.04)',
            border: `1px solid ${C.borderHover}`,
            borderRadius: 12,
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
          }}
        >
          <Clock size={20} style={{ color: C.textSecondary, flexShrink: 0, marginTop: 2 }} />
          <div>
            <p style={{ color: C.textPrimary, fontWeight: 500, fontSize: 14, margin: '0 0 4px 0' }}>
              Trial Period
            </p>
            <p style={{ color: C.textSecondary, fontSize: 14, margin: 0, lineHeight: 1.5 }}>
              {subscription?.daysRemaining != null && subscription.daysRemaining > 0 ? (
                <>
                  <strong style={{ color: C.textPrimary }}>
                    {subscription.daysRemaining} day{subscription.daysRemaining !== 1 ? 's' : ''} remaining
                  </strong>
                  {' -- Trial ends on '}
                  {new Date(trialEndsAt).toLocaleDateString('en-AU', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </>
              ) : (
                'Your trial has expired. Subscribe to keep using paid features.'
              )}
            </p>
          </div>
        </div>
      )}

      {/* Usage Dashboard */}
      <div
        style={{
          ...S.card,
          padding: 24,
        }}
      >
        <h3
          style={{
            ...S.cardTitle,
            margin: '0 0 20px 0',
          }}
        >
          Usage This Period
        </h3>

        <UsageBar
          label="AI Tokens"
          used={usage?.totalTokens ?? 0}
          limit={tokenLimit}
          unit="tokens"
        />
        <UsageBar
          label="Agent Runs"
          used={usage?.totalAgentRuns ?? 0}
          limit={agentRunLimit}
          unit="runs"
        />
        <UsageBar
          label="Storage"
          used={usage?.totalStorageMB ?? 0}
          limit={storageLimit}
          unit="MB"
        />

        {usage?.estimatedCostUSD != null && usage.estimatedCostUSD > 0 && (
          <p style={{ color: C.textDim, fontSize: 14, margin: '8px 0 0 0' }}>
            Estimated AI cost this period: ${usage.estimatedCostUSD.toFixed(2)} USD
          </p>
        )}
      </div>

      {/* Manage Subscription */}
      <div
        style={{
          ...S.card,
          padding: 24,
        }}
      >
        <h3
          style={{
            ...S.cardTitle,
            margin: '0 0 16px 0',
          }}
        >
          Manage Subscription
        </h3>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <button
            onClick={handlePortalRedirect}
            disabled={portalLoading}
            style={{
              ...S.button,
              ...S.buttonPrimary,
              cursor: portalLoading ? 'wait' : 'pointer',
              opacity: portalLoading ? 0.6 : 1,
            }}
          >
            <ExternalLink size={16} />
            {portalLoading ? 'Opening...' : 'Manage Billing'}
          </button>

          <a
            href="/pricing"
            style={{
              ...S.button,
              ...S.buttonGhost,
              textDecoration: 'none',
            }}
          >
            View Plans
          </a>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div
          style={{
            background: C.statusErrorBg,
            border: `1px solid rgba(239, 68, 68, 0.2)`,
            borderRadius: 12,
            padding: '12px 16px',
            color: C.statusError,
            fontSize: 14,
          }}
        >
          {error}
        </div>
      )}
    </div>
  )
}
