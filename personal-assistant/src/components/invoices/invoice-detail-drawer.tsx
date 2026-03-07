'use client'

import { useEffect } from 'react'
import { X, Send, CheckCircle2, Ban, FileText } from 'lucide-react'
import { StatusPill, type StatusVariant } from '@/components/ui/status-pill'

// ─── Types ──────────────────────────────────────────────────────────────────

type InvoiceStatus = 'draft' | 'sent' | 'viewed' | 'overdue' | 'paid' | 'cancelled'

interface LineItem {
  description: string
  quantity: number
  unit_price: number
  total: number
}

interface InvoiceData {
  id: string
  invoice_number: string
  client_name?: string | null
  client_contact_id: string | null
  total: number
  currency: string
  status: InvoiceStatus
  due_date: string | null
  issued_date?: string | null
  paid_date?: string | null
  created_at?: string
  line_items?: LineItem[]
}

interface InvoiceDetailDrawerProps {
  invoice: InvoiceData | null
  onClose: () => void
  onAction: (invoiceId: string, status: InvoiceStatus) => void
  busy: boolean
}

// ─── Constants ──────────────────────────────────────────────────────────────

const SNAP = 'cubic-bezier(0.2, 0.9, 0.3, 1)'

const STATUS_VARIANT: Record<InvoiceStatus, StatusVariant> = {
  draft: 'neutral',
  sent: 'info',
  viewed: 'purple',
  overdue: 'error',
  paid: 'success',
  cancelled: 'neutral',
}

const PROGRESS_STEPS = ['Draft', 'Sent', 'Paid'] as const

const glassCard: React.CSSProperties = {
  borderRadius: 12,
  background: 'rgba(15, 20, 30, 0.45)',
  backdropFilter: 'blur(24px) saturate(1.3)',
  WebkitBackdropFilter: 'blur(24px) saturate(1.3)',
  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06)',
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getProgressIndex(status: InvoiceStatus): number {
  if (status === 'paid') return 2
  if (status === 'sent' || status === 'viewed' || status === 'overdue') return 1
  return 0
}

function formatMoney(total: number, currency: string): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: currency || 'AUD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(total)
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function getDueColor(dueDate: string | null, status: InvoiceStatus): string {
  if (status === 'paid' || status === 'cancelled' || status === 'draft') return 'var(--text-secondary)'
  if (!dueDate) return 'var(--text-secondary)'
  const days = Math.ceil((new Date(dueDate).getTime() - Date.now()) / 86_400_000)
  if (days < 0) return '#EF4444'
  if (days <= 7) return '#F59E0B'
  return 'var(--text-secondary)'
}

function canSend(s: InvoiceStatus) { return s === 'draft' }
function canMarkPaid(s: InvoiceStatus) { return s === 'sent' || s === 'viewed' || s === 'overdue' }
function canCancel(s: InvoiceStatus) { return s !== 'paid' && s !== 'cancelled' }

// ─── Component ──────────────────────────────────────────────────────────────

