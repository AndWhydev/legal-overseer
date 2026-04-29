import { describe, it, expect } from 'vitest'
import {
  buildModeBriefing,
  formatModeBriefingHtml,
  formatModeBriefingText,
  type BriefingSnapshot,
} from '../mode-briefing'

const FROZEN_TIME = 1_761_900_000_000

describe('buildModeBriefing — sections & ordering', () => {
  it('returns 4 sections in canonical chat → inbox → work → money order', () => {
    const b = buildModeBriefing({}, FROZEN_TIME)
    expect(b.sections.map(s => s.mode)).toEqual(['chat', 'inbox', 'work', 'money'])
  })

  it('every section has a Title-Cased title matching the mode', () => {
    const b = buildModeBriefing({}, FROZEN_TIME)
    expect(b.sections.map(s => s.title)).toEqual(['Chat', 'Inbox', 'Work', 'Money'])
  })

  it('an empty snapshot produces 4 empty sections and totalItems = 0', () => {
    const b = buildModeBriefing({}, FROZEN_TIME)
    for (const s of b.sections) {
      expect(s.items).toEqual([])
      expect(s.isEmpty).toBe(true)
    }
    expect(b.totalItems).toBe(0)
  })

  it('treats undefined/0/negative counts as empty', () => {
    const snapshot: BriefingSnapshot = {
      unreadMessages: 0,
      pendingApprovals: -1,
      overdueTasks: undefined,
    }
    const b = buildModeBriefing(snapshot, FROZEN_TIME)
    expect(b.totalItems).toBe(0)
    expect(b.sections.every(s => s.isEmpty)).toBe(true)
  })

  it('records generatedAt verbatim', () => {
    const b = buildModeBriefing({}, FROZEN_TIME)
    expect(b.generatedAt).toBe(FROZEN_TIME)
  })
})

describe('buildModeBriefing — per-mode mapping', () => {
  it('routes pendingApprovals into the Chat section', () => {
    const b = buildModeBriefing({ pendingApprovals: 2 }, FROZEN_TIME)
    expect(b.sections[0].items).toEqual([{ count: 2, label: 'pending approvals' }])
    expect(b.sections.slice(1).every(s => s.isEmpty)).toBe(true)
  })

  it('routes unreadMessages into the Inbox section', () => {
    const b = buildModeBriefing({ unreadMessages: 1 }, FROZEN_TIME)
    expect(b.sections[1].items).toEqual([{ count: 1, label: 'unread message' }])
  })

  it('routes overdueTasks + tasksDueToday into the Work section', () => {
    const b = buildModeBriefing({ overdueTasks: 3, tasksDueToday: 1 }, FROZEN_TIME)
    const work = b.sections[2]
    expect(work.items).toEqual([
      { count: 3, label: 'overdue tasks' },
      { count: 1, label: 'task due today' },
    ])
  })

  it('routes overdueInvoices + unpaidInvoices into the Money section, deduplicated', () => {
    // unpaid (5) is a superset of overdue (2): the user has 2 overdue and
    // 3 unpaid-but-not-yet-overdue. Total surfaced count must be 5, not 7.
    const b = buildModeBriefing({ overdueInvoices: 2, unpaidInvoices: 5 }, FROZEN_TIME)
    const money = b.sections[3]
    expect(money.items.map(i => i.label)).toEqual(['overdue invoices', 'unpaid invoices'])
    expect(money.items.map(i => i.count)).toEqual([2, 3])
    expect(b.totalItems).toBe(5)
  })

  it('omits the unpaid item entirely when overdue >= unpaid (caller passed inconsistent counts)', () => {
    const b = buildModeBriefing({ overdueInvoices: 5, unpaidInvoices: 5 }, FROZEN_TIME)
    const money = b.sections[3]
    expect(money.items.map(i => i.label)).toEqual(['overdue invoices'])
    expect(money.items.map(i => i.count)).toEqual([5])
  })

  it('attaches outstanding-amount detail to the last money item', () => {
    const b = buildModeBriefing(
      { overdueInvoices: 2, totalUnpaidAmount: 2400.5, totalUnpaidCurrency: 'AUD' },
      FROZEN_TIME,
    )
    const money = b.sections[3]
    expect(money.items[money.items.length - 1].detail).toBe('AUD 2,400.50 outstanding')
  })

  it('defaults the outstanding-amount currency to AUD when omitted', () => {
    const b = buildModeBriefing(
      { overdueInvoices: 1, totalUnpaidAmount: 100 },
      FROZEN_TIME,
    )
    expect(b.sections[3].items[0].detail).toBe('AUD 100.00 outstanding')
  })

  it('does not attach an outstanding amount when there are no money items', () => {
    const b = buildModeBriefing({ totalUnpaidAmount: 9999, totalUnpaidCurrency: 'USD' }, FROZEN_TIME)
    expect(b.sections[3].items).toEqual([])
  })
})

