'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  useDroppable,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  IconSearch, IconDownload, IconChevronDown, IconSend, IconCircleCheck,
  IconBan, IconUsers, IconLayoutList, IconEye, IconEyeOff, IconPlus, IconX, IconLoader2, IconReceipt,
} from '@tabler/icons-react'
import { Empty, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import { useSeedData } from '@/hooks/use-seed-data'
import { InvoiceSummaryBar } from './invoice-summary-bar'

// ─── Types ──────────────────────────────────────────────────────────────────

type InvoiceStatus = 'draft' | 'sent' | 'viewed' | 'overdue' | 'paid' | 'cancelled'
type SectionKey = 'attention' | 'awaiting' | 'drafts' | 'completed'
type GroupMode = 'status' | 'client'

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
  client_email?: string | null
  total: number
  subtotal?: number
  tax?: number
  currency: string
  status: InvoiceStatus
  due_date: string | null
  issued_date?: string | null
  paid_date?: string | null
  created_at?: string
  line_items?: LineItem[]
  project_reference?: string | null
  payment_method?: string | null
}

// ─── Constants ──────────────────────────────────────────────────────────────

const SECTIONS: { key: SectionKey; label: string; accent: string | null; defaultOpen: boolean; droppable: boolean }[] = [
  { key: 'attention', label: 'Needs Attention', accent: 'var(--bb-red)', defaultOpen: true, droppable: false },
  { key: 'awaiting', label: 'Awaiting Payment', accent: null, defaultOpen: true, droppable: true },
  { key: 'drafts', label: 'Drafts', accent: null, defaultOpen: true, droppable: true },
  { key: 'completed', label: 'Completed', accent: null, defaultOpen: false, droppable: true },
]

const SECTION_STATUS_MAP: Partial<Record<SectionKey, InvoiceStatus>> = {
  drafts: 'draft',
  awaiting: 'sent',
  completed: 'paid',
}

// Snappy spring easing — fast attack, soft settle
const SPRING = 'cubic-bezier(0.175, 0.885, 0.32, 1.075)'
const SNAP = 'cubic-bezier(0.2, 0.9, 0.3, 1)'

const PROGRESS_STEPS = ['Draft', 'Sent', 'Paid'] as const

// ─── Shared Styles ──────────────────────────────────────────────────────────

const glassCard: React.CSSProperties = {
  borderRadius: 12,
  background: 'var(--glass-card-bg-light)',
  backdropFilter: 'var(--glass-card-blur)',
  WebkitBackdropFilter: 'var(--glass-card-blur)',
  boxShadow: 'var(--glass-card-inset)',
  overflow: 'hidden',
}

// ─── MD5 (Gravatar) ─────────────────────────────────────────────────────────

function md5(input: string): string {
  function rotl(v: number, s: number) { return (v << s) | (v >>> (32 - s)) }
  const K = [
    0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a,
    0xa8304613, 0xfd469501, 0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be,
    0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821, 0xf61e2562, 0xc040b340,
    0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
    0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8,
    0x676f02d9, 0x8d2a4c8a, 0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c,
    0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70, 0x289b7ec6, 0xeaa127fa,
    0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
    0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92,
    0xffeff47d, 0x85845dd1, 0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1,
    0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
  ]
  const S = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ]
  const bytes: number[] = []
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i)
    if (c < 0x80) bytes.push(c)
    else if (c < 0x800) { bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f)) }
    else { bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f)) }
  }
  const origLen = bytes.length * 8
  bytes.push(0x80)
  while (bytes.length % 64 !== 56) bytes.push(0)
  for (let i = 0; i < 8; i++) bytes.push((origLen >>> (i * 8)) & 0xff)
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476
  for (let i = 0; i < bytes.length; i += 64) {
    const M: number[] = []
    for (let j = 0; j < 16; j++)
      M[j] = bytes[i + j * 4] | (bytes[i + j * 4 + 1] << 8) | (bytes[i + j * 4 + 2] << 16) | (bytes[i + j * 4 + 3] << 24)
    let A = a0, B = b0, C = c0, D = d0
    for (let j = 0; j < 64; j++) {
      let F: number, g: number
      if (j < 16) { F = (B & C) | (~B & D); g = j }
      else if (j < 32) { F = (D & B) | (~D & C); g = (5 * j + 1) % 16 }
      else if (j < 48) { F = B ^ C ^ D; g = (3 * j + 5) % 16 }
      else { F = C ^ (B | ~D); g = (7 * j) % 16 }
      F = (F + A + K[j] + M[g]) >>> 0
      A = D; D = C; C = B; B = (B + rotl(F, S[j])) >>> 0
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0
  }
  let hex = ''
  for (const v of [a0, b0, c0, d0])
    for (let i = 0; i < 4; i++) hex += ((v >>> (i * 8)) & 0xff).toString(16).padStart(2, '0')
  return hex
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

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
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
  if (days < 0) return { text: `${Math.abs(days)}d overdue`, color: 'var(--bb-red)' }
  if (days === 0) return { text: 'Due today', color: 'var(--bb-amber)' }
  if (days <= 3) return { text: `Due in ${days}d`, color: 'var(--bb-amber)' }
  if (days <= 7) return { text: `Due in ${days}d`, color: 'var(--text-secondary)' }
  return { text: '', color: '' }
}

