'use client'

import { useState } from 'react'
import type { PortalInvoice } from '@/lib/portal/types'

interface PortalInvoicesViewProps {
  invoices: PortalInvoice[]
  primaryColor: string
}

type StatusFilter = 'all' | 'sent' | 'viewed' | 'overdue' | 'paid'

const STATUS_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
  sent: { bg: '#EFF6FF', text: '#2563EB', label: 'Sent' },
  viewed: { bg: '#F0FDF4', text: '#16A34A', label: 'Viewed' },
  overdue: { bg: '#FEF2F2', text: '#DC2626', label: 'Overdue' },
  paid: { bg: '#F3F4F6', text: '#059669', label: 'Paid' },
}

export function PortalInvoicesView({ invoices, primaryColor }: PortalInvoicesViewProps) {
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const filtered = filter === 'all' ? invoices : invoices.filter(inv => inv.status === filter)

  const totalOutstanding = invoices
    .filter(inv => ['sent', 'viewed', 'overdue'].includes(inv.status))
    .reduce((sum, inv) => sum + inv.total, 0)

  const totalPaid = invoices
    .filter(inv => inv.status === 'paid')
    .reduce((sum, inv) => sum + inv.total, 0)

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 600, color: '#111827', margin: '0 0 24px', letterSpacing: '-0.02em' }}>
        Invoices
      </h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4" style={{ marginBottom: 24 }}>
        <div style={{ ...cardStyle, padding: 20 }}>
          <p style={{ fontSize: 13, color: '#6B7280', margin: '0 0 4px' }}>Outstanding</p>
          <p style={{ fontSize: 24, fontWeight: 700, color: '#DC2626', margin: 0 }}>
            ${totalOutstanding.toLocaleString('en-AU', { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div style={{ ...cardStyle, padding: 20 }}>
          <p style={{ fontSize: 13, color: '#6B7280', margin: '0 0 4px' }}>Paid</p>
          <p style={{ fontSize: 24, fontWeight: 700, color: '#059669', margin: 0 }}>
            ${totalPaid.toLocaleString('en-AU', { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div style={{ ...cardStyle, padding: 20 }}>
          <p style={{ fontSize: 13, color: '#6B7280', margin: '0 0 4px' }}>Total Invoices</p>
          <p style={{ fontSize: 24, fontWeight: 700, color: '#111827', margin: 0 }}>{invoices.length}</p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2" style={{ marginBottom: 16, overflowX: 'auto' }}>
        {(['all', 'sent', 'viewed', 'overdue', 'paid'] as StatusFilter[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: filter === f ? 500 : 400,
              background: filter === f ? `${primaryColor}0D` : 'transparent',
              color: filter === f ? primaryColor : '#6B7280',
              border: filter === f ? `1px solid ${primaryColor}30` : '1px solid transparent',
              cursor: 'pointer',
              transition: 'all 150ms',
              whiteSpace: 'nowrap',
            }}
          >
            {f === 'all' ? 'All' : STATUS_CONFIG[f]?.label ?? f}
          </button>
        ))}
      </div>

      {/* Invoice List */}
      {filtered.length === 0 ? (
        <div style={{ ...cardStyle, padding: 48, textAlign: 'center' }}>
          <p style={{ fontSize: 15, color: '#9CA3AF' }}>No invoices found</p>
        </div>
      ) : (
        <div style={cardStyle}>
          {/* Header */}
          <div
            className="hidden md:grid"
            style={{
              gridTemplateColumns: '1fr 100px 120px 120px 100px',
              padding: '12px 20px',
              borderBottom: '1px solid #E5E7EB',
              fontSize: 12,
              fontWeight: 600,
              color: '#6B7280',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            <div>Invoice</div>
            <div>Status</div>
            <div style={{ textAlign: 'right' }}>Amount</div>
            <div style={{ textAlign: 'right' }}>Due Date</div>
            <div style={{ textAlign: 'right' }}>Actions</div>
          </div>

          {filtered.map((inv, i) => {
            const sc = STATUS_CONFIG[inv.status] ?? STATUS_CONFIG.sent
            const isExpanded = expandedId === inv.id

            return (
              <div key={inv.id}>
                <button
                  onClick={() => setExpandedId(isExpanded ? null : inv.id)}
                  className="w-full"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr',
                    padding: '16px 20px',
                    borderBottom: i < filtered.length - 1 ? '1px solid #F3F4F6' : 'none',
                    background: isExpanded ? '#FAFAFA' : 'transparent',
                    cursor: 'pointer',
                    border: 'none',
                    textAlign: 'left',
                    transition: 'background 150ms',
                    width: '100%',
                  }}
                >
                  <div
                    className="grid items-center gap-2"
                    style={{ gridTemplateColumns: '1fr auto' }}
                  >
                    <div className="md:grid md:items-center" style={{ gridTemplateColumns: '1fr 100px 120px 120px 100px' }}>
                      <div>
                        <span style={{ fontSize: 15, fontWeight: 500, color: '#111827' }}>
                          {inv.invoice_number}
                        </span>
                        {inv.issued_date && (
                          <span className="md:hidden" style={{ fontSize: 13, color: '#9CA3AF', marginLeft: 8 }}>
                            {new Date(inv.issued_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                          </span>
                        )}
                      </div>
                      <div>
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 500,
                            padding: '3px 8px',
                            borderRadius: 6,
                            background: sc.bg,
                            color: sc.text,
                          }}
                        >
                          {sc.label}
                        </span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: 15, fontWeight: 600, color: '#111827' }}>
                          ${inv.total.toLocaleString('en-AU', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: 14, color: '#6B7280' }}>
                          {inv.due_date
                            ? new Date(inv.due_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
                            : '-'}
                        </span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        {inv.pdf_url && (
                          <a
                            href={inv.pdf_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            style={{
                              fontSize: 13,
                              color: primaryColor,
                              textDecoration: 'none',
                              fontWeight: 500,
                            }}
                          >
                            Download
                          </a>
                        )}
                      </div>
                    </div>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#9CA3AF"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="md:hidden"
                      style={{
                        transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 200ms',
                      }}
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div style={{ padding: '0 20px 20px', background: '#FAFAFA' }}>
                    <div style={{ ...cardStyle, padding: 16, background: '#FFFFFF' }}>
                      <div className="grid grid-cols-2 gap-4" style={{ marginBottom: 16 }}>
                        <div>
                          <p style={{ fontSize: 12, color: '#6B7280', margin: '0 0 2px' }}>Invoice Number</p>
                          <p style={{ fontSize: 14, fontWeight: 500, color: '#111827', margin: 0 }}>{inv.invoice_number}</p>
                        </div>
                        <div>
                          <p style={{ fontSize: 12, color: '#6B7280', margin: '0 0 2px' }}>Currency</p>
                          <p style={{ fontSize: 14, fontWeight: 500, color: '#111827', margin: 0 }}>{inv.currency}</p>
                        </div>
                        <div>
                          <p style={{ fontSize: 12, color: '#6B7280', margin: '0 0 2px' }}>Issued</p>
                          <p style={{ fontSize: 14, color: '#111827', margin: 0 }}>
                            {inv.issued_date ? new Date(inv.issued_date).toLocaleDateString('en-AU') : '-'}
                          </p>
                        </div>
                        <div>
                          <p style={{ fontSize: 12, color: '#6B7280', margin: '0 0 2px' }}>Due</p>
                          <p style={{ fontSize: 14, color: '#111827', margin: 0 }}>
                            {inv.due_date ? new Date(inv.due_date).toLocaleDateString('en-AU') : '-'}
                          </p>
                        </div>
                        {inv.paid_date && (
                          <div>
                            <p style={{ fontSize: 12, color: '#6B7280', margin: '0 0 2px' }}>Paid</p>
                            <p style={{ fontSize: 14, color: '#059669', margin: 0 }}>
                              {new Date(inv.paid_date).toLocaleDateString('en-AU')}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Line Items */}
                      {Array.isArray(inv.items) && inv.items.length > 0 && (
                        <div style={{ borderTop: '1px solid #E5E7EB', paddingTop: 16 }}>
                          <p style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Line Items
                          </p>
                          {(inv.items as { description: string; quantity: number; unit_price: number; total: number }[]).map((item, idx) => (
                            <div key={idx} className="flex justify-between" style={{ padding: '6px 0', borderBottom: '1px solid #F9FAFB' }}>
                              <span style={{ fontSize: 14, color: '#374151' }}>
                                {item.description} <span style={{ color: '#9CA3AF' }}>x{item.quantity}</span>
                              </span>
                              <span style={{ fontSize: 14, fontWeight: 500, color: '#111827' }}>
                                ${(item.total ?? item.quantity * item.unit_price).toLocaleString('en-AU', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                          ))}

                          <div style={{ borderTop: '1px solid #E5E7EB', marginTop: 8, paddingTop: 8 }}>
                            <div className="flex justify-between" style={{ marginBottom: 4 }}>
                              <span style={{ fontSize: 13, color: '#6B7280' }}>Subtotal</span>
                              <span style={{ fontSize: 14, color: '#374151' }}>${inv.subtotal.toLocaleString('en-AU', { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div className="flex justify-between" style={{ marginBottom: 4 }}>
                              <span style={{ fontSize: 13, color: '#6B7280' }}>Tax (GST)</span>
                              <span style={{ fontSize: 14, color: '#374151' }}>${inv.tax.toLocaleString('en-AU', { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div className="flex justify-between" style={{ marginTop: 8 }}>
                              <span style={{ fontSize: 15, fontWeight: 600, color: '#111827' }}>Total</span>
                              <span style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>
                                ${inv.total.toLocaleString('en-AU', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      {inv.pdf_url && (
                        <div style={{ marginTop: 16 }}>
                          <a
                            href={inv.pdf_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2"
                            style={{
                              padding: '10px 20px',
                              borderRadius: 8,
                              background: primaryColor,
                              color: '#FFFFFF',
                              fontSize: 14,
                              fontWeight: 500,
                              textDecoration: 'none',
                              transition: 'opacity 150ms',
                            }}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                              <polyline points="7 10 12 15 17 10" />
                              <line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                            Download PDF
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const cardStyle: React.CSSProperties = {
  background: '#FFFFFF',
  borderRadius: 12,
  border: '1px solid #E5E7EB',
  overflow: 'hidden',
}
