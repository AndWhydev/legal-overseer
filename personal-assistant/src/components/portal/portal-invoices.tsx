'use client'

import type { PortalInvoice } from '@/lib/portal/types'

interface PortalInvoicesProps {
  invoices: PortalInvoice[]
  primary: string
}

const STATUS_CONFIG: Record<string, { bg: string; color: string; label: string }> = {
  draft: { bg: '#f3f4f6', color: '#6b7280', label: 'Draft' },
  sent: { bg: '#eff6ff', color: '#2563eb', label: 'Sent' },
  viewed: { bg: '#fef3c7', color: '#d97706', label: 'Viewed' },
  overdue: { bg: '#fef2f2', color: '#dc2626', label: 'Overdue' },
  paid: { bg: '#ecfdf5', color: '#059669', label: 'Paid' },
  cancelled: { bg: '#f3f4f6', color: '#9ca3af', label: 'Cancelled' },
}

export function PortalInvoices({ invoices, primary }: PortalInvoicesProps) {
  if (invoices.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '64px 24px', color: '#9ca3af' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>&#128179;</div>
        <div style={{ fontSize: 16, fontWeight: 500 }}>No invoices yet</div>
        <div style={{ fontSize: 14, marginTop: 4 }}>Your invoices will appear here.</div>
      </div>
    )
  }

  const totalPaid = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.total), 0)
  const totalPending = invoices.filter(i => ['sent', 'viewed'].includes(i.status)).reduce((s, i) => s + Number(i.total), 0)
  const totalOverdue = invoices.filter(i => i.status === 'overdue').reduce((s, i) => s + Number(i.total), 0)

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 20, color: '#1a1a2e' }}>Invoices</h2>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        <SummaryCard label="Paid" amount={totalPaid} color="#059669" />
        <SummaryCard label="Pending" amount={totalPending} color={primary} />
        {totalOverdue > 0 && <SummaryCard label="Overdue" amount={totalOverdue} color="#dc2626" />}
      </div>

      {/* Table */}
      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: 12,
        border: '1px solid #e5e7eb',
        overflow: 'hidden',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
              <Th>Invoice</Th>
              <Th>Status</Th>
              <Th>Issued</Th>
              <Th>Due</Th>
              <Th align="right">Amount</Th>
            </tr>
          </thead>
          <tbody>
            {invoices.map(invoice => {
              const statusInfo = STATUS_CONFIG[invoice.status] || STATUS_CONFIG.draft
              return (
                <tr key={invoice.id} style={{ borderBottom: '1px solid #f9fafb' }}>
                  <td style={{ padding: '14px 20px', fontSize: 14, fontWeight: 500, color: '#1a1a2e' }}>
                    {invoice.invoice_number}
                  </td>
                  <td style={{ padding: '14px 20px' }}>
                    <span style={{
                      fontSize: 12,
                      padding: '3px 10px',
                      borderRadius: 6,
                      backgroundColor: statusInfo.bg,
                      color: statusInfo.color,
                      fontWeight: 500,
                    }}>
                      {statusInfo.label}
                    </span>
                  </td>
                  <td style={{ padding: '14px 20px', fontSize: 13, color: '#6b7280' }}>
                    {invoice.issued_date ? new Date(invoice.issued_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : '-'}
                  </td>
                  <td style={{ padding: '14px 20px', fontSize: 13, color: invoice.status === 'overdue' ? '#dc2626' : '#6b7280' }}>
                    {invoice.due_date ? new Date(invoice.due_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : '-'}
                  </td>
                  <td style={{ padding: '14px 20px', fontSize: 14, fontWeight: 600, color: '#1a1a2e', textAlign: 'right' }}>
                    ${Number(invoice.total).toLocaleString('en-AU', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SummaryCard({ label, amount, color }: { label: string; amount: number; color: string }) {
  return (
    <div style={{
      backgroundColor: '#ffffff',
      borderRadius: 10,
      border: '1px solid #e5e7eb',
      padding: '16px 20px',
    }}>
      <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>
        ${amount.toLocaleString('en-AU', { minimumFractionDigits: 2 })}
      </div>
    </div>
  )
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return (
    <th style={{
      padding: '12px 20px',
      fontSize: 12,
      fontWeight: 500,
      color: '#9ca3af',
      textAlign: align || 'left',
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
    }}>
      {children}
    </th>
  )
}