function getDueColor(dueDate: string | null, status: InvoiceStatus): string {
  if (status === 'paid' || status === 'cancelled' || status === 'draft') return 'var(--text-secondary)'
  if (!dueDate) return 'var(--text-secondary)'
  const days = Math.ceil((new Date(dueDate).getTime() - Date.now()) / 86_400_000)
  if (days < 0) return 'var(--bb-red)'
  if (days <= 7) return 'var(--bb-amber)'
  return 'var(--text-secondary)'
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

function groupBySection(
  invoices: InvoiceRow[],
  overrides: Map<string, SectionKey>,
): Record<SectionKey, InvoiceRow[]> {
  const groups: Record<SectionKey, InvoiceRow[]> = { attention: [], awaiting: [], drafts: [], completed: [] }
  for (const inv of invoices) {
    const section = overrides.get(inv.id) ?? getSection(inv)
    groups[section].push(inv)
  }
  return groups
}

function groupByClient(invoices: InvoiceRow[]): { name: string; invoices: InvoiceRow[] }[] {
  const map = new Map<string, InvoiceRow[]>()
  for (const inv of invoices) {
    const name = inv.client_name || 'Unknown'
    const list = map.get(name) ?? []
    list.push(inv)
    map.set(name, list)
  }
  return Array.from(map.entries())
    .map(([name, items]) => ({ name, invoices: items }))
    .sort((a, b) => {
      // Sort by total outstanding descending
      const aSum = a.invoices.filter(i => i.status !== 'paid' && i.status !== 'cancelled').reduce((s, i) => s + i.total, 0)
      const bSum = b.invoices.filter(i => i.status !== 'paid' && i.status !== 'cancelled').reduce((s, i) => s + i.total, 0)
      return bSum - aSum
    })
}

function getInitials(name: string | null | undefined): string {
  if (!name) return '?'
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

function nameHash(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return Math.abs(h)
}

function getProgressIndex(status: InvoiceStatus): number {
  if (status === 'paid') return 2
  if (status === 'sent' || status === 'viewed' || status === 'overdue') return 1
  return 0
}

function canSend(s: InvoiceStatus) { return s === 'draft' }
function canMarkPaid(s: InvoiceStatus) { return s === 'sent' || s === 'viewed' || s === 'overdue' }
function canCancel(s: InvoiceStatus) { return s !== 'paid' && s !== 'cancelled' }

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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Resolve target section from a DnD over ID (could be a section-* or an invoice ID) */
function resolveTargetSection(
  overId: string,
  invoiceSections: Map<string, SectionKey>,
): SectionKey | null {
  if (overId.startsWith('section-')) {
    return overId.replace('section-', '') as SectionKey
  }
  return invoiceSections.get(overId) ?? null
}

// ─── Avatar Colors ──────────────────────────────────────────────────────────

const AVATAR_PAIRS = [
  ['#64748B', '#94A3B8'],
  ['#94A3B8', '#CBD5E1'],
  ['#475569', '#64748B'],
  ['#334155', '#475569'],
  ['#CBD5E1', 'rgba(255, 255, 255, 0.08)'],
]

const STATUS_COLORS: Record<InvoiceStatus, { dot: string; bg: string; label: string; badgeVariant: 'secondary' | 'default' | 'destructive' | 'outline' }> = {
  draft:     { dot: '#94A3B8', bg: 'rgba(148, 163, 184, 0.12)', label: 'Draft',     badgeVariant: 'secondary' },
  sent:      { dot: '#F1F5F9', bg: 'rgba(255, 255, 255, 0.08)', label: 'Sent',      badgeVariant: 'outline' },
  viewed:    { dot: '#eab308', bg: 'rgba(234, 179, 8, 0.12)',   label: 'Viewed',    badgeVariant: 'outline' },
  overdue:   { dot: '#ef4444', bg: 'rgba(239, 68, 68, 0.12)',   label: 'Overdue',   badgeVariant: 'destructive' },
  paid:      { dot: '#22c55e', bg: 'rgba(34, 197, 94, 0.12)',   label: 'Paid',      badgeVariant: 'default' },
  cancelled: { dot: '#475569', bg: 'rgba(71, 85, 105, 0.12)',   label: 'Cancelled', badgeVariant: 'secondary' },
}

// ─── Client-Side Invoice PDF Preview ────────────────────────────────────────

function generateInvoicePreviewHtml(invoice: InvoiceRow): string {
  const items = invoice.line_items ?? [{
    description: invoice.project_reference || 'Services rendered',
    quantity: 1,
    unit_price: invoice.total,
    total: invoice.total,
  }]
  const subtotal = invoice.subtotal ?? items.reduce((s, i) => s + i.total, 0)
  const tax = invoice.tax ?? Math.round(subtotal * 0.1 * 100) / 100
  const total = invoice.total
  const cur = invoice.currency || 'AUD'
  const fmt = (n: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: cur, minimumFractionDigits: 2 }).format(n)

  const itemsHtml = items.map(item => `
    <tr>
      <td style="padding:8px 8px;border-bottom:1px solid #1e293b;">${escapeHtml(item.description)}</td>
      <td style="padding:8px 8px;border-bottom:1px solid #1e293b;text-align:right;">${item.quantity}</td>
      <td style="padding:8px 8px;border-bottom:1px solid #1e293b;text-align:right;">${fmt(item.unit_price)}</td>
      <td style="padding:8px 8px;border-bottom:1px solid #1e293b;text-align:right;">${fmt(item.total)}</td>
    </tr>
  `).join('')

  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0f1a; color: #e2e8f0; padding: 20px; font-size: 14px; }
  .card { max-width: 600px; margin: 0 auto; background: #111827; border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; overflow: hidden; }
  .header { padding: 20px; border-bottom: 1px solid rgba(255,255,255,0.06); border-left: 4px solid #3B82F6; display: flex; justify-content: space-between; }
  .header h1 { font-size: 16px; color: #3B82F6; margin-bottom: 4px; }
  .header .meta { text-align: right; font-size: 14px; color: #94a3b8; line-height: 1.8; }
  .section { padding: 16px 20px; }
  .bill-to { font-size: 14px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 4px; }
  .client { font-size: 14px; color: #e2e8f0; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th { padding: 8px 8px; text-align: left; color: #94a3b8; font-weight: 500; font-size: 14px; text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid #1e293b; }
  th:not(:first-child) { text-align: right; }
  .totals { margin-top: 16px; display: flex; justify-content: flex-end; }
  .totals table { width: 220px; }
  .totals td { padding: 8px 0; color: #94a3b8; font-size: 14px; }
  .totals td:last-child { text-align: right; color: #e2e8f0; }
  .totals .grand { border-top: 1px solid #334155; font-weight: 500; font-size: 16px; padding-top: 12px; }
  .totals .grand td { color: #e2e8f0; }
  .footer { padding: 12px 20px; border-top: 1px solid rgba(255,255,255,0.06); font-size: 14px; color: #64748b; }
</style></head><body>
<div class="card">
  <div class="header">
    <div>
      <p style="font-size:14px;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;margin-bottom:2px;">Tax Invoice</p>
      <h1>Invoice</h1>
      <p style="font-size:14px;color:#94a3b8;margin-top:2px;">BitBit</p>
    </div>
    <div class="meta">
      <div><strong style="color:#64748b;">Invoice #:</strong> ${escapeHtml(invoice.invoice_number)}</div>
      ${invoice.issued_date ? `<div><strong style="color:#64748b;">Issued:</strong> ${escapeHtml(formatDate(invoice.issued_date))}</div>` : ''}
      ${invoice.due_date ? `<div><strong style="color:#64748b;">Due:</strong> ${escapeHtml(formatDate(invoice.due_date))}</div>` : ''}
    </div>
  </div>
  <div class="section" style="display:flex;justify-content:space-between;gap:20px;">
    <div>
      <div class="bill-to">Bill To</div>
      <div class="client">${escapeHtml(invoice.client_name || 'Client')}</div>
      ${invoice.client_email ? `<div style="font-size:14px;color:#64748b;margin-top:2px;">${escapeHtml(invoice.client_email)}</div>` : ''}
    </div>
    ${invoice.project_reference ? `<div><div class="bill-to">Project</div><div class="client">${escapeHtml(invoice.project_reference)}</div></div>` : ''}
  </div>
  <div class="section">
    <table>
      <thead><tr><th>Description</th><th>Qty</th><th>Unit</th><th>Total</th></tr></thead>
      <tbody>${itemsHtml}</tbody>
    </table>
    <div class="totals">
      <table>
        <tr><td>Subtotal</td><td>${fmt(subtotal)}</td></tr>
        <tr><td>GST (10%)</td><td>${fmt(tax)}</td></tr>
        <tr class="grand"><td>Total</td><td>${fmt(total)}</td></tr>
      </table>
    </div>
  </div>
  <div class="footer">Generated by Invoice Flow &mdash; BitBit</div>
</div>
</body></html>`
}

// ─── InvoiceAvatar ──────────────────────────────────────────────────────────

function InvoiceAvatar({ name, email, size = 36 }: { name: string; email?: string | null; size?: number }) {
  const [imgError, setImgError] = useState(false)
  const hash = nameHash(name)
  const pair = AVATAR_PAIRS[hash % AVATAR_PAIRS.length]
  const angle = (hash % 360)

  const gravatarUrl = email
    ? `https://www.gravatar.com/avatar/${md5(email.trim().toLowerCase())}?s=${size * 2}&d=404`
    : null

  const showImg = gravatarUrl && !imgError

  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: 12,
      flexShrink: 0,
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute',
        inset: 0,
        background: `conic-gradient(from ${angle}deg, ${pair[0]}, ${pair[1]}, ${pair[0]})`,
        opacity: 0.85,
      }} />
      {!showImg && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontSize: size * 0.36,
          fontWeight: 500,
          letterSpacing: '0.02em',
          textShadow: '0 1px 2px rgba(0,0,0,0.3)',
        }}>
          {getInitials(name)}
        </div>
      )}
      {gravatarUrl && !imgError && (
        <img
          src={gravatarUrl}
          alt=""
          onError={() => setImgError(true)}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            borderRadius: 12,
          }}
        />
      )}
    </div>
  )
}

// ─── PDF Preview Panel ──────────────────────────────────────────────────────

function PdfPreviewPanel({ invoice }: { invoice: InvoiceRow }) {
  const html = useMemo(() => generateInvoicePreviewHtml(invoice), [invoice])

  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-border">
      <iframe
        srcDoc={html}
        title={`Preview ${invoice.invoice_number}`}
        sandbox="allow-same-origin"
        className="w-full rounded-xl border-none bg-background"
        style={{ height: 380 }}
      />
    </div>
  )
}

// ─── Inline Detail Panel ────────────────────────────────────────────────────

function InvoiceDetailPanel({
  invoice,
  onAction,
  busyId,
}: {
  invoice: InvoiceRow
  onAction: (id: string, status: InvoiceStatus) => void
  busyId: string | null
}) {
  const busy = busyId === invoice.id
  const [showPdf, setShowPdf] = useState(false)
  const progressIdx = getProgressIndex(invoice.status)
  const dueColor = getDueColor(invoice.due_date, invoice.status)

  const actionBtn = (
    label: string,
    icon: React.ReactNode,
    status: InvoiceStatus,
    bg: string,
    fg: string,
  ) => (
    <button
      onClick={(e) => { e.stopPropagation(); onAction(invoice.id, status) }}
      disabled={busy}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '12px 16px',
        borderRadius: 12,
        cursor: busy ? 'not-allowed' : 'pointer',
        background: bg,
        border: 'none',
        color: fg,
        fontSize: 14,
        fontWeight: 500,
        opacity: busy ? 0.5 : 1,
        transition: `all 100ms ${SNAP}`,
      }}
      onMouseEnter={e => { if (!busy) e.currentTarget.style.filter = 'brightness(1.3)' }}
      onMouseLeave={e => { e.currentTarget.style.filter = 'brightness(1)' }}
    >
      {icon} {label}
    </button>
  )

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        borderTop: '1px solid var(--glass-divider)',
        background: 'var(--glass-card-border)',
        padding: '20px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        animation: `bb-inv-detail-enter 180ms ${SPRING} both`,
      }}
    >
      {/* Amount hero + due date + progress */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{
            fontSize: 16,
            fontWeight: 500,
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-mono)',
            letterSpacing: '-0.02em',
            lineHeight: 1,
          }}>
            {formatMoney(invoice.total, invoice.currency)}
          </div>
          <div style={{ fontSize: 14, color: dueColor, marginTop: 8, fontWeight: 500 }}>
            {invoice.status === 'paid'
              ? `Paid ${formatDate(invoice.paid_date)}`
              : invoice.due_date
                ? `Due ${formatDate(invoice.due_date)}`
                : 'No due date'}
          </div>
          {invoice.project_reference && (
            <div style={{ fontSize: 14, color: 'var(--text-dim)', marginTop: 4 }}>
              Project: {invoice.project_reference}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 140 }}>
          {PROGRESS_STEPS.map((step, i) => (
            <div key={step} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{
                height: 3,
                width: '100%',
                borderRadius: 99,
                background: i <= progressIdx
                  ? invoice.status === 'cancelled' ? '#71717a' : '#22C55E'
                  : 'var(--glass-hover-bg)',
                transition: `background 200ms ${SNAP}`,
              }} />
              <span style={{
                fontSize: 14,
                fontWeight: 500,
                color: i <= progressIdx ? 'var(--text-primary)' : 'var(--text-dim)',
              }}>
                {step}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Line Items */}
      {invoice.line_items && invoice.line_items.length > 0 && (
        <div>
          <div style={{
            fontSize: 14,
            fontWeight: 500,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--text-dim)',
            marginBottom: 8,
          }}>
            Line Items
          </div>
          <div style={{ borderRadius: 12, background: 'var(--bg-card)', overflow: 'hidden' }}>
            {invoice.line_items.map((item, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 12px',
                  borderBottom: i < invoice.line_items!.length - 1
                    ? '1px solid var(--glass-card-border)' : 'none',
                }}
              >
                <div>
                  <div style={{ fontSize: 14, color: 'var(--text-primary)' }}>{item.description}</div>
                  <div style={{ fontSize: 14, color: 'var(--text-dim)', marginTop: 1 }}>
                    {item.quantity} &times; {formatMoney(item.unit_price, invoice.currency)}
                  </div>
                </div>
                <span style={{
                  fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)',
                }}>
                  {formatMoney(item.total, invoice.currency)}
                </span>
              </div>
            ))}
            {/* Subtotal / Tax / Total */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 0,
              borderTop: '1px solid var(--glass-divider)',
              background: 'var(--glass-card-border)',
            }}>
              {(invoice.subtotal != null || invoice.tax != null) && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', fontSize: 14 }}>
                    <span style={{ color: 'var(--text-dim)' }}>Subtotal</span>
                    <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                      {formatMoney(invoice.subtotal ?? invoice.line_items!.reduce((s, i) => s + i.total, 0), invoice.currency)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', fontSize: 14 }}>
                    <span style={{ color: 'var(--text-dim)' }}>GST (10%)</span>
                    <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                      {formatMoney(invoice.tax ?? 0, invoice.currency)}
                    </span>
                  </div>
                </>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 12px', fontSize: 14, fontWeight: 500, borderTop: (invoice.subtotal != null || invoice.tax != null) ? '1px solid var(--glass-divider)' : 'none' }}>
                <span style={{ color: 'var(--text-dim)' }}>Total</span>
                <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                  {formatMoney(invoice.total, invoice.currency)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dates + Payment */}
      <div style={{ display: 'flex', gap: 24, fontSize: 14, flexWrap: 'wrap' }}>
        {invoice.issued_date && (
          <div><span style={{ color: 'var(--text-dim)' }}>Issued </span><span style={{ color: 'var(--text-secondary)' }}>{formatDate(invoice.issued_date)}</span></div>
        )}
        {invoice.created_at && (
          <div><span style={{ color: 'var(--text-dim)' }}>Created </span><span style={{ color: 'var(--text-secondary)' }}>{formatDate(invoice.created_at)}</span></div>
        )}
        {invoice.payment_method && (
          <div><span style={{ color: 'var(--text-dim)' }}>Paid via </span><span style={{ color: 'var(--text-secondary)' }}>{invoice.payment_method}</span></div>
        )}
      </div>

      {/* Actions row */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {canSend(invoice.status) && actionBtn('Send', <IconSend size={14} />, 'sent', 'rgba(56, 189, 248, 0.1)', '#7dd3fc')}
        {canMarkPaid(invoice.status) && actionBtn('Mark Paid', <IconCircleCheck size={14} />, 'paid', 'rgba(34, 197, 94, 0.1)', '#86efac')}
        {canCancel(invoice.status) && (
          <button
            onClick={(e) => { e.stopPropagation(); onAction(invoice.id, 'cancelled') }}
            disabled={busy}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '12px 16px', borderRadius: 12, cursor: busy ? 'not-allowed' : 'pointer',
              background: 'transparent', border: '1px solid var(--glass-interactive-border)',
              color: 'var(--text-dim)', fontSize: 14, fontWeight: 500,
              opacity: busy ? 0.5 : 1, transition: `all 100ms ${SNAP}`,
            }}
          >
            <IconBan size={14} /> Cancel
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); setShowPdf(v => !v) }}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '12px 16px', borderRadius: 12, cursor: 'pointer',
            background: showPdf ? 'rgba(255, 255, 255, 0.08)' : 'var(--glass-interactive-bg)',
            border: showPdf ? '1px solid rgba(255, 255, 255, 0.03)' : 'none',
            color: showPdf ? 'var(--text-primary, #F1F5F9)' : 'var(--text-dim)', fontSize: 14, fontWeight: 500,
            transition: `all 100ms ${SNAP}`,
          }}
        >
          {showPdf ? <IconEyeOff size={14} /> : <IconEye size={14} />}
          {showPdf ? 'Hide Preview' : 'Preview Invoice'}
        </button>
      </div>

      {/* PDF Preview */}
      <div style={{
        display: 'grid',
        gridTemplateRows: showPdf ? '1fr' : '0fr',
        transition: `grid-template-rows 250ms ${SPRING}`,
      }}>
        <div style={{ overflow: 'hidden' }}>
          {showPdf && <PdfPreviewPanel invoice={invoice} />}
        </div>
      </div>
    </div>
  )
}

