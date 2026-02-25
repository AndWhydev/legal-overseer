'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { SkeletonTable } from '@/components/ui/skeleton'

type InvoiceStatus = 'draft' | 'sent' | 'viewed' | 'overdue' | 'paid' | 'cancelled'

interface InvoiceRow {
  id: string
  invoice_number: string
  client_contact_id: string | null
  client_name?: string | null
  total: number
  currency: string
  status: InvoiceStatus
  due_date: string | null
  created_at?: string
}

const FILTERS: Array<{ key: 'all' | InvoiceStatus; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'sent', label: 'Sent' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'paid', label: 'Paid' },
]

const STATUS_STYLES: Record<InvoiceStatus, string> = {
  draft: 'border-slate-500/30 bg-slate-500/15 text-slate-200',
  sent: 'border-sky-500/30 bg-sky-500/15 text-sky-300',
  viewed: 'border-fuchsia-500/30 bg-fuchsia-500/15 text-fuchsia-300',
  overdue: 'border-red-500/30 bg-red-500/15 text-red-300',
  paid: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300',
  cancelled: 'border-zinc-500/30 bg-zinc-500/10 text-zinc-400',
}

function formatMoney(total: number, currency: string): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: currency || 'AUD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(total)
}

function formatDueDate(value: string | null): string {
  if (!value) return 'No due date'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toISOString().slice(0, 10)
}

function canSend(status: InvoiceStatus): boolean {
  return status === 'draft'
}

function canMarkPaid(status: InvoiceStatus): boolean {
  return status === 'sent' || status === 'viewed' || status === 'overdue'
}

function canCancel(status: InvoiceStatus): boolean {
  return status === 'draft' || status === 'sent' || status === 'viewed' || status === 'overdue'
}

export function InvoiceList() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState<'all' | InvoiceStatus>('all')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyInvoiceId, setBusyInvoiceId] = useState<string | null>(null)

  const loadInvoices = useCallback(async (status?: InvoiceStatus) => {
    const query = status ? `?status=${encodeURIComponent(status)}` : ''
    const response = await fetch(`/api/agent/invoices${query}`, { cache: 'no-store' })
    const payload = (await response.json().catch(() => ({}))) as { invoices?: InvoiceRow[]; error?: string }

    if (!response.ok) {
      throw new Error(payload.error ?? 'Failed to load invoices')
    }

    setInvoices(payload.invoices ?? [])
  }, [])

  useEffect(() => {
    let mounted = true

    async function bootstrap() {
      try {
        const status = activeFilter === 'all' ? undefined : activeFilter
        await loadInvoices(status)
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : 'Failed to load invoices')
      } finally {
        if (mounted) setIsLoading(false)
      }
    }

    void bootstrap()

    return () => {
      mounted = false
    }
  }, [activeFilter, loadInvoices])

  const visibleInvoices = useMemo(() => {
    if (activeFilter === 'all') return invoices
    return invoices.filter((invoice) => invoice.status === activeFilter)
  }, [activeFilter, invoices])

  async function mutateInvoiceStatus(invoiceId: string, status: InvoiceStatus) {
    setBusyInvoiceId(invoiceId)
    setError(null)
    setMessage(null)

    try {
      const response = await fetch(`/api/agent/invoices/${encodeURIComponent(invoiceId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })

      const payload = (await response.json().catch(() => ({}))) as {
        invoice?: InvoiceRow
        queued?: boolean
        error?: string
      }

      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to update invoice')
      }

      if (payload.queued) {
        setMessage('Invoice send queued for approval.')
      } else if (status === 'paid') {
        setMessage('Invoice marked as paid.')
      } else if (status === 'cancelled') {
        setMessage('Invoice cancelled.')
      } else {
        setMessage('Invoice updated.')
      }

      const statusFilter = activeFilter === 'all' ? undefined : activeFilter
      await loadInvoices(statusFilter)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update invoice')
    } finally {
      setBusyInvoiceId(null)
    }
  }

  if (isLoading) {
    return <SkeletonTable rows={5} cols={6} />
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((filter) => (
          <button
            key={filter.key}
            type="button"
            onClick={() => setActiveFilter(filter.key)}
            className={[
              'rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
              activeFilter === filter.key
                ? 'border-sky-500/40 bg-sky-500/20 text-sky-200'
                : 'border-border bg-background text-muted-foreground hover:bg-secondary',
            ].join(' ')}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {message ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-400">
          {message}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-background/60 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Invoice</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Due</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleInvoices.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-muted-foreground" colSpan={6}>
                    No invoices found.
                  </td>
                </tr>
              ) : (
                visibleInvoices.map((invoice) => (
                  <tr key={invoice.id} className="border-t border-border/70">
                    <td className="px-4 py-3 font-medium text-foreground">{invoice.invoice_number}</td>
                    <td className={[
                      'px-4 py-3 text-muted-foreground',
                      invoice.status === 'cancelled' ? 'line-through opacity-80' : '',
                    ].join(' ')}>
                      {invoice.client_name || invoice.client_contact_id || 'Unknown client'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{formatMoney(Number(invoice.total ?? 0), invoice.currency || 'AUD')}</td>
                    <td className="px-4 py-3">
                      <span className={[
                        'inline-flex rounded-full border px-2 py-1 text-xs font-medium',
                        STATUS_STYLES[invoice.status],
                        invoice.status === 'cancelled' ? 'line-through' : '',
                      ].join(' ')}>
                        {invoice.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDueDate(invoice.due_date)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {canSend(invoice.status) ? (
                          <button
                            type="button"
                            disabled={busyInvoiceId === invoice.id}
                            onClick={() => void mutateInvoiceStatus(invoice.id, 'sent')}
                            className="rounded-md border border-sky-500/40 px-2 py-1 text-xs font-medium text-sky-200 hover:bg-sky-500/20 disabled:opacity-60"
                          >
                            Send
                          </button>
                        ) : null}

                        {canMarkPaid(invoice.status) ? (
                          <button
                            type="button"
                            disabled={busyInvoiceId === invoice.id}
                            onClick={() => void mutateInvoiceStatus(invoice.id, 'paid')}
                            className="rounded-md border border-emerald-500/40 px-2 py-1 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-60"
                          >
                            Mark Paid
                          </button>
                        ) : null}

                        {canCancel(invoice.status) ? (
                          <button
                            type="button"
                            disabled={busyInvoiceId === invoice.id}
                            onClick={() => void mutateInvoiceStatus(invoice.id, 'cancelled')}
                            className="rounded-md border border-zinc-500/40 px-2 py-1 text-xs font-medium text-zinc-300 hover:bg-zinc-500/20 disabled:opacity-60"
                          >
                            Cancel
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
