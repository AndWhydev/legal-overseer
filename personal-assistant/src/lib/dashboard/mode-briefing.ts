/**
 * mode-briefing.ts — Mode-shaped daily briefing builder.
 *
 * Existing crons (`/api/cron/morning-briefing`, `/api/cron/daily-digest`) emit
 * a flat list of items: pending approvals, overdue invoices, tasks, etc.
 * This module reshapes the same data by *mode* — Chat / Inbox / Work / Money —
 * so the digest mirrors how the user thinks about their day.
 *
 * Pure: takes a `BriefingSnapshot` (counts only, no DB access) and returns a
 * structured `ModeBriefing` plus text/html formatters. Existing cron callers
 * collect counts via their existing primitives, then call `buildModeBriefing`.
 *
 * Hide the machinery: the user sees "Inbox · 3 unread messages", never any
 * internal queue/category names.
 */

import type { Mode } from './mode-store'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BriefingSnapshot {
  /** Unread inbound messages across all channels (inbox-mode bucket). */
  unreadMessages?: number
  /** Approvals waiting for the user (chat-mode bucket — needs the assistant). */
  pendingApprovals?: number
  /** Tasks past their due date (work-mode bucket). */
  overdueTasks?: number
  /** Tasks due today, not yet done (work-mode bucket). */
  tasksDueToday?: number
  /** Invoices past due (money-mode bucket). */
  overdueInvoices?: number
  /**
   * Total unpaid invoices including overdue ones. The builder subtracts
   * `overdueInvoices` before display to avoid double-counting — pass the raw
   * total here (matches `getPortalDashboardStats`, which counts
   * status IN ['sent','viewed','overdue']).
   */
  unpaidInvoices?: number
  /** Optional total currency owed across unpaid+overdue invoices. */
  totalUnpaidAmount?: number
  /** ISO 4217 currency code, defaults to 'AUD' when amount is given without one. */
  totalUnpaidCurrency?: string
}

export interface BriefingItem {
  /** Human-readable label, already pluralised. */
  label: string
  count: number
  /** Optional secondary fragment shown in parens (e.g. "AUD 2,400 outstanding"). */
  detail?: string
}

export interface ModeBriefingSection {
  mode: Mode
  /** Title shown above the section ("Chat", "Inbox", "Work", "Money"). */
  title: string
  items: BriefingItem[]
  /** True when the section has no surfaced items. */
  isEmpty: boolean
}

export interface ModeBriefing {
  /** Sections in canonical order: chat → inbox → work → money. */
  sections: ModeBriefingSection[]
  /** Sum of all `count` values across every section. 0 means "all caught up". */
  totalItems: number
  /** Epoch ms — useful for cache busting / "as of" labels. */
  generatedAt: number
}

const SECTION_ORDER: Array<{ mode: Mode; title: string }> = [
  { mode: 'chat', title: 'Chat' },
  { mode: 'inbox', title: 'Inbox' },
  { mode: 'work', title: 'Work' },
  { mode: 'money', title: 'Money' },
]

// ─── Builder ──────────────────────────────────────────────────────────────────

/**
 * Reshape a `BriefingSnapshot` into per-mode sections.
 *
 * Counts that map naturally:
 *   - chat   → pending approvals (needs the assistant's attention)
 *   - inbox  → unread messages
 *   - work   → overdue tasks + tasks due today
 *   - money  → overdue + unpaid invoices, with optional outstanding amount detail
 *
 * Zero counts are omitted from the section's `items` array (so a section can
 * be empty). The total stays accurate regardless of formatter choices later.
 */