export function InvoiceDetailDrawer({ invoice, onClose, onAction, busy }: InvoiceDetailDrawerProps) {
  useEffect(() => {
    if (!invoice) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [invoice, onClose])

  if (!invoice) return null

  const progressIdx = getProgressIndex(invoice.status)
  const dueColor = getDueColor(invoice.due_date, invoice.status)

  return (
    <>
      <style>{`
        @keyframes bb-inv-drawer { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @keyframes bb-inv-backdrop { from { opacity: 0; } to { opacity: 1; } }
      `}</style>

      {/* Backdrop */}
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 40,
          background: 'rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(4px)',
          animation: `bb-inv-backdrop 120ms ease both`,
        }}
      />

      {/* Drawer */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Invoice details"
        style={{
          position: 'fixed',
          right: 0,
          top: 0,
          zIndex: 50,
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          width: '100%',
          maxWidth: 420,
          overflowY: 'auto',
          background: 'var(--bg-primary, #0a0f1a)',
          boxShadow: '-8px 0 32px rgba(0, 0, 0, 0.3)',
          animation: `bb-inv-drawer 200ms ${SNAP} both`,
        }}
      >
        {/* Header */}
        <div style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          background: 'var(--bg-primary, #0a0f1a)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: 'rgba(255, 90, 31, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--bb-orange)',
            }}>
              <FileText size={18} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
                {invoice.invoice_number}
              </div>
              <div style={{ marginTop: 3 }}>
                <StatusPill
                  variant={STATUS_VARIANT[invoice.status]}
                  label={invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                  dot
                />
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close drawer"
            style={{
              padding: 6,
              borderRadius: 8,
              cursor: 'pointer',
              background: 'transparent',
              border: 'none',
              color: 'var(--text-dim)',
              transition: 'all 80ms ease',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'
              e.currentTarget.style.color = 'var(--text-secondary)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = 'var(--text-dim)'
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ flex: 1, padding: 20, display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Progress bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {PROGRESS_STEPS.map((step, i) => (
              <div key={step} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <div style={{
                  height: 4,
                  width: '100%',
                  borderRadius: 99,
                  background: i <= progressIdx
                    ? invoice.status === 'cancelled' ? '#71717a' : '#22C55E'
                    : 'rgba(255, 255, 255, 0.06)',
                  transition: 'background 300ms ease',
                }} />
                <span style={{
                  fontSize: 11,
                  fontWeight: 500,
                  color: i <= progressIdx ? 'var(--text-primary)' : 'var(--text-dim)',
                }}>
                  {step}
                </span>
              </div>
            ))}
          </div>

          {/* Amount hero */}
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{
              fontSize: 32,
              fontWeight: 700,
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)',
              letterSpacing: '-0.02em',
              lineHeight: 1,
            }}>
              {formatMoney(invoice.total, invoice.currency)}
            </div>
            <div style={{ fontSize: 13, color: dueColor, marginTop: 6, fontWeight: 500 }}>
              {invoice.status === 'paid'
                ? `Paid ${formatDate(invoice.paid_date)}`
                : invoice.due_date
                  ? `Due ${formatDate(invoice.due_date)}`
                  : 'No due date'}
            </div>
          </div>

          {/* Client */}
          {invoice.client_name && (
            <div style={{
              ...glassCard,
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}>
              <div style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'rgba(59, 130, 246, 0.1)',
                color: '#3B82F6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 14,
                fontWeight: 600,
              }}>
                {invoice.client_name.charAt(0).toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {invoice.client_name}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 1 }}>Client</div>
              </div>
            </div>
          )}

          {/* Dates */}
          {(invoice.issued_date || invoice.created_at) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {invoice.issued_date && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '0 4px' }}>
                  <span style={{ color: 'var(--text-dim)' }}>Issued</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{formatDate(invoice.issued_date)}</span>
                </div>
              )}
              {invoice.created_at && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '0 4px' }}>
                  <span style={{ color: 'var(--text-dim)' }}>Created</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{formatDate(invoice.created_at)}</span>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8 }}>
            {canSend(invoice.status) && (
              <button
                onClick={() => onAction(invoice.id, 'sent')}
                disabled={busy}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  padding: '12px 16px',
                  borderRadius: 10,
                  cursor: 'pointer',
                  background: 'rgba(56, 189, 248, 0.1)',
                  border: 'none',
                  color: '#7dd3fc',
                  fontSize: 14,
                  fontWeight: 600,
                  opacity: busy ? 0.5 : 1,
                  transition: 'all 80ms ease',
                }}
              >
                <Send size={15} /> Send
              </button>
            )}
            {canMarkPaid(invoice.status) && (
              <button
                onClick={() => onAction(invoice.id, 'paid')}
                disabled={busy}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  padding: '12px 16px',
                  borderRadius: 10,
                  cursor: 'pointer',
                  background: 'rgba(34, 197, 94, 0.1)',
                  border: 'none',
                  color: '#86efac',
                  fontSize: 14,
                  fontWeight: 600,
                  opacity: busy ? 0.5 : 1,
                  transition: 'all 80ms ease',
                }}
              >
                <CheckCircle2 size={15} /> Mark Paid
              </button>
            )}
            {canCancel(invoice.status) && (
              <button
                onClick={() => onAction(invoice.id, 'cancelled')}
                disabled={busy}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  padding: '12px 16px',
                  borderRadius: 10,
                  cursor: 'pointer',
                  background: 'transparent',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  color: 'var(--text-dim)',
                  fontSize: 14,
                  fontWeight: 500,
                  opacity: busy ? 0.5 : 1,
                  transition: 'all 80ms ease',
                }}
              >
                <Ban size={15} /> Cancel
              </button>
            )}
          </div>

          {/* Line Items */}
          {invoice.line_items && invoice.line_items.length > 0 && (
            <div>
              <div style={{
                fontSize: 11,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--text-dim)',
                marginBottom: 8,
                padding: '0 4px',
              }}>
                Line Items
              </div>
              <div style={{ ...glassCard, overflow: 'hidden' }}>
                {invoice.line_items.map((item, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 14px',
                      borderBottom: i < invoice.line_items!.length - 1
                        ? '1px solid rgba(255, 255, 255, 0.03)'
                        : 'none',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{item.description}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                        {item.quantity} x {formatMoney(item.unit_price, invoice.currency)}
                      </div>
                    </div>
                    <span style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      fontFamily: 'var(--font-mono)',
                    }}>
                      {formatMoney(item.total, invoice.currency)}
                    </span>
                  </div>
                ))}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 14px',
                  borderTop: '1px solid rgba(255, 255, 255, 0.04)',
                  background: 'rgba(255, 255, 255, 0.02)',
                }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)' }}>Total</span>
                  <span style={{
                    fontSize: 15,
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    fontFamily: 'var(--font-mono)',
                  }}>
                    {formatMoney(invoice.total, invoice.currency)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
