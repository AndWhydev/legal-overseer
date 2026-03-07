'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ReceiptText, Search, Download, ChevronDown } from 'lucide-react'
import { SkeletonTable } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { useToast } from '@/components/ui/toast'
import { useSeedData } from '@/hooks/use-seed-data'
import { InvoiceSummaryBar } from './invoice-summary-bar'
import { InvoiceDetailDrawer } from './invoice-detail-drawer'

// ─── Types ──────────────────────────────────────────────────────────────────

type InvoiceStatus = 'draft' | 'sent' | 'viewed' | 'overdue' | 'paid' | 'cancelled'
type SectionKey = 'attention' | 'awaiting' | 'drafts' | 'completed'

interface LineItem {
  description: string
  quantity: number
  unit_price: number
  total: number
}

export interface InvoiceRow {
  id: string
  invoice_number: string
  client_contact_id: string | null
  client_name?: string | null
  total: number
  currency: string
  status: InvoiceStatus
  due_date: string | null
  issued_date?: string | null
  paid_date?: string | null
  created_at?: string
  line_items?: LineItem[]
}

// ─── Constants ──────────────────────────────────────────────────────────────

const SECTIONS: { key: SectionKey; label: string; accent: string | null; defaultOpen: boolean }[] = [
  { key: 'attention', label: 'Needs Attention', accent: '#EF4444', defaultOpen: true },
  { key: 'awaiting', label: 'Awaiting Payment', accent: null, defaultOpen: true },
  { key: 'drafts', label: 'Drafts', accent: null, defaultOpen: true },
  { key: 'completed', label: 'Completed', accent: null, defaultOpen: false },
]

const SNAP = 'cubic-bezier(0.2, 0.9, 0.3, 1)'

// ─── Shared Styles ──────────────────────────────────────────────────────────

const glassCard: React.CSSProperties = {
  borderRadius: 14,
  background: 'rgba(15, 20, 30, 0.45)',
  backdropFilter: 'blur(24px) saturate(1.3)',
  WebkitBackdropFilter: 'blur(24px) saturate(1.3)',
  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06)',
  overflow: 'hidden',
}

// ─── Utility Functions ──────────────────────────────────────────────────────

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
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

function getDueUrgency(dueDate: string | null, status: InvoiceStatus): { text: string; color: string } {
  if (status === 'paid' || status === 'cancelled' || status === 'draft') return { text: '', color: '' }
  if (!dueDate) return { text: '', color: '' }
  const days = Math.ceil((new Date(dueDate).getTime() - Date.now()) / 86_400_000)
  if (days < 0) return { text: `${Math.abs(days)}d overdue`, color: '#EF4444' }
  if (days === 0) return { text: 'Due today', color: '#F59E0B' }
  if (days <= 3) return { text: `Due in ${days}d`, color: '#F59E0B' }
  if (days <= 7) return { text: `Due in ${days}d`, color: 'var(--text-secondary)' }
  return { text: '', color: '' }
}

function isOverdue(inv: InvoiceRow): boolean {
  if (inv.status === 'overdue') return true
  if (inv.status === 'paid' || inv.status === 'cancelled' || inv.status === 'draft') return false
  if (inv.due_date) return Math.ceil((new Date(inv.due_date).getTime() - Date.now()) / 86_400_000) < 0
  return false
}

function getSection(invoice: InvoiceRow): SectionKey {
  if (invoice.status === 'paid' || invoice.status === 'cancelled') return 'completed'
  if (invoice.status === 'draft') return 'drafts'
  if (isOverdue(invoice)) return 'attention'
  if (invoice.due_date) {
    const days = Math.ceil((new Date(invoice.due_date).getTime() - Date.now()) / 86_400_000)
    if (days <= 7) return 'attention'
  }
  return 'awaiting'
}

function groupBySection(invoices: InvoiceRow[]): Record<SectionKey, InvoiceRow[]> {
  const groups: Record<SectionKey, InvoiceRow[]> = { attention: [], awaiting: [], drafts: [], completed: [] }
  for (const inv of invoices) groups[getSection(inv)].push(inv)
  return groups
}