export function buildModeBriefing(
  snapshot: BriefingSnapshot,
  generatedAt: number = Date.now(),
): ModeBriefing {
  const itemsByMode: Record<Mode, BriefingItem[]> = {
    chat: [],
    inbox: [],
    work: [],
    money: [],
  }

  if (n(snapshot.pendingApprovals) > 0) {
    itemsByMode.chat.push({
      label: pluralise(snapshot.pendingApprovals!, 'pending approval', 'pending approvals'),
      count: snapshot.pendingApprovals!,
    })
  }

  if (n(snapshot.unreadMessages) > 0) {
    itemsByMode.inbox.push({
      label: pluralise(snapshot.unreadMessages!, 'unread message', 'unread messages'),
      count: snapshot.unreadMessages!,
    })
  }

  if (n(snapshot.overdueTasks) > 0) {
    itemsByMode.work.push({
      label: pluralise(snapshot.overdueTasks!, 'overdue task', 'overdue tasks'),
      count: snapshot.overdueTasks!,
    })
  }
  if (n(snapshot.tasksDueToday) > 0) {
    itemsByMode.work.push({
      label: snapshot.tasksDueToday === 1 ? 'task due today' : 'tasks due today',
      count: snapshot.tasksDueToday!,
    })
  }

  // Unpaid is a superset of overdue per the contract — subtract to avoid
  // double-counting "5 unpaid" + "2 overdue" when the 2 overdue are already
  // part of the 5 unpaid total.
  const overdueInvoiceCount = n(snapshot.overdueInvoices)
  const unpaidNotOverdueCount = Math.max(0, n(snapshot.unpaidInvoices) - overdueInvoiceCount)
  if (overdueInvoiceCount > 0) {
    itemsByMode.money.push({
      label: pluralise(overdueInvoiceCount, 'overdue invoice', 'overdue invoices'),
      count: overdueInvoiceCount,
    })
  }
  if (unpaidNotOverdueCount > 0) {
    itemsByMode.money.push({
      label: pluralise(unpaidNotOverdueCount, 'unpaid invoice', 'unpaid invoices'),
      count: unpaidNotOverdueCount,
    })
  }
  if (
    itemsByMode.money.length > 0 &&
    typeof snapshot.totalUnpaidAmount === 'number' &&
    snapshot.totalUnpaidAmount > 0
  ) {
    const currency = snapshot.totalUnpaidCurrency ?? 'AUD'
    const last = itemsByMode.money[itemsByMode.money.length - 1]
    last.detail = `${currency} ${formatAmount(snapshot.totalUnpaidAmount)} outstanding`
  }

  const sections: ModeBriefingSection[] = SECTION_ORDER.map(({ mode, title }) => ({
    mode,
    title,
    items: itemsByMode[mode],
    isEmpty: itemsByMode[mode].length === 0,
  }))

  const totalItems = sections.reduce(
    (sum, s) => sum + s.items.reduce((acc, i) => acc + i.count, 0),
    0,
  )

  return { sections, totalItems, generatedAt }
}

// ─── Formatters ───────────────────────────────────────────────────────────────

export interface FormatOptions {
  /** Hide sections that have zero items. Default true. */
  hideEmpty?: boolean
  /** Optional greeting line at the top, e.g. "Good morning, Tor". */
  greeting?: string
}

const ALL_CLEAR = "You're all caught up — nothing on the boards."

/**
 * Plain-text format for chat / WhatsApp / iMessage delivery.
 * Uses two-space bullet indentation and blank lines between sections.
 */
export function formatModeBriefingText(b: ModeBriefing, opts: FormatOptions = {}): string {
  const { hideEmpty = true, greeting } = opts
  const lines: string[] = []
  if (greeting) {
    lines.push(greeting, '')
  }

  if (b.totalItems === 0) {
    lines.push(ALL_CLEAR)
    return lines.join('\n')
  }

  for (const section of b.sections) {
    if (hideEmpty && section.isEmpty) continue
    lines.push(section.title)
    if (section.items.length === 0) {
      lines.push('  · all clear')
    } else {
      for (const item of section.items) {
        const detail = item.detail ? ` (${item.detail})` : ''
        lines.push(`  · ${item.count} ${item.label}${detail}`)
      }
    }
    lines.push('')
  }

  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines.join('\n')
}

/**
 * Email-friendly HTML format. Inline-style-free apart from a muted span on the
 * detail fragment so it works in templated transactional email contexts.
 * All user-facing strings are HTML-escaped.
 */
export function formatModeBriefingHtml(b: ModeBriefing, opts: FormatOptions = {}): string {
  const { hideEmpty = true, greeting } = opts
  const parts: string[] = []
  parts.push('<div>')
  if (greeting) {
    parts.push(`<p>${escapeHtml(greeting)}</p>`)
  }

  if (b.totalItems === 0) {
    parts.push(`<p>${escapeHtml(ALL_CLEAR)}</p></div>`)
    return parts.join('')
  }

  for (const section of b.sections) {
    if (hideEmpty && section.isEmpty) continue
    parts.push(`<h3>${escapeHtml(section.title)}</h3><ul>`)
    if (section.items.length === 0) {
      parts.push('<li>all clear</li>')
    } else {
      for (const item of section.items) {
        const detail = item.detail
          ? ` <span style="color:#666"> (${escapeHtml(item.detail)})</span>`
          : ''
        parts.push(`<li><strong>${item.count}</strong> ${escapeHtml(item.label)}${detail}</li>`)
      }
    }
    parts.push('</ul>')
  }
  parts.push('</div>')
  return parts.join('')
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function n(v: number | undefined | null): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0
}

function pluralise(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural
}

function formatAmount(amount: number): string {
  // Two decimals + thousands separators. Currency symbol comes from caller.
  return amount
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
