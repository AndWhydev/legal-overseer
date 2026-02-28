'use client'

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'

type WatchStatus = 'active' | 'paused'
type WatchType = 'error_keyword' | 'uptime' | 'negative_sentiment'

interface SentryWatch {
  id: string
  watch_type: WatchType
  description: string
  conditions: Record<string, unknown>
  status: WatchStatus
  interval_seconds: number
  escalation_minutes: number
  last_checked_at: string | null
}

interface SentryAlert {
  id: string
  watch_id: string
  status: 'pending' | 'escalated' | 'acknowledged' | 'resolved'
  evidence: string | null
  remediation_suggestion: string | null
  created_at: string
}

interface NewWatchForm {
  watch_type: WatchType
  description: string
  conditions: string
  interval_seconds: number
  escalation_minutes: number
}

const WATCH_LABEL: Record<WatchType, string> = {
  error_keyword: 'Error keyword',
  uptime: 'Uptime',
  negative_sentiment: 'Negative sentiment',
}

const DEFAULT_FORM: NewWatchForm = {
  watch_type: 'error_keyword',
  description: '',
  conditions: '{"keywords":["error","failed"]}',
  interval_seconds: 300,
  escalation_minutes: 15,
}

function toLocalDate(iso: string | null): string {
  if (!iso) return 'Never'
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return 'Unknown'
  return parsed.toLocaleString()
}

