'use client'

import { useState, useEffect, useCallback } from 'react'
import { IconCreditCard, IconExternalLink, IconAlertTriangle, IconClock } from '@tabler/icons-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'

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

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="font-mono text-sm text-muted-foreground">
          {formatNumber(used)} / {formatNumber(limit)} {unit}
        </span>
      </div>
      <Progress
        value={pct}
        className={`h-2 ${pct > 80 ? '[&>div]:bg-destructive' : pct > 60 ? '[&>div]:bg-amber-500' : '[&>div]:bg-emerald-500'}`}
      />
    </div>
  )
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return n.toFixed(0)
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

function getStatusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'active': return 'default'
    case 'trialing': return 'secondary'
    case 'past_due': return 'destructive'
    default: return 'outline'
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
      <div className="flex items-center justify-center p-8">
        <span className="text-sm text-muted-foreground">Loading billing information...</span>
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
    <div className="flex flex-col gap-5">
      {/* Past Due Warning Banner */}
      {isPastDue && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="flex items-center gap-3 px-5 py-4">
            <IconAlertTriangle className="size-5 shrink-0 text-destructive" />
            <div className="flex-1">
              <p className="text-sm font-medium text-destructive">Payment past due</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Last payment failed. Update the payment method to avoid service interruption.
              </p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={handlePortalRedirect}
              disabled={portalLoading}
            >
              Update Payment
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Current Plan Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <IconCreditCard className="size-5 text-muted-foreground" />
              <CardTitle className="text-base">Current Plan</CardTitle>
            </div>
            <Badge variant={getStatusVariant(status)}>
              {getStatusLabel(status)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p className="font-mono text-lg font-medium capitalize">{plan}</p>
          {subscription?.currentPeriodEnd && (
            <p className="mt-2 text-sm text-muted-foreground">
              {isTrialing ? 'Trial ends' : 'Billing period ends'}:{' '}
              {new Date(subscription.currentPeriodEnd).toLocaleDateString('en-AU', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Trial Status */}
      {isTrialing && trialEndsAt && (
        <Card className="border-border">
          <CardContent className="flex items-start gap-3 px-5 py-4">
            <IconClock className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium text-foreground">Trial Period</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {subscription?.daysRemaining != null && subscription.daysRemaining > 0 ? (
                  <>
                    <strong className="text-foreground">
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
          </CardContent>
        </Card>
      )}

      {/* Usage Dashboard */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Usage This Period</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
            <p className="text-sm text-muted-foreground">
              Estimated AI cost this period: ${usage.estimatedCostUSD.toFixed(2)} USD
            </p>
          )}
        </CardContent>
      </Card>

      {/* Manage Subscription */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Manage Subscription</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={handlePortalRedirect}
              disabled={portalLoading}
            >
              <IconExternalLink className="size-4" />
              {portalLoading ? 'Opening...' : 'Manage Billing'}
            </Button>
            <Button variant="outline" asChild>
              <a href="/pricing">View Plans</a>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Error display */}
      {error && (
        <Card className="border-destructive/20 bg-destructive/5">
          <CardContent className="px-4 py-3">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