describe('buildModeBriefing — pluralisation', () => {
  it.each([
    [1, 'pending approval'],
    [2, 'pending approvals'],
    [99, 'pending approvals'],
  ])('pendingApprovals=%i → "%s"', (count, label) => {
    const b = buildModeBriefing({ pendingApprovals: count }, FROZEN_TIME)
    expect(b.sections[0].items[0].label).toBe(label)
  })

  it.each([
    [1, 'unread message'],
    [2, 'unread messages'],
  ])('unreadMessages=%i → "%s"', (count, label) => {
    const b = buildModeBriefing({ unreadMessages: count }, FROZEN_TIME)
    expect(b.sections[1].items[0].label).toBe(label)
  })

  it.each([
    [1, 'overdue task'],
    [2, 'overdue tasks'],
  ])('overdueTasks=%i → "%s"', (count, label) => {
    const b = buildModeBriefing({ overdueTasks: count }, FROZEN_TIME)
    expect(b.sections[2].items[0].label).toBe(label)
  })

  it.each([
    [1, 'task due today'],
    [2, 'tasks due today'],
  ])('tasksDueToday=%i → "%s"', (count, label) => {
    const b = buildModeBriefing({ tasksDueToday: count }, FROZEN_TIME)
    expect(b.sections[2].items[0].label).toBe(label)
  })
})

describe('buildModeBriefing — totalItems', () => {
  it('sums every items count across sections', () => {
    const b = buildModeBriefing(
      { unreadMessages: 5, pendingApprovals: 2, overdueTasks: 3, unpaidInvoices: 1 },
      FROZEN_TIME,
    )
    expect(b.totalItems).toBe(11)
  })
})

describe('formatModeBriefingText', () => {
  it('returns the all-clear sentinel when totalItems is 0', () => {
    const b = buildModeBriefing({}, FROZEN_TIME)
    expect(formatModeBriefingText(b)).toBe("You're all caught up — nothing on the boards.")
  })

  it('hides empty sections by default', () => {
    const b = buildModeBriefing({ unreadMessages: 3 }, FROZEN_TIME)
    const txt = formatModeBriefingText(b)
    expect(txt).toContain('Inbox')
    expect(txt).not.toContain('Chat')
    expect(txt).not.toContain('Work')
    expect(txt).not.toContain('Money')
  })

  it('includes empty sections with "all clear" when hideEmpty=false', () => {
    const b = buildModeBriefing({ unreadMessages: 1 }, FROZEN_TIME)
    const txt = formatModeBriefingText(b, { hideEmpty: false })
    expect(txt).toContain('Chat\n  · all clear')
    expect(txt).toContain('Money\n  · all clear')
  })

  it('renders bullets with two-space indentation', () => {
    const b = buildModeBriefing({ unreadMessages: 4 }, FROZEN_TIME)
    expect(formatModeBriefingText(b)).toContain('  · 4 unread messages')
  })

  it('includes detail in parens when present', () => {
    const b = buildModeBriefing(
      { overdueInvoices: 1, totalUnpaidAmount: 500 },
      FROZEN_TIME,
    )
    expect(formatModeBriefingText(b)).toContain('(AUD 500.00 outstanding)')
  })

  it('prefixes with the greeting when provided', () => {
    const b = buildModeBriefing({ unreadMessages: 1 }, FROZEN_TIME)
    const txt = formatModeBriefingText(b, { greeting: 'Good morning, Tor' })
    expect(txt.startsWith('Good morning, Tor\n\n')).toBe(true)
  })

  it('does not leave a trailing blank line', () => {
    const b = buildModeBriefing({ unreadMessages: 1, overdueTasks: 1 }, FROZEN_TIME)
    expect(formatModeBriefingText(b).endsWith('\n')).toBe(false)
  })
})

describe('formatModeBriefingHtml', () => {
  it('returns the all-clear sentinel when totalItems is 0 (apostrophe HTML-escaped)', () => {
    const b = buildModeBriefing({}, FROZEN_TIME)
    const html = formatModeBriefingHtml(b)
    expect(html).toContain('all caught up')
    expect(html).toContain('You&#39;re')
  })

  it('renders one h3 per non-empty section by default', () => {
    const b = buildModeBriefing({ unreadMessages: 1, overdueTasks: 1 }, FROZEN_TIME)
    const html = formatModeBriefingHtml(b)
    expect(html).toContain('<h3>Inbox</h3>')
    expect(html).toContain('<h3>Work</h3>')
    expect(html).not.toContain('<h3>Chat</h3>')
    expect(html).not.toContain('<h3>Money</h3>')
  })

  it('escapes HTML in the greeting', () => {
    const b = buildModeBriefing({ unreadMessages: 1 }, FROZEN_TIME)
    const html = formatModeBriefingHtml(b, { greeting: '<script>alert(1)</script>' })
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>alert')
  })

  it('renders the count inside <strong>', () => {
    const b = buildModeBriefing({ overdueTasks: 7 }, FROZEN_TIME)
    expect(formatModeBriefingHtml(b)).toContain('<strong>7</strong>')
  })
})
