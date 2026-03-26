'use client'

import { useState, useEffect, useCallback } from 'react'
import { CreditCard, ExternalLink, AlertTriangle } from 'lucide-react'

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
    pct > 80 ? '#ef4444' : pct > 60 ? '#eab308' : '#22c55e'

  return (
    <div style={{ marginBottom: 16 }}>
      <div className="flex justify-between" style={{ marginBottom: 6 }}>
        <span style={{ color: 'var(--text-secondary, #94A3B8)', fontSize: 13 }}>
          {label}
        </span>
        <span style={{ color: 'var(--text-secondary, #94A3B8)', fontSize: 13 }}>
          {formatNumber(used)} / {formatNumber(limit)} {unit}
        </span>
      </div>
      <div
        style={{
          height: 8,
          borderRadius: 4,
          background: 'rgba(255, 255, 255, 0.06)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            borderRadius: 4,
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
    } catch (err) {
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
        <span style={{ color: 'var(--text-secondary, #94A3B8)', fontSize: 14 }}>
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
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 12,
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <AlertTriangle size={20} style={{ color: '#ef4444', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <p style={{ color: '#ef4444', fontWeight: 500, fontSize: 14, margin: 0 }}>
              Payment past due
            </p>
            <p style={{ color: 'var(--text-secondary, #94A3B8)', fontSize: 13, margin: '4px 0 0 0' }}>
              Last payment failed. Update the payment method to avoid service interruption.
            </p>
          </div>
          <button
            onClick={handlePortalRedirect}
            disabled={portalLoading}
            style={{
              background: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 500,
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
          background: 'rgba(15, 20, 30, 0.6)',
          border: '1px solid rgba(255, 255, 255, 0.03)',
          borderRadius: 12,
          padding: 24,
        }}
      >
        <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
          <div className="flex items-center" style={{ gap: 10 }}>
            <CreditCard size={18} style={{ color: 'var(--text-secondary, #94A3B8)' }} />
            <h3 style={{ color: 'var(--text-primary, #F1F5F9)', fontSize: 16, fontWeight: 500, margin: 0 }}>
              Current Plan
            </h3>
          </div>
          <span
            style={{
              fontSize: 12,
              fontWeight: 500,
              padding: '4px 10px',
              borderRadius: 20,
              ...(status === 'active'
                ? { background: 'rgba(34, 197, 94, 0.12)', color: '#22c55e' }
                : status === 'trialing'
                  ? { background: 'rgba(59, 130, 246, 0.12)', color: '#3b82f6' }
                  : status === 'past_due'
                    ? { background: 'rgba(239, 68, 68, 0.12)', color: '#ef4444' }
                    : { background: 'rgba(255, 255, 255, 0.06)', color: 'var(--text-secondary, #94A3B8)' }),
            }}
          >
            {status === 'trialing' ? 'Trial' : status === 'past_due' ? 'Past Due' : status === 'active' ? 'Active' : 'No Plan'}
          </span>
        </div>

        <div style={{ marginBottom: 12 }}>
          <span style={{ color: 'var(--text-primary, #F1F5F9)', fontSize: 28, fontWeight: 500 }}>
            {plan.charAt(0).toUpperCase() + plan.slice(1)}
          </span>
        </div>

        {subscription?.currentPeriodEnd && (
          <p style={{ color: 'var(--text-secondary, #94A3B8)', fontSize: 13, margin: 0 }}>
            {isTrialing ? 'Trial ends' : 'Billing period ends'}:{' '}
            {new Date(subscription.currentPeriodEnd).toLocaleDateString('en-AU', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </p>
        )}
      </div>

      {/* Trial Status (only when trialing) */}
      {isTrialing && trialEndsAt && (
        <div
          style={{
            background: 'rgba(59, 130, 246, 0.08)',
            border: '1px solid rgba(59, 130, 246, 0.2)',
            borderRadius: 12,
            padding: '16px 20px',
          }}
        >
          <p style={{ color: '#3b82f6', fontWeight: 500, fontSize: 14, margin: '0 0 6px 0' }}>
            Trial Period
          </p>
          <p style={{ color: 'var(--text-secondary, #94A3B8)', fontSize: 13, margin: 0 }}>
            {subscription?.daysRemaining != null && subscription.daysRemaining > 0 ? (
              <>
                <strong style={{ color: 'var(--text-primary, #F1F5F9)' }}>
                  {subscription.daysRemaining} day{subscription.daysRemaining !== 1 ? 's' : ''} remaining
                </strong>
                {' '}-- Trial ends on{' '}
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
      )}

      {/* Usage Dashboard */}
      <div
        style={{
          background: 'rgba(15, 20, 30, 0.6)',
          border: '1px solid rgba(255, 255, 255, 0.03)',
          borderRadius: 12,
          padding: 24,
        }}
      >
        <h3
          style={{
            color: 'var(--text-primary, #F1F5F9)',
            fontSize: 16,
            fontWeight: 500,
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
          <p style={{ color: 'var(--text-dim, #475569)', fontSize: 12, margin: '8px 0 0 0' }}>
            Estimated AI cost this period: ${usage.estimatedCostUSD.toFixed(2)} USD
          </p>
        )}
      </div>

      {/* Manage Subscription */}
      <div
        style={{
          background: 'rgba(15, 20, 30, 0.6)',
          border: '1px solid rgba(255, 255, 255, 0.03)',
          borderRadius: 12,
          padding: 24,
        }}
      >
        <h3
          style={{
            color: 'var(--text-primary, #F1F5F9)',
            fontSize: 16,
            fontWeight: 500,
            margin: '0 0 16px 0',
          }}
        >
          Manage Subscription
        </h3>

        <div className="flex flex-wrap" style={{ gap: 12 }}>
          <button
            onClick={handlePortalRedirect}
            disabled={portalLoading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: '#FF5A1F',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              padding: '10px 20px',
              fontSize: 14,
              fontWeight: 500,
              cursor: portalLoading ? 'wait' : 'pointer',
              opacity: portalLoading ? 0.6 : 1,
              transition: 'opacity 0.2s',
            }}
          >
            <ExternalLink size={14} />
            {portalLoading ? 'Opening...' : 'Manage Billing'}
          </button>

          <a
            href="/pricing"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(255, 255, 255, 0.06)',
              color: 'var(--text-primary, #F1F5F9)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: 8,
              padding: '10px 20px',
              fontSize: 14,
              fontWeight: 500,
              textDecoration: 'none',
              cursor: 'pointer',
              transition: 'background 0.2s',
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
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            borderRadius: 12,
            padding: '12px 16px',
            color: '#ef4444',
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}
    </div>
  )
}
