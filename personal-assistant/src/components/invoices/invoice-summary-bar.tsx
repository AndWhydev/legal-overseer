'use client'

import { Card, CardContent } from '@/components/ui/card'

interface InvoiceSummaryBarProps {
  totalOutstanding: number
  overdueCount: number
  overdueAmount: number
  dueThisWeekCount: number
  dueThisWeekAmount: number
  paidThisMonthCount: number
  paidThisMonthAmount: number
  currency?: string
}

function fmt(n: number, c: string): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: c,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n)
}

export function InvoiceSummaryBar({
  totalOutstanding,
  overdueCount,
  overdueAmount,
  dueThisWeekCount,
  dueThisWeekAmount,
  paidThisMonthCount,
  paidThisMonthAmount,
  currency = 'AUD',
}: InvoiceSummaryBarProps) {
  const metrics = [
    { label: 'Outstanding', value: fmt(totalOutstanding, currency), sub: null as string | null, accent: null as string | null },
    { label: 'Overdue', value: fmt(overdueAmount, currency), sub: overdueCount > 0 ? `${overdueCount} invoice${overdueCount !== 1 ? 's' : ''}` : null, accent: overdueCount > 0 ? 'text-destructive' : null },
    { label: 'Due Soon', value: fmt(dueThisWeekAmount, currency), sub: dueThisWeekCount > 0 ? `${dueThisWeekCount} invoice${dueThisWeekCount !== 1 ? 's' : ''}` : null, accent: dueThisWeekCount > 0 ? 'text-amber-500' : null },
    { label: 'Paid This Month', value: fmt(paidThisMonthAmount, currency), sub: paidThisMonthCount > 0 ? `${paidThisMonthCount} invoice${paidThisMonthCount !== 1 ? 's' : ''}` : null, accent: null },
  ]

  const draftAmount = Math.max(0, totalOutstanding - overdueAmount - dueThisWeekAmount)
  const barTotal = overdueAmount + dueThisWeekAmount + draftAmount

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {metrics.map((m, i) => (
        <Card key={m.label} className="py-4">
          <CardContent className="flex flex-col gap-1 px-5">
            <span className="text-xs font-medium tracking-wide text-muted-foreground">
              {m.label}
            </span>
            <span className={`text-lg font-semibold tabular-nums leading-tight ${m.accent || 'text-foreground'}`}>
              {m.value}
            </span>
            {m.sub && (
              <span className="text-xs text-muted-foreground">{m.sub}</span>
            )}
            {i === 0 && barTotal > 0 && (
              <div className="mt-1 flex h-1 gap-0.5 overflow-hidden rounded-full">
                {overdueAmount > 0 && (
                  <div
                    className="rounded-full bg-destructive"
                    style={{ flex: overdueAmount / barTotal }}
                  />
                )}
                {dueThisWeekAmount > 0 && (
                  <div
                    className="rounded-full bg-amber-500"
                    style={{ flex: dueThisWeekAmount / barTotal }}
                  />
                )}
                {draftAmount > 0 && (
                  <div
                    className="rounded-full bg-muted"
                    style={{ flex: draftAmount / barTotal }}
                  />
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