function getInitials(name: string | null | undefined): string {
  if (!name) return '?'
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

function getAvatarColor(name: string): string {
  const colors = ['#3B82F6', '#22C55E', '#F59E0B', '#8B5CF6', '#FF5A1F']
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

function exportCsv(invoices: InvoiceRow[]) {
  const header = 'Invoice,Client,Total,Status,Due Date,Created\n'
  const rows = invoices.map(inv =>
    `${inv.invoice_number},"${inv.client_name || 'Unknown'}",${inv.total},${inv.status},${inv.due_date || ''},${inv.created_at || ''}`
  ).join('\n')
  const blob = new Blob([header + rows], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'invoices.csv'
  a.click()
  URL.revokeObjectURL(url)
}

// ─── InvoiceRowItem ─────────────────────────────────────────────────────────

function InvoiceRowItem({
  invoice,
  onClick,
  delay,
}: {
  invoice: InvoiceRow
  onClick: () => void
  delay: number
}) {
  const [hovered, setHovered] = useState(false)
  const urgency = getDueUrgency(invoice.due_date, invoice.status)
  const name = invoice.client_name || 'Unknown'
  const avatarBg = getAvatarColor(name)

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '12px 16px',
        cursor: 'pointer',
        transition: 'background 80ms ease',
        background: hovered ? 'rgba(255, 255, 255, 0.03)' : 'transparent',
        borderBottom: '1px solid rgba(255, 255, 255, 0.02)',
        animation: `bb-inv-row 150ms ${SNAP} both`,
        animationDelay: `${delay}ms`,
      }}
    >
      {/* Avatar */}
      <div style={{
        width: 36,
        height: 36,
        borderRadius: 10,
        flexShrink: 0,
        background: `${avatarBg}15`,
        color: avatarBg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 13,
        fontWeight: 600,
      }}>
        {getInitials(name)}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14,
          fontWeight: 600,
          color: 'var(--text-primary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {name}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            {invoice.invoice_number}
          </span>
          {urgency.text && (
            <span style={{ fontSize: 12, color: urgency.color, fontWeight: 500 }}>
              {urgency.text}
            </span>
          )}
        </div>
      </div>

      {/* Amount */}
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{
          fontSize: 14,
          fontWeight: 700,
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-mono)',
          letterSpacing: '-0.01em',
        }}>
          {formatMoney(invoice.total, invoice.currency)}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
          {invoice.status === 'paid' ? 'Paid' : formatDueDate(invoice.due_date)}
        </div>
      </div>
    </div>
  )
}

// ─── InvoiceSection ─────────────────────────────────────────────────────────

