'use client'

import { useEffect, useState } from 'react'
import { Calendar, ArrowUp, ArrowDown, Minus, FileText, RefreshCw } from 'lucide-react'

interface Digest {
  id: string
  period_type: string
  period_start: string
  period_end: string
  invoiced_cents: number
  received_cents: number
  overdue_cents: number
  projected_30d_cents: number
  invoices_sent: number
  invoices_paid: number
  new_clients: number
  highlights: Array<{ type: string; text: string; impact_cents?: number }>
  created_at: string
}

const card: React.CSSProperties = {
  borderRadius: 12,
  background: 'var(--glass-bg)',
  backdropFilter: 'var(--glass-blur)',
  WebkitBackdropFilter: 'var(--glass-blur)',
  boxShadow: 'var(--card-shadow), var(--card-inset)',
  padding: '20px',
}

function fmt(cents: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency', currency: 'AUD',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(cents / 100)
}

const highlightIcons: Record<string, typeof ArrowUp> = {
  positive: ArrowUp,
  negative: ArrowDown,
  neutral: Minus,
}
const highlightColors: Record<string, string> = {
  positive: 'var(--bb-green)',
  negative: 'var(--bb-red)',
  neutral: 'var(--text-dim)',
}

export function RevenueDigestCard() {
  const [digests, setDigests] = useState<Digest[]>([])
  const [period, setPeriod] = useState<'weekly' | 'monthly'>('weekly')
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)

  const fetchDigests = async () => {
    try {
      const res = await fetch(`/api/revenue/digest?period=${period}`)
      if (res.ok) {
        const { digests: d } = await res.json()
        setDigests(d)
      }
    } catch { /* silent */ }
    setLoading(false)
  }

  useEffect(() => { fetchDigests() }, [period])

  const generate = async () => {
    setGenerating(true)
    try {
      await fetch('/api/revenue/digest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period_type: period }),
      })
      await fetchDigests()
    } catch { /* silent */ }
    setGenerating(false)
  }

  const latest = digests[0]

  return (
    <div className="flex flex-col gap-4">
      <div style={card}>
        <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
          <div className="flex items-center gap-2">
            <Calendar size={14} color="var(--bb-orange)" />
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Revenue Digest
            </span>
          </div>
          <div className="flex items-center gap-2">
            {(['weekly', 'monthly'] as const).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  padding: '4px 10px',
                  borderRadius: 4,
                  border: 'none',
                  cursor: 'pointer',
                  background: period === p ? 'rgba(255, 90, 31, 0.15)' : 'rgba(255, 255, 255, 0.04)',
                  color: period === p ? 'var(--bb-orange)' : 'var(--text-dim)',
                }}
              >
                {p}
              </button>
            ))}
            <button
              onClick={generate}
              disabled={generating}
              style={{
                background: 'none',
                border: 'none',
                cursor: generating ? 'wait' : 'pointer',
                color: 'var(--text-dim)',
                padding: 4,
              }}
            >
              <RefreshCw size={14} style={generating ? { animation: 'spin 1s linear infinite' } : undefined} />
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: 13, padding: 20 }}>
            Loading...
          </div>
        ) : !latest ? (
          <div style={{ textAlign: 'center', padding: 20 }}>
            <div style={{ color: 'var(--text-dim)', fontSize: 13, marginBottom: 8 }}>
              No {period} digest yet
            </div>
            <button
              onClick={generate}
              style={{
                background: 'var(--bb-orange)',
                color: '#000',
                border: 'none',
                borderRadius: 6,
                padding: '6px 16px',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Generate Now
            </button>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 12 }}>
              {latest.period_start} — {latest.period_end}
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" style={{ marginBottom: 12 }}>
              {[
                { label: 'Invoiced', value: fmt(latest.invoiced_cents), sub: `${latest.invoices_sent} sent` },
                { label: 'Received', value: fmt(latest.received_cents), sub: `${latest.invoices_paid} paid`, color: 'var(--bb-green)' },
                { label: 'Overdue', value: fmt(latest.overdue_cents), color: latest.overdue_cents > 0 ? 'var(--bb-red)' : undefined },
                { label: '30d Outlook', value: fmt(latest.projected_30d_cents) },
              ].map(m => (
                <div key={m.label} style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: 'rgba(255, 255, 255, 0.02)',
                }}>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>{m.label}</div>
                  <div style={{
                    fontSize: 18,
                    fontWeight: 700,
                    fontFamily: 'var(--font-mono)',
                    letterSpacing: '-0.02em',
                    color: m.color ?? 'var(--text-primary)',
                  }}>
                    {m.value}
                  </div>
                  {m.sub && <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{m.sub}</div>}
                </div>
              ))}
            </div>

            {/* Highlights */}
            {latest.highlights.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {latest.highlights.map((h, i) => {
                  const Icon = highlightIcons[h.type] ?? Minus
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
                      <Icon size={12} color={highlightColors[h.type]} />
                      <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{h.text}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
