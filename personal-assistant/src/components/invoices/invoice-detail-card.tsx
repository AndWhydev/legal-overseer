'use client'

import { IconX } from '@tabler/icons-react'
import type { InvoiceRow } from './invoice-list'

interface InvoiceDetailCardProps {
  invoice: InvoiceRow
  onClose: () => void
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  sent: 'Sent',
  viewed: 'Viewed',
  overdue: 'Overdue',
  paid: 'Paid',
  cancelled: 'Cancelled',
}

function formatMoney(total: number, currency: string): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: currency || 'AUD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(total)
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return 'No date'
  try {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-AU', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return dateStr
  }
}

export function InvoiceDetailCard({ invoice, onClose }: InvoiceDetailCardProps) {
  const amount = Number(invoice.total ?? 0)

  return (
    <div className="bb-invoices-detail-overlay" onClick={onClose}>
      <div className="bb-invoices-detail" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="bb-invoices-detail__header">
          <div>
            <div className="bb-invoices-detail__title">Invoice Details</div>
            <div className="bb-invoices-detail__subtitle">{invoice.invoice_number}</div>
          </div>
          <button type="button" onClick={onClose} className="bb-invoices-detail__close">
            <IconX size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="bb-invoices-detail__body">
          {/* Status + Number */}
          <div className="bb-invoices-detail__row">
            <span className="bb-invoices-row__status" data-status={invoice.status}>
              {STATUS_LABEL[invoice.status]}
            </span>
          </div>

          {/* Client */}
          <div className="bb-invoices-detail__metric" style={{ gridColumn: '1 / -1' }}>
            <div className="bb-invoices-detail__metric-label">Client</div>
            <div className="bb-invoices-detail__metric-value" style={{ fontSize: 14, letterSpacing: 0 }}>
              {invoice.client_name || invoice.client_contact_id || 'Unknown client'}
            </div>
          </div>

          {/* Metrics */}
          <div className="bb-invoices-detail__metrics">
            <div className="bb-invoices-detail__metric">
              <div className="bb-invoices-detail__metric-label">Total</div>
              <div className="bb-invoices-detail__metric-value">
                {formatMoney(amount, invoice.currency || 'AUD')}
              </div>
            </div>
            <div className="bb-invoices-detail__metric">
              <div className="bb-invoices-detail__metric-label">Due</div>
              <div className="bb-invoices-detail__metric-value">
                {formatDate(invoice.due_date)}
              </div>
            </div>
          </div>

          {/* Created */}
          {invoice.created_at && (
            <div className="bb-invoices-detail__metric">
              <div className="bb-invoices-detail__metric-label">Created</div>
              <div className="bb-invoices-detail__metric-value" style={{ fontSize: 14 }}>
                {formatDate(invoice.created_at)}
              </div>
            </div>
          )}

          {/* Status alerts */}
          {invoice.status === 'overdue' && (
            <div className="bb-invoices-detail__alert" data-type="overdue">
              This invoice is overdue. Contact the client for payment.
            </div>
          )}
          {invoice.status === 'paid' && (
            <div className="bb-invoices-detail__alert" data-type="paid">
              This invoice has been paid.
            </div>
          )}
          {invoice.status === 'cancelled' && (
            <div className="bb-invoices-detail__alert" data-type="cancelled">
              This invoice has been cancelled.
            </div>
          )}

          {/* ID */}
          <div className="bb-invoices-detail__id">ID: {invoice.id}</div>
        </div>
      </div>
    </div>
  )
}