export function WatchManager() {
  const [watches, setWatches] = useState<SentryWatch[]>([])
  const [alerts, setAlerts] = useState<SentryAlert[]>([])
  const [form, setForm] = useState<NewWatchForm>(DEFAULT_FORM)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const activeAlertCount = useMemo(
    () => alerts.filter((alert) => alert.status === 'pending' || alert.status === 'escalated').length,
    [alerts],
  )

  const loadData = useCallback(async () => {
    setErrorMessage(null)
    const [watchRes, alertRes] = await Promise.all([
      fetch('/api/agent/sentry/watches'),
      fetch('/api/agent/sentry/alerts'),
    ])

    if (!watchRes.ok) {
      const watchError = (await watchRes.json().catch(() => ({}))) as { error?: string }
      throw new Error(watchError.error ?? 'Failed to load watches')
    }

    if (!alertRes.ok) {
      const alertError = (await alertRes.json().catch(() => ({}))) as { error?: string }
      throw new Error(alertError.error ?? 'Failed to load alerts')
    }

    const watchBody = (await watchRes.json()) as { watches?: SentryWatch[] }
    const alertBody = (await alertRes.json()) as { alerts?: SentryAlert[] }

    setWatches(watchBody.watches ?? [])
    setAlerts(alertBody.alerts ?? [])
  }, [])

  useEffect(() => {
    let mounted = true

    async function bootstrap() {
      try {
        await loadData()
      } catch (error) {
        if (!mounted) return
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load sentry data')
      } finally {
        if (mounted) {
          setIsLoading(false)
        }
      }
    }

    void bootstrap()

    return () => {
      mounted = false
    }
  }, [loadData])

  async function refreshAfterMutation(successMessage: string) {
    try {
      await loadData()
      setStatusMessage(successMessage)
      setErrorMessage(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Refresh failed after update')
    }
  }

  async function handleCreateWatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setStatusMessage(null)
    setErrorMessage(null)

    let parsedConditions: Record<string, unknown>
    try {
      parsedConditions = JSON.parse(form.conditions) as Record<string, unknown>
    } catch {
      setIsSubmitting(false)
      setErrorMessage('Conditions must be valid JSON object syntax.')
      return
    }

    try {
      const response = await fetch('/api/agent/sentry/watches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          watch_type: form.watch_type,
          description: form.description,
          conditions: parsedConditions,
          interval_seconds: form.interval_seconds,
          escalation_minutes: form.escalation_minutes,
        }),
      })

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? 'Failed to create watch')
      }

      setForm(DEFAULT_FORM)
      await refreshAfterMutation('Watch created.')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to create watch')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleToggleWatch(watch: SentryWatch) {
    const nextStatus: WatchStatus = watch.status === 'active' ? 'paused' : 'active'
    setStatusMessage(null)
    setErrorMessage(null)
    setWatches((prev) => prev.map((item) => (item.id === watch.id ? { ...item, status: nextStatus } : item)))

    try {
      const response = await fetch('/api/agent/sentry/watches', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ watchId: watch.id, status: nextStatus }),
      })

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? 'Failed to update watch status')
      }

      await refreshAfterMutation(nextStatus === 'active' ? 'Watch resumed.' : 'Watch paused.')
    } catch (error) {
      setWatches((prev) => prev.map((item) => (item.id === watch.id ? { ...item, status: watch.status } : item)))
      setErrorMessage(error instanceof Error ? error.message : 'Failed to update watch')
    }
  }

  async function handleDeleteWatch(watchId: string) {
    setStatusMessage(null)
    setErrorMessage(null)
    const previousWatches = watches
    setWatches((prev) => prev.filter((watch) => watch.id !== watchId))

    try {
      const response = await fetch(`/api/agent/sentry/watches?watchId=${encodeURIComponent(watchId)}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? 'Failed to delete watch')
      }

      await refreshAfterMutation('Watch deleted.')
    } catch (error) {
      setWatches(previousWatches)
      setErrorMessage(error instanceof Error ? error.message : 'Failed to delete watch')
    }
  }

  async function handleAcknowledgeAlert(alertId: string) {
    setStatusMessage(null)
    setErrorMessage(null)
    const previousAlerts = alerts
    setAlerts((prev) => prev.filter((alert) => alert.id !== alertId))

    try {
      const response = await fetch('/api/agent/sentry/alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'acknowledge', alertId }),
      })

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? 'Failed to acknowledge alert')
      }

      await refreshAfterMutation('Alert acknowledged.')
    } catch (error) {
      setAlerts(previousAlerts)
      setErrorMessage(error instanceof Error ? error.message : 'Failed to acknowledge alert')
    }
  }

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
        Loading sentry watches and alerts...
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {statusMessage ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-500">
          {statusMessage}
        </div>
      ) : null}
      {errorMessage ? (
        <div id="sentry-error" role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {errorMessage}
        </div>
      ) : null}

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Create watch</h2>
          <p className="text-sm text-muted-foreground">{watches.length} watches configured</p>
        </div>
        <form className="grid gap-3 md:grid-cols-2" aria-describedby={errorMessage ? 'sentry-error' : undefined} onSubmit={handleCreateWatch}>
          <label className="flex flex-col gap-1 text-sm">
            Watch type
            <select
              className="rounded-md border border-border bg-background px-3 py-2"
              value={form.watch_type}
              onChange={(event) => setForm((prev) => ({ ...prev, watch_type: event.target.value as WatchType }))}
            >
              {Object.entries(WATCH_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Description
            <input
              className="rounded-md border border-border bg-background px-3 py-2"
              required
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              placeholder="Example: monitor failed payment logs"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm md:col-span-2">
            Conditions (JSON)
            <textarea
              className="min-h-20 rounded-md border border-border bg-background px-3 py-2 font-mono text-xs"
              value={form.conditions}
              onChange={(event) => setForm((prev) => ({ ...prev, conditions: event.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Interval seconds
            <input
              className="rounded-md border border-border bg-background px-3 py-2"
              type="number"
              min={60}
              max={86400}
              value={form.interval_seconds}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, interval_seconds: Number(event.target.value) || 60 }))
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Escalation minutes
            <input
              className="rounded-md border border-border bg-background px-3 py-2"
              type="number"
              min={1}
              max={1440}
              value={form.escalation_minutes}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, escalation_minutes: Number(event.target.value) || 1 }))
              }
            />
          </label>
          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg border border-border bg-secondary px-4 py-2 text-sm font-medium hover:bg-secondary/70 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? 'Creating...' : 'Create watch'}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-4 text-lg font-semibold">Configured watches</h2>
        {watches.length === 0 ? (
          <p className="text-sm text-muted-foreground">No watches yet. Create your first watch above.</p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {watches.map((watch) => (
              <article key={watch.id} className="rounded-lg border border-border bg-background p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">
                    {WATCH_LABEL[watch.watch_type]}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      watch.status === 'active'
                        ? 'bg-emerald-500/10 text-emerald-500'
                        : 'bg-secondary text-muted-foreground'
                    }`}
                  >
                    {watch.status}
                  </span>
                </div>
                <p className="text-sm font-medium">{watch.description}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Every {watch.interval_seconds}s, escalate after {watch.escalation_minutes}m, last checked{' '}
                  {toLocalDate(watch.last_checked_at)}
                </p>
                <pre className="mt-3 overflow-auto rounded border border-border bg-card p-2 text-xs text-muted-foreground">
                  {JSON.stringify(watch.conditions, null, 2)}
                </pre>
                <div className="mt-3 flex gap-2">
                  <button
                    aria-label={watch.status === 'active' ? 'Pause watch' : 'Resume watch'}
                    className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary"
                    onClick={() => void handleToggleWatch(watch)}
                  >
                    {watch.status === 'active' ? 'Pause' : 'Resume'}
                  </button>
                  <button
                    aria-label={`Delete watch: ${watch.description}`}
                    className="rounded-md border border-destructive/30 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
                    onClick={() => void handleDeleteWatch(watch.id)}
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Active alerts</h2>
          <span className="text-sm text-muted-foreground">{activeAlertCount} pending/escalated</span>
        </div>
        {alerts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pending alerts. You are all clear.</p>
        ) : (
          <div className="space-y-3">
            {alerts.map((alert) => (
              <article key={alert.id} className="rounded-lg border border-border bg-background p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">Alert {alert.id.slice(0, 8)}</span>
                  <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-500">
                    {alert.status}
                  </span>
                </div>
                <p className="text-sm text-foreground">{alert.evidence ?? 'No evidence text provided'}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Suggested fix: {alert.remediation_suggestion ?? 'None'}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Created {toLocalDate(alert.created_at)}</p>
                <button
                  className="mt-3 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary"
                  onClick={() => void handleAcknowledgeAlert(alert.id)}
                >
                  Acknowledge
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
