'use client'

import React, { useEffect, useState } from 'react'
import { TabShell } from '@/components/ui/tab-shell'
import { createClient } from '@/lib/supabase/client'
import { Skeleton } from '@/components/ui/skeleton'

interface Quote {
  id: string
  status: string
  line_items: Array<{ description: string; qty: number; unit: string; total: number }>
  labor_total: number
  materials_total: number
  gst_total: number
  grand_total: number
  valid_until: string | null
  notes: string | null
  created_at: string
  contact: { name: string } | null
  lead: { title: string } | null
}

function statusBadge(s: string): { label: string; cls: string } {
  switch (s) {
    case 'draft': return { label: 'Draft', cls: 'bg-slate-500/15 text-slate-300' }
    case 'sent': return { label: 'Sent', cls: 'bg-blue-500/15 text-blue-300' }
    case 'accepted': return { label: 'Accepted', cls: 'bg-emerald-500/15 text-emerald-300' }
    case 'declined': return { label: 'Declined', cls: 'bg-red-500/15 text-red-300' }
    case 'expired': return { label: 'Expired', cls: 'bg-white/5 text-muted-foreground' }
    default: return { label: s, cls: 'bg-white/5 text-muted-foreground' }
  }
}

function QuotesTab() {
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Quote | null>(null)

  useEffect(() => {
    const supabase = createClient()
    if (!supabase) return
    supabase
      .from('quotes')
      .select('id, status, line_items, labor_total, materials_total, gst_total, grand_total, valid_until, notes, created_at, contact:contacts(name), lead:leads(title)')
      .order('created_at', { ascending: false })
      .then(({ data }: { data: unknown }) => {
        setQuotes((data as unknown as Quote[]) ?? [])
        setLoading(false)
      })
  }, [])

  if (loading) {
    return (
      <TabShell>
        <div className="space-y-3 mt-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      </TabShell>
    )
  }

  if (quotes.length === 0) {
    return (
      <TabShell>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="text-4xl mb-3">📋</div>
          <h3 className="text-lg font-medium">No quotes yet</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Quotes are drafted automatically from enquiries or you can create them manually.
          </p>
        </div>
      </TabShell>
    )
  }

  // Detail view
  if (selected) {
    const badge = statusBadge(selected.status)
    return (
      <TabShell>
        <div className="mt-4">
          <button onClick={() => setSelected(null)} className="text-sm text-primary hover:underline mb-4">
            ← Back to list
          </button>
          <div className="rounded-xl border border-border/50 bg-card/50 p-6 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold">
                  {selected.contact?.name ?? 'Unknown Customer'}
                </h3>
                {selected.lead?.title && (
                  <p className="text-sm text-muted-foreground">{selected.lead.title}</p>
                )}
              </div>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${badge.cls}`}>
                {badge.label}
              </span>
            </div>

            {/* Line items */}
            <table className="w-full text-sm mb-4">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2">Description</th>
                  <th className="pb-2 text-right">Qty</th>
                  <th className="pb-2 text-right">Unit</th>
                  <th className="pb-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {(selected.line_items ?? []).map((item, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="py-2">{item.description}</td>
                    <td className="py-2 text-right">{item.qty}</td>
                    <td className="py-2 text-right">${Number(item.unit).toLocaleString('en-AU')}</td>
                    <td className="py-2 text-right">${Number(item.total).toLocaleString('en-AU')}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Totals */}
            <div className="flex flex-col items-end gap-1 text-sm">
              <p>Labour: <span className="font-medium">${Number(selected.labor_total).toLocaleString('en-AU')}</span></p>
              <p>Materials: <span className="font-medium">${Number(selected.materials_total).toLocaleString('en-AU')}</span></p>
              <p>GST: <span className="font-medium">${Number(selected.gst_total).toLocaleString('en-AU')}</span></p>
              <p className="text-base font-semibold mt-1">
                Total: ${Number(selected.grand_total).toLocaleString('en-AU')}
              </p>
            </div>

            {selected.notes && (
              <p className="text-sm text-muted-foreground mt-4">{selected.notes}</p>
            )}
          </div>
        </div>
      </TabShell>
    )
  }

  // List view
  return (
    <TabShell>
      <div className="mt-4 space-y-2">
        {quotes.map((q) => {
          const badge = statusBadge(q.status)
          return (
            <button
              key={q.id}
              onClick={() => setSelected(q)}
              className="w-full flex items-center justify-between rounded-lg border border-border/50 bg-card/50 p-4 hover:bg-accent/50 transition-colors text-left bb-card-hover"
            >
              <div>
                <p className="font-medium text-sm">{q.contact?.name ?? 'Unknown Customer'}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(q.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium">${Number(q.grand_total).toLocaleString('en-AU')}</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${badge.cls}`}>
                  {badge.label}
                </span>
              </div>
            </button>
          )
        })}
      </div>
    </TabShell>
  )
}

export default React.memo(QuotesTab)