// ─── InvoiceRowItem (Sortable + Expandable) ─────────────────────────────────

function InvoiceRowItem({
  invoice,
  expanded,
  onToggle,
  onAction,
  busyId,
  delay,
  isDragOverlay,
}: {
  invoice: InvoiceRow
  expanded: boolean
  onToggle: () => void
  onAction: (id: string, status: InvoiceStatus) => void
  busyId: string | null
  delay: number
  isDragOverlay?: boolean
}) {
  const [hovered, setHovered] = useState(false)
  const busy = busyId === invoice.id
  const pointerStart = useRef<{ x: number; y: number } | null>(null)

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: invoice.id, disabled: expanded || isDragOverlay })

  // Snappy DnD transitions — override dnd-kit defaults
  const dndTransition = transition
    ? transition.replace(/\d+ms/, '120ms').replace(/ease/, SNAP)
    : undefined

  const dndStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: [
      dndTransition,
      `opacity 80ms ${SNAP}`,
      `box-shadow 80ms ${SNAP}`,
    ].filter(Boolean).join(', '),
    opacity: isDragging ? 0.35 : 1,
    position: 'relative',
    zIndex: isDragging ? 10 : expanded ? 5 : 1,
  }

  const urgency = getDueUrgency(invoice.due_date, invoice.status)
  const name = invoice.client_name || 'Unknown'
  const sc = STATUS_COLORS[invoice.status]

  const handlePointerDown = (e: React.PointerEvent) => {
    pointerStart.current = { x: e.clientX, y: e.clientY }
  }
  const handlePointerUp = (e: React.PointerEvent) => {
    if (!pointerStart.current) return
    const dx = Math.abs(e.clientX - pointerStart.current.x)
    const dy = Math.abs(e.clientY - pointerStart.current.y)
    if (dx < 5 && dy < 5) onToggle()
    pointerStart.current = null
  }

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        ...dndStyle,
        animation: isDragOverlay ? 'none' : `bb-inv-row 120ms ${SPRING} both`,
        animationDelay: isDragOverlay ? '0ms' : `${delay}ms`,
      }}
    >
      <div
        className="bb-inv-row"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 16px',
          cursor: isDragging ? 'grabbing' : expanded ? 'pointer' : 'grab',
          transition: `background 60ms ${SNAP}`,
          background: expanded
            ? 'var(--glass-interactive-bg)'
            : hovered
              ? sc.bg
              : 'transparent',
          borderBottom: expanded ? 'none' : '1px solid var(--glass-card-border)',
          borderLeft: expanded ? `2px solid ${sc.dot}` : '2px solid transparent',
          position: 'relative',
        }}
      >
        <InvoiceAvatar name={name} email={invoice.client_email} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 14, fontWeight: 500, color: 'var(--text-primary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {name}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
            {/* Status dot + label */}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%', background: sc.dot, flexShrink: 0,
              }} />
              <span style={{ fontSize: 14, color: sc.dot, fontWeight: 500 }}>{sc.label}</span>
            </span>
            <span style={{ fontSize: 14, color: 'var(--text-dim)' }}>{invoice.invoice_number}</span>
            {invoice.project_reference && (
              <span style={{ fontSize: 14, color: 'var(--text-dim)', opacity: 0.7 }}>{invoice.project_reference}</span>
            )}
            {urgency.text && (
              <span style={{ fontSize: 14, color: urgency.color, fontWeight: 500 }}>{urgency.text}</span>
            )}
          </div>
        </div>

        {/* Hover quick-actions (visible on hover, hidden when expanded) */}
        {!expanded && !isDragging && !isDragOverlay && (
          <div
            className="bb-inv-quick-actions"
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              opacity: 0, transition: `opacity 80ms ${SNAP}`,
              flexShrink: 0,
            }}
          >
            {canSend(invoice.status) && (
              <button
                onClick={(e) => { e.stopPropagation(); onAction(invoice.id, 'sent') }}
                disabled={busy}
                title="Send invoice"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 28, height: 28, borderRadius: 8, cursor: busy ? 'not-allowed' : 'pointer',
                  background: 'rgba(56, 189, 248, 0.1)', border: 'none',
                  color: 'var(--bb-cyan)', opacity: busy ? 0.4 : 1,
                  transition: `all 80ms ${SNAP}`,
                }}
              >
                <IconSend size={13} />
              </button>
            )}
            {canMarkPaid(invoice.status) && (
              <button
                onClick={(e) => { e.stopPropagation(); onAction(invoice.id, 'paid') }}
                disabled={busy}
                title="Mark as paid"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 28, height: 28, borderRadius: 8, cursor: busy ? 'not-allowed' : 'pointer',
                  background: 'rgba(34, 197, 94, 0.1)', border: 'none',
                  color: 'var(--bb-green)', opacity: busy ? 0.4 : 1,
                  transition: `all 80ms ${SNAP}`,
                }}
              >
                <IconCircleCheck size={13} />
              </button>
            )}
          </div>
        )}

        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{
            fontSize: 14, fontWeight: 500, color: 'var(--text-primary)',
            fontFamily: 'var(--font-mono)', letterSpacing: '-0.01em',
          }}>
            {formatMoney(invoice.total, invoice.currency)}
          </div>
          <div style={{
            fontSize: 14, marginTop: 2, fontWeight: 500,
            color: invoice.status === 'paid' ? 'var(--bb-green)'
              : urgency.color || 'var(--text-secondary)',
          }}>
            {invoice.status === 'paid' ? 'Paid' : formatDueDate(invoice.due_date)}
          </div>
        </div>
      </div>

      {/* Expandable detail */}
      <div style={{
        display: 'grid',
        gridTemplateRows: expanded ? '1fr' : '0fr',
        transition: `grid-template-rows 180ms ${SPRING}`,
      }}>
        <div style={{ overflow: 'hidden' }}>
          {expanded && <InvoiceDetailPanel invoice={invoice} onAction={onAction} busyId={busyId} />}
        </div>
      </div>
    </div>
  )
}

