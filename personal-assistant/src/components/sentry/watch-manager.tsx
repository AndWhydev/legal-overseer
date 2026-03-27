'use client'

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { Shield } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { GlassDropdown } from '@/components/ui/glass-dropdown'

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

// Inline style definitions
const glassCard: React.CSSProperties = {
  padding: '20px',
  borderRadius: 16,
  background: 'var(--glass-card-bg)',
  backdropFilter: 'var(--glass-card-blur)',
  WebkitBackdropFilter: 'var(--glass-card-blur)',
  border: '1px solid var(--glass-card-border)',
  boxShadow: 'var(--glass-card-inset)',
}

const lightCard: React.CSSProperties = {
  padding: '16px',
  borderRadius: 12,
  background: 'var(--glass-pill-bg)',
  backdropFilter: 'var(--glass-card-blur)',
  WebkitBackdropFilter: 'var(--glass-card-blur)',
  border: 'none',
  boxShadow: 'var(--glass-card-inset)',
}

const glassInput: React.CSSProperties = {
  width: '100%',
  padding: '12px 16px',
  borderRadius: 12,
  background: 'var(--glass-card-bg)',
  border: '1px solid var(--glass-interactive-border)',
  color: 'var(--text-primary)',
  fontSize: 14,
  outline: 'none',
  transition: 'border-color 200ms, box-shadow 200ms',
}

const glassSelect: React.CSSProperties = {
  padding: '12px 16px',
  borderRadius: 12,
  background: 'var(--glass-card-bg)',
  border: '1px solid var(--glass-interactive-border)',
  color: 'var(--text-primary)',
  fontSize: 14,
  outline: 'none',
  appearance: 'none' as const,
  cursor: 'pointer',
  transition: 'border-color 200ms',
}

const accentBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  height: 40,
  padding: '0 20px',
  borderRadius: 8,
  background: 'var(--btn-primary-bg, #F1F5F9)',
  border: 'none',
  color: 'var(--btn-primary-fg, #0a0f1a)',
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'all 200ms',
}

const ghostBtn: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 12,
  background: 'transparent',
  border: '1px solid var(--glass-hover-bg)',
  color: 'var(--text-primary)',
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'all 200ms',
}

const sectionHeader: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  letterSpacing: '0.04em',
  textTransform: 'uppercase' as const,
  color: 'var(--text-dim)',
  marginBottom: 12,
}

const cardTitle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  color: 'var(--text-primary)',
}

const bodyText: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 400,
  color: 'var(--text-primary)',
}

const secondaryText: React.CSSProperties = {
  fontSize: 14,
  color: 'var(--text-secondary)',
}

const dimText: React.CSSProperties = {
  fontSize: 14,
  color: 'var(--text-dim)',
}

// ─── Watch type options for GlassDropdown ───────────────────────────────────
const watchTypeOptions = (Object.entries(WATCH_LABEL) as [WatchType, string][]).map(([key, label]) => ({
  value: key,
  label,
}))

