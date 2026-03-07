'use client'

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

const card: React.CSSProperties = {
  padding: '14px 16px',
  borderRadius: 12,
  background: 'rgba(15, 20, 30, 0.45)',
  backdropFilter: 'blur(24px) saturate(1.3)',
  WebkitBackdropFilter: 'blur(24px) saturate(1.3)',
  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06)',
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 4,
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
    { label: 'Overdue', value: fmt(overdueAmount, currency), sub: overdueCount > 0 ? `${overdueCount} invoice${overdueCount !== 1 ? 's' : ''}` : null, accent: overdueCount > 0 ? '#EF4444' : null },
    { label: 'Due Soon', value: fmt(dueThisWeekAmount, currency), sub: dueThisWeekCount > 0 ? `${dueThisWeekCount} invoice${dueThisWeekCount !== 1 ? 's' : ''}` : null, accent: dueThisWeekCount > 0 ? '#F59E0B' : null },
    { label: 'Paid This Month', value: fmt(paidThisMonthAmount, currency), sub: paidThisMonthCount > 0 ? `${paidThisMonthCount} invoice${paidThisMonthCount !== 1 ? 's' : ''}` : null, accent: null },
  ]

  const draftAmount = Math.max(0, totalOutstanding - overdueAmount - dueThisWeekAmount)
  const barTotal = overdueAmount + dueThisWeekAmount + draftAmount

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {metrics.map((m, i) => (
        <div key={m.label} style={card}>
          <span style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 500, letterSpacing: '0.02em' }}>
            {m.label}
          </span>
          <span style={{
            fontSize: 24,
            fontWeight: 700,
            color: m.accent || 'var(--text-primary)',
            fontFamily: 'var(--font-mono)',
            letterSpacing: '-0.02em',
            lineHeight: 1.1,
          }}>
            {m.value}
          </span>
          {m.sub && (
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{m.sub}</span>
          )}
          {i === 0 && barTotal > 0 && (
            <div style={{ display: 'flex', height: 3, borderRadius: 99, overflow: 'hidden', marginTop: 2, gap: 1 }}>
              {overdueAmount > 0 && <div style={{ flex: overdueAmount / barTotal, background: '#EF4444', borderRadius: 99 }} />}
              {dueThisWeekAmount > 0 && <div style={{ flex: dueThisWeekAmount / barTotal, background: '#F59E0B', borderRadius: 99 }} />}
              {draftAmount > 0 && <div style={{ flex: draftAmount / barTotal, background: 'rgba(255, 255, 255, 0.08)', borderRadius: 99 }} />}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
