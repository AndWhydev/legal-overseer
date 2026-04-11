'use client'

import React, { useEffect, useState } from 'react'
import { TabShell } from '@/components/ui/tab-shell'
import { createClient } from '@/lib/supabase/client'
import { Skeleton } from '@/components/ui/skeleton'
import { TabSkeleton } from '@/components/dashboard/tabs/tab-skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { IconArrowLeft, IconClipboardList } from '@tabler/icons-react'

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

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline'

function statusBadge(s: string): { label: string; variant: BadgeVariant } {
  switch (s) {
    case 'draft':    return { label: 'Draft',    variant: 'outline' }
    case 'sent':     return { label: 'Sent',     variant: 'default' }
    case 'accepted': return { label: 'Accepted', variant: 'secondary' }
    case 'declined': return { label: 'Declined', variant: 'destructive' }
    case 'expired':  return { label: 'Expired',  variant: 'outline' }
    default:         return { label: s,          variant: 'outline' }
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
    return <TabSkeleton variant="table" />
  }

  if (quotes.length === 0) {
    return (
      <TabShell>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <IconClipboardList className="size-10 text-muted-foreground mb-3" />
          <h3 className="text-lg font-medium">No quotes yet</h3>
          <p className="text-base text-muted-foreground mt-1">
            Quotes are drafted automatically from enquiries or you can create them manually.
          </p>
        </div>
      </TabShell>
    )
  }

  // Detail view
  if (selected) {
    const { label, variant } = statusBadge(selected.status)
    return (
      <TabShell>
        <div className="mt-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelected(null)}
            className="mb-4 gap-1.5 text-primary hover:text-primary"
          >
            <IconArrowLeft className="size-4" />
            Back to list
          </Button>

          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-medium">
                    {selected.contact?.name ?? 'Unknown Customer'}
                  </h3>
                  {selected.lead?.title && (
                    <p className="text-base text-muted-foreground">{selected.lead.title}</p>
                  )}
                </div>
                <Badge variant={variant}>{label}</Badge>
              </div>
            </CardHeader>

            <CardContent>
              {/* Line items */}
              <table className="w-full text-base mb-4">
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
                    <tr key={i} className="border-b border-border">
                      <td className="py-2">{item.description}</td>
                      <td className="py-2 text-right">{item.qty}</td>
                      <td className="py-2 text-right">${Number(item.unit).toLocaleString('en-AU')}</td>
                      <td className="py-2 text-right">${Number(item.total).toLocaleString('en-AU')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Totals */}
              <div className="flex flex-col items-end gap-1 text-base">
                <p>Labour: <span className="font-medium">${Number(selected.labor_total).toLocaleString('en-AU')}</span></p>
                <p>Materials: <span className="font-medium">${Number(selected.materials_total).toLocaleString('en-AU')}</span></p>
                <p>GST: <span className="font-medium">${Number(selected.gst_total).toLocaleString('en-AU')}</span></p>
                <p className="text-base font-medium mt-1">
                  Total: ${Number(selected.grand_total).toLocaleString('en-AU')}
                </p>
              </div>

              {selected.notes && (
                <p className="text-base text-muted-foreground mt-4">{selected.notes}</p>
              )}
            </CardContent>
          </Card>
        </div>
      </TabShell>
    )
  }

  // List view
  return (
    <TabShell>
      <div className="mt-4 space-y-2">
        {quotes.map((q) => {
          const { label, variant } = statusBadge(q.status)
          return (
            <button
              key={q.id}
              onClick={() => setSelected(q)}
              className="w-full flex items-center justify-between rounded-lg border border-border bg-card p-4 text-left hover:bg-muted transition-colors"
            >
              <div>
                <p className="font-medium text-base">{q.contact?.name ?? 'Unknown Customer'}</p>
                <p className="text-base text-muted-foreground">
                  {new Date(q.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-base font-medium">${Number(q.grand_total).toLocaleString('en-AU')}</span>
                <Badge variant={variant}>{label}</Badge>
              </div>
            </button>
          )
        })}
      </div>
    </TabShell>
  )
}

export default React.memo(QuotesTab)