// ─── InvoiceSection (Droppable) ─────────────────────────────────────────────

function InvoiceSection({
  sectionKey,
  label,
  accent,
  invoices,
  defaultOpen,
  droppable,
  delay,
  expandedId,
  onToggleExpand,
  onAction,
  busyId,
}: {
  sectionKey: SectionKey
  label: string
  accent: string | null
  invoices: InvoiceRow[]
  defaultOpen: boolean
  droppable: boolean
  delay: number
  expandedId: string | null
  onToggleExpand: (id: string) => void
  onAction: (id: string, status: InvoiceStatus) => void
  busyId: string | null
}) {
  const [open, setOpen] = useState(defaultOpen)
  const { isOver, setNodeRef } = useDroppable({
    id: `section-${sectionKey}`,
    disabled: !droppable,
  })

  if (invoices.length === 0 && !isOver) return null

  const ids = invoices.map(inv => inv.id)

  return (
    <div
      ref={setNodeRef}
      style={{
        ...glassCard,
        animation: `bb-inv-section 160ms ${SPRING} both`,
        animationDelay: `${delay}ms`,
        background: isOver
          ? 'var(--glass-card-bg)'
          : glassCard.background as string,
        boxShadow: isOver
          ? `inset 0 1px 0 var(--hover-bg-strong), 0 0 0 1px ${accent || 'rgba(99, 179, 237, 0.15)'}`
          : glassCard.boxShadow as string,
        transition: `background 80ms ${SNAP}, box-shadow 80ms ${SNAP}`,
      }}
    >
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 16px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
        }}
      >
        {accent && (
          <div style={{ width: 4, height: 16, borderRadius: 8, background: accent, flexShrink: 0 }} />
        )}
        <span style={{ fontSize: 14, fontWeight: 500, color: accent || 'var(--text-secondary)', letterSpacing: '0.01em' }}>
          {label}
        </span>
        <span style={{ fontSize: 14, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
          {invoices.length}
        </span>
        <div style={{ flex: 1 }} />
        <IconChevronDown
          size={14}
          style={{
            color: 'var(--text-dim)',
            transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
            transition: `transform 120ms ${SPRING}`,
          }}
        />
      </button>

      <div style={{
        display: 'grid',
        gridTemplateRows: open ? '1fr' : '0fr',
        transition: `grid-template-rows 160ms ${SPRING}`,
      }}>
        <div style={{ overflow: 'hidden', minHeight: isOver && invoices.length === 0 ? 48 : 0 }}>
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            {invoices.map((inv, i) => (
              <InvoiceRowItem
                key={inv.id}
                invoice={inv}
                expanded={expandedId === inv.id}
                onToggle={() => onToggleExpand(inv.id)}
                onAction={onAction}
                busyId={busyId}
                delay={open ? i * 20 : 0}
              />
            ))}
          </SortableContext>
          {isOver && invoices.length === 0 && (
            <div style={{
              padding: '12px 16px',
              fontSize: 14,
              color: 'var(--text-dim)',
              textAlign: 'center',
              opacity: 0.7,
            }}>
              Drop here
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Client Group Section (for "By Client" view) ───────────────────────────

function ClientGroupSection({
  name,
  invoices,
  delay,
  expandedId,
  onToggleExpand,
  onAction,
  busyId,
}: {
  name: string
  invoices: InvoiceRow[]
  delay: number
  expandedId: string | null
  onToggleExpand: (id: string) => void
  onAction: (id: string, status: InvoiceStatus) => void
  busyId: string | null
}) {
  const [open, setOpen] = useState(true)
  const outstanding = invoices.filter(i => i.status !== 'paid' && i.status !== 'cancelled')
  const outstandingTotal = outstanding.reduce((s, i) => s + i.total, 0)

  return (
    <div style={{
      ...glassCard,
      animation: `bb-inv-section 160ms ${SPRING} both`,
      animationDelay: `${delay}ms`,
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 16px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
        }}
      >
        <InvoiceAvatar name={name} email={invoices[0]?.client_email} size={28} />
        <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>{name}</span>
        <span style={{ fontSize: 14, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
          {invoices.length}
        </span>
        <div style={{ flex: 1 }} />
        {outstandingTotal > 0 && (
          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
            {formatMoney(outstandingTotal, invoices[0]?.currency || 'AUD')}
          </span>
        )}
        <IconChevronDown
          size={14}
          style={{
            color: 'var(--text-dim)',
            transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
            transition: `transform 120ms ${SPRING}`,
          }}
        />
      </button>

      <div style={{
        display: 'grid',
        gridTemplateRows: open ? '1fr' : '0fr',
        transition: `grid-template-rows 160ms ${SPRING}`,
      }}>
        <div style={{ overflow: 'hidden' }}>
          {invoices.map((inv, i) => (
            <InvoiceRowItem
              key={inv.id}
              invoice={inv}
              expanded={expandedId === inv.id}
              onToggle={() => onToggleExpand(inv.id)}
              onAction={onAction}
              busyId={busyId}
              delay={open ? i * 20 : 0}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Drag Overlay Ghost ─────────────────────────────────────────────────────

function DragGhost({ invoice }: { invoice: InvoiceRow }) {
  const name = invoice.client_name || 'Unknown'
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '12px 16px',
      borderRadius: 12,
      background: 'var(--glass-bg-heavy)',
      backdropFilter: 'var(--glass-blur)',
      WebkitBackdropFilter: 'var(--glass-blur)',
      boxShadow: 'var(--card-shadow-hover), 0 0 0 1px var(--glass-card-border)',
      transform: 'rotate(1.5deg) scale(1.02)',
      maxWidth: 320,
      pointerEvents: 'none',
    }}>
      <InvoiceAvatar name={name} email={invoice.client_email} size={32} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14, fontWeight: 500, color: 'var(--text-primary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {name}
        </div>
      </div>
      <div style={{
        fontSize: 14, fontWeight: 500, color: 'var(--text-primary)',
        fontFamily: 'var(--font-mono)', flexShrink: 0,
      }}>
        {formatMoney(invoice.total, invoice.currency)}
      </div>
    </div>
  )
}

// ─── Invoice Skeleton ───────────────────────────────────────────────────────

function InvoiceSkeleton() {
  const shimmer: React.CSSProperties = {
    background: 'var(--glass-interactive-bg)',
    borderRadius: 8,
    animation: `bb-inv-pulse 1.8s ease-in-out infinite`,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>{`
        @keyframes bb-inv-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{ ...glassCard, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ ...shimmer, width: 60, height: 10, animationDelay: `${i * 80}ms` }} />
            <div style={{ ...shimmer, width: 100, height: 24, animationDelay: `${i * 80 + 40}ms` }} />
          </div>
        ))}
      </div>
      <div style={{ ...shimmer, height: 40, borderRadius: 12 }} />
      {[0, 1, 2].map(s => (
        <div key={s} style={{ ...glassCard, padding: 0 }}>
          <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ ...shimmer, width: 80, height: 12, animationDelay: `${s * 60}ms` }} />
            <div style={{ ...shimmer, width: 20, height: 12, animationDelay: `${s * 60 + 30}ms` }} />
          </div>
          {[0, 1].map(r => (
            <div key={r} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
              borderTop: '1px solid var(--glass-card-border)',
            }}>
              <div style={{ ...shimmer, width: 36, height: 36, borderRadius: 12, animationDelay: `${s * 60 + r * 40}ms` }} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ ...shimmer, width: 120, height: 12, animationDelay: `${s * 60 + r * 40 + 20}ms` }} />
                <div style={{ ...shimmer, width: 80, height: 10, animationDelay: `${s * 60 + r * 40 + 40}ms` }} />
              </div>
              <div style={{ ...shimmer, width: 70, height: 14, animationDelay: `${s * 60 + r * 40 + 60}ms` }} />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function InvoiceList() {
  const { toast } = useToast()
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [busyInvoiceId, setBusyInvoiceId] = useState<string | null>(null)
  const [activeInvoice, setActiveInvoice] = useState<InvoiceRow | null>(null)
  const [groupMode, setGroupMode] = useState<GroupMode>('status')
  // Track visual section overrides during drag operations
  const [sectionOverrides, setSectionOverrides] = useState<Map<string, SectionKey>>(new Map())
  const draggingRef = useRef(false)
  const seed = useSeedData()

  // ─── Create Invoice Modal State ──────────────────────────────────────────
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createForm, setCreateForm] = useState({
    client_name: '',
    description: '',
    amount: '',
    due_date: '',
  })
  const [isCreating, setIsCreating] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

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
      inv.status.includes(q) ||
      (inv.project_reference || '').toLowerCase().includes(q)
    )
  }, [allInvoices, search])

  const grouped = useMemo(() => groupBySection(filtered, sectionOverrides), [filtered, sectionOverrides])
  const clientGroups = useMemo(() => groupByClient(filtered), [filtered])

  // Build a lookup: invoiceId → current visual section (respecting overrides)
  const invoiceSectionLookup = useMemo(() => {
    const map = new Map<string, SectionKey>()
    for (const [key, items] of Object.entries(grouped)) {
      for (const inv of items) map.set(inv.id, key as SectionKey)
    }
    return map
  }, [grouped])

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
      setExpandedId(null)
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to update')
    } finally {
      setBusyInvoiceId(null)
    }
  }

  async function handleCreateInvoice() {
    const name = createForm.client_name.trim()
    const amountStr = createForm.amount.trim()
    if (!name) { toast('error', 'Client name is required'); return }
    if (!amountStr || isNaN(Number(amountStr)) || Number(amountStr) <= 0) {
      toast('error', 'Enter a valid amount'); return
    }

    setIsCreating(true)
    try {
      const dueDateStr = createForm.due_date || undefined
      const termsDays = dueDateStr
        ? Math.max(1, Math.ceil((new Date(dueDateStr).getTime() - Date.now()) / 86_400_000))
        : 14

      const body: Record<string, unknown> = {
        contact_name: name,
        amount: Number(amountStr),
        currency: 'AUD',
        terms_days: termsDays,
        line_items: [{
          description: createForm.description.trim() || 'Services rendered',
          quantity: 1,
          unit_price: Number(amountStr),
          total: Number(amountStr),
        }],
      }

      const response = await fetch('/api/agent/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const payload = (await response.json().catch(() => ({}))) as {
        queued?: boolean; approvalId?: string; error?: string
      }

      if (!response.ok) throw new Error(payload.error ?? 'Failed to create invoice')

      if (payload.queued) {
        toast('success', 'Invoice queued for approval.')
      } else {
        toast('success', 'Invoice created.')
      }

      setShowCreateModal(false)
      setCreateForm({ client_name: '', description: '', amount: '', due_date: '' })
      await loadInvoices()
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to create invoice')
    } finally {
      setIsCreating(false)
    }
  }

  function handleToggleExpand(id: string) {
    setExpandedId(prev => prev === id ? null : id)
  }

  function handleDragStart(event: DragStartEvent) {
    draggingRef.current = true
    setExpandedId(null)
    const inv = filtered.find(i => i.id === event.active.id)
    if (inv) setActiveInvoice(inv)
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event
    if (!over) return

    const activeId = active.id as string
    const overId = over.id as string

    // Determine the target section
    const targetSection = resolveTargetSection(overId, invoiceSectionLookup)
    if (!targetSection) return

    // Only allow drops on droppable sections
    const sectionDef = SECTIONS.find(s => s.key === targetSection)
    if (!sectionDef?.droppable) return

    // Get current visual section of the active item
    const currentSection = sectionOverrides.get(activeId) ?? (invoiceSectionLookup.get(activeId) || getSection(filtered.find(i => i.id === activeId)!))

    if (currentSection !== targetSection) {
      // Visually move the item to the target section
      setSectionOverrides(prev => {
        const next = new Map(prev)
        next.set(activeId, targetSection)
        return next
      })
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    draggingRef.current = false
    setActiveInvoice(null)

    const { active, over } = event
    // Clear visual overrides
    const overrideSection = sectionOverrides.get(active.id as string)
    setSectionOverrides(new Map())

    if (!over) return

    const overId = over.id as string
    const activeId = active.id as string

    // Determine target section from override (drag-over) or from where we dropped
    const targetSection = overrideSection ?? resolveTargetSection(overId, invoiceSectionLookup)
    if (!targetSection) return

    const targetStatus = SECTION_STATUS_MAP[targetSection]
    if (!targetStatus) return

    const invoice = filtered.find(i => i.id === activeId)
    if (!invoice) return

    // Don't mutate if already in this status
    const currentSection = getSection(invoice)
    if (currentSection === targetSection) return

    void mutateStatus(invoice.id, targetStatus)
  }

  function handleDragCancel() {
    draggingRef.current = false
    setActiveInvoice(null)
    setSectionOverrides(new Map())
  }

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (showCreateModal) setShowCreateModal(false)
        else if (expandedId) setExpandedId(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [expandedId, showCreateModal])

  if (isLoading) return <InvoiceSkeleton />

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <style>{`
          @keyframes bb-inv-section {
            from { opacity: 0; transform: translateY(6px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes bb-inv-row {
            from { opacity: 0; transform: translateX(-4px); }
            to { opacity: 1; transform: translateX(0); }
          }
          @keyframes bb-inv-detail-enter {
            from { opacity: 0; transform: translateY(-4px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .bb-inv-row:hover .bb-inv-quick-actions { opacity: 1 !important; }
        `}</style>

        <InvoiceSummaryBar {...stats} />

        {/* Toolbar: Search + Stats + Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <IconSearch
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              className="bb-glass-input"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search invoices..."
              style={{
                width: '100%', padding: '12px 16px 12px 36px', borderRadius: 12,
                fontSize: 14, transition: `background 80ms ${SNAP}`,
              }}
            />
          </div>

          {/* Inline stats */}
          {allInvoices.length > 0 && (
            <span style={{ fontSize: 14, color: 'var(--text-dim)', whiteSpace: 'nowrap', flexShrink: 0 }}>
              {allInvoices.length} invoice{allInvoices.length !== 1 ? 's' : ''}
            </span>
          )}

          {/* Group mode toggle */}
          <button
            onClick={() => setGroupMode(m => m === 'status' ? 'client' : 'status')}
            title={groupMode === 'status' ? 'Group by client' : 'Group by status'}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 36, height: 36, borderRadius: 12, cursor: 'pointer',
              border: 'none',
              background: groupMode === 'client' ? 'rgba(255, 255, 255, 0.08)' : 'var(--glass-interactive-bg)',
              color: groupMode === 'client' ? 'var(--text-primary, #F1F5F9)' : 'var(--text-dim)',
              transition: `all 80ms ${SNAP}`,
            }}
          >
            {groupMode === 'status' ? <IconUsers size={16} /> : <IconLayoutList size={16} />}
          </button>

          <button
            onClick={() => exportCsv(filtered)}
            title="Export CSV"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 36, height: 36, borderRadius: 12, cursor: 'pointer',
              border: 'none', background: 'var(--glass-interactive-bg)',
              color: 'var(--text-dim)', transition: `all 80ms ${SNAP}`,
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--glass-hover-bg)'
              e.currentTarget.style.color = 'var(--text-secondary)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'var(--glass-interactive-bg)'
              e.currentTarget.style.color = 'var(--text-dim)'
            }}
          >
            <IconDownload size={16} />
          </button>

          {/* New Invoice CTA */}
          <button
            onClick={() => setShowCreateModal(true)}
            title="New invoice"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              height: 36, padding: '0 16px', borderRadius: 12, cursor: 'pointer',
              border: 'none', background: 'var(--btn-primary-bg, #F1F5F9)',
              color: 'var(--btn-primary-fg, #0a0f1a)', fontSize: 14, fontWeight: 500,
              transition: `all 80ms ${SNAP}`, whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--btn-primary-hover, #E2E8F0)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'var(--btn-primary-bg, #F1F5F9)'
            }}
          >
            <IconPlus size={14} /> New
          </button>
        </div>

        {/* Content */}
        {filtered.length === 0 ? (
          <Empty>
            {!search && <EmptyMedia variant="icon"><IconReceipt size={20} /></EmptyMedia>}
            <EmptyTitle>{search ? 'No matching invoices' : 'No invoices yet'}</EmptyTitle>
            <EmptyDescription>{search ? 'Try a different search term.' : 'Ask BitBit to create an invoice in chat. Say something like "Invoice Dave for the website redesign at $2,500".'}</EmptyDescription>
            {!search && (
              <EmptyContent>
                <Button variant="outline" size="sm" onClick={() => window.dispatchEvent(new CustomEvent('bb-navigate', { detail: { tab: 'chat' } }))}>Create via chat</Button>
              </EmptyContent>
            )}
          </Empty>
        ) : groupMode === 'status' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {SECTIONS.map((s, i) => (
              <InvoiceSection
                key={s.key}
                sectionKey={s.key}
                label={s.label}
                accent={s.accent}
                invoices={grouped[s.key]}
                defaultOpen={s.defaultOpen}
                droppable={s.droppable}
                delay={i * 50}
                expandedId={expandedId}
                onToggleExpand={handleToggleExpand}
                onAction={(id, status) => void mutateStatus(id, status)}
                busyId={busyInvoiceId}
              />
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {clientGroups.map((g, i) => (
              <ClientGroupSection
                key={g.name}
                name={g.name}
                invoices={g.invoices}
                delay={i * 50}
                expandedId={expandedId}
                onToggleExpand={handleToggleExpand}
                onAction={(id, status) => void mutateStatus(id, status)}
                busyId={busyInvoiceId}
              />
            ))}
          </div>
        )}
      </div>

      <DragOverlay dropAnimation={{
        duration: 150,
        easing: SPRING,
      }}>
        {activeInvoice ? <DragGhost invoice={activeInvoice} /> : null}
      </DragOverlay>

      {/* ---- Create Invoice Dialog ---- */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Invoice</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="inv-client">Client Name</Label>
              <Input
                id="inv-client"
                value={createForm.client_name}
                onChange={e => setCreateForm(f => ({ ...f, client_name: e.target.value }))}
                placeholder="e.g. Acme Corp"
                autoFocus
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="inv-desc">Description</Label>
              <Input
                id="inv-desc"
                value={createForm.description}
                onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))}
                placeholder="e.g. Website redesign -- March 2026"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="inv-amount">Amount (AUD)</Label>
                <Input
                  id="inv-amount"
                  value={createForm.amount}
                  onChange={e => {
                    const val = e.target.value
                    if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) {
                      setCreateForm(f => ({ ...f, amount: val }))
                    }
                  }}
                  placeholder="0.00"
                  inputMode="decimal"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="inv-due">Due Date</Label>
                <Input
                  id="inv-due"
                  type="date"
                  value={createForm.due_date}
                  onChange={e => setCreateForm(f => ({ ...f, due_date: e.target.value }))}
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateModal(false)} disabled={isCreating}>
              Cancel
            </Button>
            <Button
              onClick={() => void handleCreateInvoice()}
              disabled={isCreating || !createForm.client_name.trim() || !createForm.amount.trim()}
            >
              {isCreating ? <IconLoader2 size={14} className="animate-spin" /> : <IconPlus size={14} />}
              {isCreating ? 'Creating...' : 'Create Invoice'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DndContext>
  )
}