function InvoiceSection({
  label,
  accent,
  invoices,
  defaultOpen,
  delay,
  onRowClick,
}: {
  label: string
  accent: string | null
  invoices: InvoiceRow[]
  defaultOpen: boolean
  delay: number
  onRowClick: (inv: InvoiceRow) => void
}) {
  const [open, setOpen] = useState(defaultOpen)
  if (invoices.length === 0) return null

  return (
    <div style={{
      ...glassCard,
      animation: `bb-inv-section 200ms ${SNAP} both`,
      animationDelay: `${delay}ms`,
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '14px 16px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
        }}
      >
        {accent && (
          <div style={{
            width: 3,
            height: 16,
            borderRadius: 2,
            background: accent,
            flexShrink: 0,
          }} />
        )}
        <span style={{
          fontSize: 13,
          fontWeight: 600,
          color: accent || 'var(--text-secondary)',
          letterSpacing: '0.01em',
        }}>
          {label}
        </span>
        <span style={{
          fontSize: 12,
          color: 'var(--text-dim)',
          fontFamily: 'var(--font-mono)',
        }}>
          {invoices.length}
        </span>
        <div style={{ flex: 1 }} />
        <ChevronDown
          size={14}
          style={{
            color: 'var(--text-dim)',
            transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
            transition: `transform 150ms ${SNAP}`,
          }}
        />
      </button>

      {/* Animated expand/collapse */}
      <div style={{
        display: 'grid',
        gridTemplateRows: open ? '1fr' : '0fr',
        transition: `grid-template-rows 200ms ${SNAP}`,
      }}>
        <div style={{ overflow: 'hidden' }}>
          {invoices.map((inv, i) => (
            <InvoiceRowItem
              key={inv.id}
              invoice={inv}
              onClick={() => onRowClick(inv)}
              delay={open ? i * 25 : 0}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function InvoiceList() {
  const { toast } = useToast()
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRow | null>(null)
  const [busyInvoiceId, setBusyInvoiceId] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const seed = useSeedData()

  const loadInvoices = useCallback(async () => {
    try {
      const response = await fetch('/api/agent/invoices', { cache: 'no-store' })
      const payload = (await response.json().catch(() => ({}))) as { invoices?: InvoiceRow[] }
      if (response.ok) setInvoices(payload.invoices ?? [])
    } catch {
      // Non-critical — seed data may be active
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { void loadInvoices() }, [loadInvoices])

  // / to focus search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const allInvoices = useMemo(() => {
    if (seed.active && seed.data?.invoices) return seed.data.invoices as InvoiceRow[]
    return invoices
  }, [seed.active, seed.data, invoices])

  const filtered = useMemo(() => {
    if (!search.trim()) return allInvoices
    const q = search.toLowerCase()
    return allInvoices.filter(inv =>
      inv.invoice_number.toLowerCase().includes(q) ||
      (inv.client_name || '').toLowerCase().includes(q) ||
      inv.status.includes(q)
    )
  }, [allInvoices, search])

  const grouped = useMemo(() => groupBySection(filtered), [filtered])

  const stats = useMemo(() => {
    const unpaid = allInvoices.filter(i => i.status !== 'paid' && i.status !== 'cancelled')
    const overdue = allInvoices.filter(i => isOverdue(i))
    const dueSoon = allInvoices.filter(i => {
      if (i.status === 'paid' || i.status === 'cancelled' || i.status === 'draft') return false
      if (isOverdue(i)) return false
      if (i.due_date) {
        const days = Math.ceil((new Date(i.due_date).getTime() - Date.now()) / 86_400_000)
        return days >= 0 && days <= 7
      }
      return false
    })
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    const paidThisMonth = allInvoices.filter(
      i => i.status === 'paid' && i.paid_date && new Date(i.paid_date) >= monthStart
    )
    return {
      totalOutstanding: unpaid.reduce((s, i) => s + i.total, 0),
      overdueCount: overdue.length,
      overdueAmount: overdue.reduce((s, i) => s + i.total, 0),
      dueThisWeekCount: dueSoon.length,
      dueThisWeekAmount: dueSoon.reduce((s, i) => s + i.total, 0),
      paidThisMonthCount: paidThisMonth.length,
      paidThisMonthAmount: paidThisMonth.reduce((s, i) => s + i.total, 0),
    }
  }, [allInvoices])

  async function mutateStatus(invoiceId: string, status: InvoiceStatus) {
    setBusyInvoiceId(invoiceId)
    try {
      const response = await fetch(`/api/agent/invoices/${encodeURIComponent(invoiceId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const payload = (await response.json().catch(() => ({}))) as { queued?: boolean; error?: string }
      if (!response.ok) throw new Error(payload.error ?? 'Failed to update')
      if (payload.queued) toast('info', 'Invoice send queued for approval.')
      else if (status === 'paid') toast('success', 'Invoice marked as paid.')
      else if (status === 'cancelled') toast('success', 'Invoice cancelled.')
      else toast('success', 'Invoice updated.')
      await loadInvoices()
      if (selectedInvoice?.id === invoiceId) setSelectedInvoice(null)
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to update')
    } finally {
      setBusyInvoiceId(null)
    }
  }

  if (isLoading) return <SkeletonTable rows={6} cols={4} />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Animation keyframes */}
      <style>{`
        @keyframes bb-inv-section {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes bb-inv-row {
          from { opacity: 0; transform: translateX(-6px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>

      {/* Summary */}
      <InvoiceSummaryBar {...stats} />

      {/* Search + Export */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search
            size={14}
            style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-dim)',
              pointerEvents: 'none',
            }}
          />
          <input
            ref={searchRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search invoices..."
            style={{
              width: '100%',
              padding: '10px 40px 10px 34px',
              borderRadius: 10,
              border: 'none',
              background: 'rgba(255, 255, 255, 0.04)',
              color: 'var(--text-primary)',
              fontSize: 14,
              outline: 'none',
              transition: 'background 120ms ease',
            }}
            onFocus={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)' }}
            onBlur={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)' }}
          />
          <kbd style={{
            position: 'absolute',
            right: 10,
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: 10,
            color: 'var(--text-dim)',
            background: 'rgba(255, 255, 255, 0.06)',
            padding: '2px 6px',
            borderRadius: 4,
            fontFamily: 'var(--font-mono)',
          }}>
            /
          </kbd>
        </div>

        <button
          onClick={() => exportCsv(filtered)}
          title="Export CSV"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 36,
            height: 36,
            borderRadius: 10,
            cursor: 'pointer',
            border: 'none',
            background: 'rgba(255, 255, 255, 0.04)',
            color: 'var(--text-dim)',
            transition: 'all 80ms ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'
            e.currentTarget.style.color = 'var(--text-secondary)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'
            e.currentTarget.style.color = 'var(--text-dim)'
          }}
        >
          <Download size={15} />
        </button>
      </div>

      {/* Content */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<ReceiptText size={40} />}
          title={search ? 'No matching invoices' : 'No invoices yet'}
          description={search ? 'Try a different search term.' : 'Create your first invoice to get started.'}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {SECTIONS.map((s, i) => (
            <InvoiceSection
              key={s.key}
              label={s.label}
              accent={s.accent}
              invoices={grouped[s.key]}
              defaultOpen={s.defaultOpen}
              delay={i * 60}
              onRowClick={setSelectedInvoice}
            />
          ))}
        </div>
      )}

      {/* Detail Drawer */}
      <InvoiceDetailDrawer
        invoice={selectedInvoice}
        onClose={() => setSelectedInvoice(null)}
        onAction={(id, status) => void mutateStatus(id, status)}
        busy={!!busyInvoiceId}
      />
    </div>
  )
}