export function WatchManager() {
  const [watches, setWatches] = useState<SentryWatch[]>([])
  const [alerts, setAlerts] = useState<SentryAlert[]>([])
  const [form, setForm] = useState<NewWatchForm>(DEFAULT_FORM)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [hoveredWatchId, setHoveredWatchId] = useState<string | null>(null)
  const [hoveredAlertId, setHoveredAlertId] = useState<string | null>(null)

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
      <div style={glassCard}>
        <div style={{ ...dimText }}>Loading sentry watches and alerts...</div>
      </div>
    )
  }

  // Full-page error state when initial load fails and no data is available
  if (errorMessage && watches.length === 0 && alerts.length === 0) {
    return (
      <EmptyState
        title="Something went wrong"
        description={errorMessage}
        action={{ label: 'Retry', onClick: () => { setIsLoading(true); setErrorMessage(null); loadData().catch((err) => setErrorMessage(err instanceof Error ? err.message : 'Failed to load sentry data')).finally(() => setIsLoading(false)) } }}
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {statusMessage ? (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 12,
            background: 'rgba(34, 197, 94, 0.12)',
            border: '1px solid var(--status-success-border)',
            fontSize: 14,
            color: 'var(--bb-green)',
          }}
        >
          {statusMessage}
        </div>
      ) : null}
      {errorMessage ? (
        <div
          id="sentry-error"
          role="alert"
          style={{
            padding: '12px 16px',
            borderRadius: 12,
            background: 'var(--glass-pill-bg, rgba(255, 255, 255, 0.04))',
            border: '1px solid var(--glass-border, rgba(255, 255, 255, 0.03))',
            fontSize: 14,
            color: 'var(--text-secondary, #94A3B8)',
          }}
        >
          {errorMessage}
        </div>
      ) : null}

      {/* Create Watch Section */}
      <section style={glassCard}>
        <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ ...cardTitle, fontSize: 16, fontWeight: 500 }}>Create watch</h2>
          <span style={secondaryText}>{watches.length} watches configured</span>
        </div>
        <form
          id="sentry-create-watch-form"
          style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}
          aria-describedby={errorMessage ? 'sentry-error' : undefined}
          onSubmit={handleCreateWatch}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={dimText}>Watch type</span>
            <GlassDropdown
              options={watchTypeOptions}
              value={form.watch_type}
              onChange={(val) => setForm((prev) => ({ ...prev, watch_type: val as WatchType }))}
              placeholder="Select watch type"
            />
          </div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={dimText}>Description</span>
            <input
              style={glassInput}
              required
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              placeholder="Example: monitor failed payment logs"
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)'
                e.currentTarget.style.boxShadow = '0 0 0 2px rgba(255, 255, 255, 0.08)'
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--glass-interactive-border)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 8, gridColumn: 'span 2' }}>
            <span style={dimText}>Conditions (JSON)</span>
            <textarea
              style={{
                ...glassInput,
                minHeight: 80,
                fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
                fontSize: 14,
              }}
              value={form.conditions}
              onChange={(event) => setForm((prev) => ({ ...prev, conditions: event.target.value }))}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)'
                e.currentTarget.style.boxShadow = '0 0 0 2px rgba(255, 255, 255, 0.08)'
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--glass-interactive-border)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={dimText}>Interval seconds</span>
            <input
              style={glassInput}
              type="number"
              min={60}
              max={86400}
              value={form.interval_seconds}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, interval_seconds: Number(event.target.value) || 60 }))
              }
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)'
                e.currentTarget.style.boxShadow = '0 0 0 2px rgba(255, 255, 255, 0.08)'
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--glass-interactive-border)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={dimText}>Escalation minutes</span>
            <input
              style={glassInput}
              type="number"
              min={1}
              max={1440}
              value={form.escalation_minutes}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, escalation_minutes: Number(event.target.value) || 1 }))
              }
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)'
                e.currentTarget.style.boxShadow = '0 0 0 2px rgba(255, 255, 255, 0.08)'
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--glass-interactive-border)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            />
          </label>
        </form>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
          <button
            type="submit"
            form="sentry-create-watch-form"
            disabled={isSubmitting}
            style={{
              ...accentBtn,
              opacity: isSubmitting ? 0.6 : 1,
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
            }}
            onMouseEnter={(e) => {
              if (!isSubmitting) {
                e.currentTarget.style.background = 'var(--btn-primary-hover, #E2E8F0)'
                e.currentTarget.style.transform = 'translateY(-1px)'
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--btn-primary-bg, #F1F5F9)'
              e.currentTarget.style.transform = 'translateY(0)'
            }}
          >
            {isSubmitting ? 'Creating...' : 'Create watch'}
          </button>
        </div>
      </section>

      {/* Configured Watches Section */}
      <section style={glassCard}>
        <h2 style={{ ...cardTitle, fontSize: 16, fontWeight: 500, marginBottom: 20 }}>Configured watches</h2>
        {watches.length === 0 ? (
          <EmptyState
            icon={<Shield size={24} />}
            title="No watches configured"
            description="Create your first watch above to start monitoring for issues."
          />
        ) : (
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
            {watches.map((watch) => (
              <article
                key={watch.id}
                style={{
                  ...lightCard,
                  background:
                    hoveredWatchId === watch.id ? 'var(--glass-hover-bg)' : 'var(--glass-pill-bg)',
                  transition: 'background 200ms',
                }}
                onMouseEnter={() => setHoveredWatchId(watch.id)}
                onMouseLeave={() => setHoveredWatchId(null)}
              >
                <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={sectionHeader}>{WATCH_LABEL[watch.watch_type]}</span>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '4px 12px',
                      borderRadius: 8,
                      fontSize: 14,
                      fontWeight: 500,
                      letterSpacing: '0.02em',
                      background:
                        watch.status === 'active' ? 'rgba(34, 197, 94, 0.12)' : 'var(--glass-hover-bg)',
                      color: watch.status === 'active' ? 'var(--bb-green)' : 'var(--text-secondary)',
                    }}
                  >
                    {watch.status}
                  </span>
                </div>
                <p style={bodyText}>{watch.description}</p>
                <p style={{ ...dimText, marginTop: 8 }}>
                  Every {watch.interval_seconds}s, escalate after {watch.escalation_minutes}m, last checked{' '}
                  {toLocalDate(watch.last_checked_at)}
                </p>
                <pre
                  style={{
                    marginTop: 12,
                    padding: 12,
                    borderRadius: 12,
                    background: 'var(--bg-card)',
                    border: 'none',
                    overflowX: 'auto',
                    fontSize: 14,
                    color: 'var(--text-dim)',
                    fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
                    lineHeight: 1.4,
                  }}
                >
                  {JSON.stringify(watch.conditions, null, 2)}
                </pre>
                <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                  <button
                    aria-label={watch.status === 'active' ? 'Pause watch' : 'Resume watch'}
                    style={ghostBtn}
                    onClick={() => void handleToggleWatch(watch)}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--glass-interactive-bg)'
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent'
                      e.currentTarget.style.borderColor = 'var(--glass-hover-bg)'
                    }}
                  >
                    {watch.status === 'active' ? 'Pause' : 'Resume'}
                  </button>
                  <button
                    aria-label={`Delete watch: ${watch.description}`}
                    style={{
                      ...ghostBtn,
                      color: 'var(--bb-red)',
                      borderColor: 'rgba(239, 68, 68, 0.3)',
                    }}
                    onClick={() => void handleDeleteWatch(watch.id)}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'
                      e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.5)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent'
                      e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.3)'
                    }}
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Active Alerts Section */}
      <section style={glassCard}>
        <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ ...cardTitle, fontSize: 16, fontWeight: 500 }}>Active alerts</h2>
          <span style={secondaryText}>{activeAlertCount} pending/escalated</span>
        </div>
        {alerts.length === 0 ? (
          <EmptyState
            icon={<Shield size={24} />}
            title="All clear"
            description="Sentry monitors for issues across your channels and alerts you when something needs attention."
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {alerts.map((alert) => (
              <article
                key={alert.id}
                style={{
                  ...lightCard,
                  background:
                    hoveredAlertId === alert.id ? 'var(--glass-hover-bg)' : 'var(--glass-pill-bg)',
                  transition: 'background 200ms',
                }}
                onMouseEnter={() => setHoveredAlertId(alert.id)}
                onMouseLeave={() => setHoveredAlertId(null)}
              >
                <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={sectionHeader}>Alert {alert.id.slice(0, 8)}</span>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '4px 12px',
                      borderRadius: 8,
                      fontSize: 14,
                      fontWeight: 500,
                      letterSpacing: '0.02em',
                      background: 'rgba(234, 179, 8, 0.12)',
                      color: 'var(--bb-amber)',
                    }}
                  >
                    {alert.status}
                  </span>
                </div>
                <p style={bodyText}>{alert.evidence ?? 'No evidence text provided'}</p>
                <p style={{ ...dimText, marginTop: 8 }}>Suggested fix: {alert.remediation_suggestion ?? 'None'}</p>
                <p style={{ ...dimText, marginTop: 8 }}>Created {toLocalDate(alert.created_at)}</p>
                <button
                  onClick={() => void handleAcknowledgeAlert(alert.id)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--glass-interactive-bg)'
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.borderColor = 'var(--glass-hover-bg)'
                  }}
                  style={{
                    ...ghostBtn,
                    marginTop: 12,
                  }}
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
