'use client'

import { useEffect, useState } from 'react'
import { IconCalendar, IconArrowUp, IconArrowDown, IconMinus, IconRefresh } from '@tabler/icons-react'

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

function fmt(cents: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency', currency: 'AUD',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(cents / 100)
}

const highlightIcons: Record<string, typeof IconArrowUp> = {
  positive: IconArrowUp,
  negative: IconArrowDown,
  neutral: IconMinus,
}
const highlightColors: Record<string, string> = {
  positive: 'text-green-500',
  negative: 'text-red-500',
  neutral: 'text-muted-foreground',
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
      <div className="rounded-xl bg-card shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <IconCalendar size={14} className="text-foreground" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Revenue Digest
            </span>
          </div>
          <div className="flex items-center gap-2">
            {(['weekly', 'monthly'] as const).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`text-xs font-medium px-3 py-1 rounded-lg border-none cursor-pointer transition-colors ${
                  period === p
                    ? 'bg-muted text-foreground'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                }`}
              >
                {p}
              </button>
            ))}
            <button
              onClick={generate}
              disabled={generating}
              className="bg-transparent border-none cursor-pointer text-muted-foreground p-1 disabled:cursor-wait"
            >
              <IconRefresh size={14} className={generating ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center text-muted-foreground text-sm py-5">
            Loading...
          </div>
        ) : !latest ? (
          <div className="text-center py-5">
            <div className="text-muted-foreground text-sm mb-2">
              No {period} digest yet
            </div>
            <button
              onClick={generate}
              className="bg-primary text-primary-foreground border-none rounded-lg px-4 py-2 text-sm font-medium cursor-pointer hover:opacity-90 transition-opacity"
            >
              Generate Now
            </button>
          </div>
        ) : (
          <>
            <div className="text-sm text-muted-foreground mb-3">
              {latest.period_start} — {latest.period_end}
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 mb-3">
              {[
                { label: 'Invoiced', value: fmt(latest.invoiced_cents), sub: `${latest.invoices_sent} sent` },
                { label: 'Received', value: fmt(latest.received_cents), sub: `${latest.invoices_paid} paid`, color: 'text-green-500' },
                { label: 'Overdue', value: fmt(latest.overdue_cents), color: latest.overdue_cents > 0 ? 'text-red-500' : undefined },
                { label: '30d Outlook', value: fmt(latest.projected_30d_cents) },
              ].map(m => (
                <div key={m.label} className="p-3 rounded-lg bg-muted/50">
                  <div className="text-xs text-muted-foreground mb-1">{m.label}</div>
                  <div className={`text-base font-medium font-mono tracking-tight ${m.color ?? 'text-foreground'}`}>
                    {m.value}
                  </div>
                  {m.sub && <div className="text-xs text-muted-foreground">{m.sub}</div>}
                </div>
              ))}
            </div>

            {/* Highlights */}
            {latest.highlights.length > 0 && (
              <div className="flex flex-col gap-2">
                {latest.highlights.map((h, i) => {
                  const Icon = highlightIcons[h.type] ?? IconMinus
                  return (
                    <div key={i} className="flex items-center gap-2 py-2">
                      <Icon size={12} className={highlightColors[h.type]} />
                      <span className="text-sm text-foreground">{h.text}</span>
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
