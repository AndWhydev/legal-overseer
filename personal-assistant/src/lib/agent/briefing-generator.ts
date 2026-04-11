import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BriefingData {
  generatedAt: string
  orgId: string
  sections: BriefingSection[]
  summary: BriefingSummary
}

export interface BriefingSummary {
  totalActionItems: number
  overdueInvoiceTotal: number
  pipelineValue: number
  pendingApprovals: number
  relationshipAlerts: number
  upcomingEvents: number
  recentLeads: number
}

export interface BriefingSection {
  key: string
  title: string
  emoji: string
  items: BriefingItem[]
  metric?: string | number
}

export interface BriefingItem {
  label: string
  detail?: string
  urgency?: 'critical' | 'high' | 'normal' | 'low'
}

// ─── Generator ───────────────────────────────────────────────────────────────

/**
 * Generate a comprehensive Monday Morning Briefing for an organization.
 * Queries across calendar, invoices, pipeline, approvals, contacts, and leads.
 */
export async function generateMondayBriefing(
  supabase: SupabaseClient,
  orgId: string,
): Promise<BriefingData> {
  const [
    calendarSection,
    overdueSection,
    pipelineSection,
    approvalsSection,
    relationshipSection,
    leadsSection,
    suggestedActionsSection,
  ] = await Promise.all([
    fetchUpcomingEvents(supabase, orgId),
    fetchOverdueInvoices(supabase, orgId),
    fetchPipelineValue(supabase, orgId),
    fetchPendingApprovals(supabase, orgId),
    fetchRelationshipAlerts(supabase, orgId),
    fetchRecentLeads(supabase, orgId),
    fetchSuggestedActions(supabase, orgId),
  ])

  const sections = [
    calendarSection,
    overdueSection,
    pipelineSection,
    approvalsSection,
    suggestedActionsSection,
    relationshipSection,
    leadsSection,
  ]

  const summary: BriefingSummary = {
    totalActionItems:
      overdueSection.items.length +
      approvalsSection.items.length +
      relationshipSection.items.length +
      suggestedActionsSection.items.length,
    overdueInvoiceTotal: parseFloat(overdueSection.metric?.toString() ?? '0'),
    pipelineValue: parseFloat(pipelineSection.metric?.toString() ?? '0'),
    pendingApprovals: approvalsSection.items.length,
    relationshipAlerts: relationshipSection.items.length,
    upcomingEvents: calendarSection.items.length,
    recentLeads: leadsSection.items.length,
  }

  return {
    generatedAt: new Date().toISOString(),
    orgId,
    sections,
    summary,
  }
}

// ─── WhatsApp Formatter ──────────────────────────────────────────────────────

/**
 * Format briefing data as WhatsApp-friendly text with sections and status emojis.
 */
export function formatBriefingWhatsApp(briefing: BriefingData): string {
  const lines: string[] = [
    '*Monday Morning Briefing*',
    `_${new Date(briefing.generatedAt).toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}_`,
    '',
  ]

  // Quick summary line
  const s = briefing.summary
  lines.push(`*Quick Summary:* ${s.totalActionItems} action items | $${formatCurrency(s.pipelineValue)} pipeline | ${s.upcomingEvents} events this week`)
  lines.push('')

  for (const section of briefing.sections) {
    if (section.items.length === 0) continue

    lines.push(`${section.emoji} *${section.title}*`)
    if (section.metric !== undefined) {
      lines.push(`   Total: ${typeof section.metric === 'number' ? '$' + formatCurrency(section.metric) : section.metric}`)
    }

    for (const item of section.items.slice(0, 5)) {
      const urgencyDot = item.urgency === 'critical' ? '!!' :
                         item.urgency === 'high' ? '!' : ''
      const detail = item.detail ? ` -- ${item.detail}` : ''
      lines.push(`  - ${urgencyDot}${item.label}${detail}`)
    }

    if (section.items.length > 5) {
      lines.push(`  _...and ${section.items.length - 5} more_`)
    }
    lines.push('')
  }

  if (s.totalActionItems === 0) {
    lines.push('All clear, nothing urgent this morning.')
    lines.push('')
  }

  lines.push('_Reply "briefing" anytime for an updated snapshot._')
  return lines.join('\n')
}

// ─── Email HTML Formatter ────────────────────────────────────────────────────

/**
 * Format briefing data as styled HTML for email delivery.
 */
export function formatBriefingEmail(briefing: BriefingData): { subject: string; html: string } {
  const dateStr = new Date(briefing.generatedAt).toLocaleDateString('en-AU', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })
  const s = briefing.summary

  const sectionHtml = briefing.sections
    .filter(sec => sec.items.length > 0)
    .map(sec => {
      const metricLine = sec.metric !== undefined
        ? `<span style="float: right; font-weight: 600; color: #007bff;">${typeof sec.metric === 'number' ? '$' + formatCurrency(sec.metric) : sec.metric}</span>`
        : ''

      const itemRows = sec.items.slice(0, 10).map(item => {
        const urgencyColor = item.urgency === 'critical' ? '#dc2626' :
                             item.urgency === 'high' ? '#ea580c' : '#333'
        return `<tr>
          <td style="padding: 6px 12px; border-bottom: 1px solid #f0f0f0; color: ${urgencyColor};">
            ${item.label}
          </td>
          <td style="padding: 6px 12px; border-bottom: 1px solid #f0f0f0; color: #666; text-align: right;">
            ${item.detail ?? ''}
          </td>
        </tr>`
      }).join('')

      const moreRow = sec.items.length > 10
        ? `<tr><td colspan="2" style="padding: 6px 12px; color: #999; font-style: italic;">...and ${sec.items.length - 10} more</td></tr>`
        : ''

      return `
        <div style="margin-bottom: 24px;">
          <h3 style="margin: 0 0 8px 0; font-size: 16px; color: #1a1a1a;">
            ${sec.emoji} ${sec.title} ${metricLine}
          </h3>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            ${itemRows}
            ${moreRow}
          </table>
        </div>
      `
    })
    .join('')

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
      <h1 style="font-size: 22px; margin-bottom: 4px; color: #1a1a1a;">Monday Morning Briefing</h1>
      <p style="color: #666; margin-top: 0; margin-bottom: 20px;">${dateStr}</p>

      <div style="display: flex; gap: 12px; margin-bottom: 24px; flex-wrap: wrap;">
        ${summaryCard('Action Items', s.totalActionItems.toString(), s.totalActionItems > 0 ? '#ea580c' : '#22c55e')}
        ${summaryCard('Pipeline', '$' + formatCurrency(s.pipelineValue), '#007bff')}
        ${summaryCard('Events', s.upcomingEvents.toString(), '#6366f1')}
        ${summaryCard('New Leads', s.recentLeads.toString(), '#22c55e')}
      </div>

      ${sectionHtml}

      <p style="color: #999; font-size: 12px; margin-top: 30px; border-top: 1px solid #eee; padding-top: 15px;">
        Automated briefing from Bitbit. View your full dashboard for details.
      </p>
    </div>
  `

  return {
    subject: `Bitbit Monday Briefing -- ${s.totalActionItems} action items, $${formatCurrency(s.pipelineValue)} pipeline`,
    html,
  }
}

// ─── Data Fetchers ───────────────────────────────────────────────────────────

async function fetchUpcomingEvents(
  supabase: SupabaseClient,
  orgId: string,
): Promise<BriefingSection> {
  try {
    const nextWeek = new Date()
    nextWeek.setDate(nextWeek.getDate() + 7)

    const { data } = await supabase
      .from('tasks')
      .select('title, due_date, priority')
      .eq('org_id', orgId)
      .in('status', ['pending', 'in_progress'])
      .not('due_date', 'is', null)
      .lte('due_date', nextWeek.toISOString())
      .order('due_date', { ascending: true })
      .limit(10)

    const items: BriefingItem[] = (data ?? []).map((t: Record<string, unknown>) => {
      const dueDate = t.due_date ? new Date(t.due_date as string).toLocaleDateString('en-AU', { weekday: 'short', month: 'short', day: 'numeric' }) : ''
      return {
        label: t.title as string,
        detail: dueDate,
        urgency: t.priority === 'critical' ? 'critical' as const :
                 t.priority === 'high' ? 'high' as const : 'normal' as const,
      }
    })

    return { key: 'events', title: 'This Week', emoji: '\u{1F4C5}', items }
  } catch (err) {
    logger.warn('[briefing] Failed to fetch upcoming events', { error: err })
    return { key: 'events', title: 'This Week', emoji: '\u{1F4C5}', items: [] }
  }
}

async function fetchOverdueInvoices(
  supabase: SupabaseClient,
  orgId: string,
): Promise<BriefingSection> {
  try {
    const { data } = await supabase
      .from('invoices')
      .select('invoice_number, total, client_contact_id, due_date, contacts(name)')
      .eq('org_id', orgId)
      .eq('status', 'overdue')
      .order('due_date', { ascending: true })
      .limit(10)

    const items: BriefingItem[] = (data ?? []).map((inv: Record<string, unknown>) => {
      const contact = inv.contacts as { name: string } | null
      const daysOverdue = inv.due_date
        ? Math.floor((Date.now() - new Date(inv.due_date as string).getTime()) / (1000 * 60 * 60 * 24))
        : 0
      return {
        label: `#${inv.invoice_number} -- ${contact?.name ?? 'Unknown'} -- $${inv.total}`,
        detail: daysOverdue > 0 ? `${daysOverdue}d overdue` : 'Due today',
        urgency: daysOverdue > 30 ? 'critical' as const :
                 daysOverdue > 7 ? 'high' as const : 'normal' as const,
      }
    })

    const total = (data ?? []).reduce((sum: number, inv: Record<string, unknown>) =>
      sum + (parseFloat(String(inv.total ?? 0))), 0)

    return { key: 'overdue', title: 'Overdue Invoices', emoji: '\u{1F534}', items, metric: total }
  } catch (err) {
    logger.warn('[briefing] Failed to fetch overdue invoices', { error: err })
    return { key: 'overdue', title: 'Overdue Invoices', emoji: '\u{1F534}', items: [], metric: 0 }
  }
}

async function fetchPipelineValue(
  supabase: SupabaseClient,
  orgId: string,
): Promise<BriefingSection> {
  try {
    const { data } = await supabase
      .from('leads')
      .select('company_name, estimated_value, score, stage')
      .eq('org_id', orgId)
      .in('stage', ['new', 'qualified', 'proposal', 'negotiation'])
      .order('estimated_value', { ascending: false, nullsFirst: false })
      .limit(10)

    const items: BriefingItem[] = (data ?? []).map((lead: Record<string, unknown>) => ({
      label: (lead.company_name as string) || 'Unknown',
      detail: lead.estimated_value ? `$${formatCurrency(lead.estimated_value as number)} (${lead.stage})` : (lead.stage as string),
      urgency: 'normal' as const,
    }))

    const total = (data ?? []).reduce((sum: number, lead: Record<string, unknown>) =>
      sum + (parseFloat(String(lead.estimated_value ?? 0))), 0)

    return { key: 'pipeline', title: 'Active Pipeline', emoji: '\u{1F4B0}', items, metric: total }
  } catch (err) {
    logger.warn('[briefing] Failed to fetch pipeline value', { error: err })
    return { key: 'pipeline', title: 'Active Pipeline', emoji: '\u{1F4B0}', items: [], metric: 0 }
  }
}

async function fetchPendingApprovals(
  supabase: SupabaseClient,
  orgId: string,
): Promise<BriefingSection> {
  try {
    const { data } = await supabase
      .from('approval_queue')
      .select('id, action_summary, agent_name, created_at')
      .eq('org_id', orgId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(10)

    const items: BriefingItem[] = (data ?? []).map((a: Record<string, unknown>) => ({
      label: a.action_summary as string,
      detail: a.agent_name as string,
      urgency: 'high' as const,
    }))

    return { key: 'approvals', title: 'Pending Approvals', emoji: '\u{23F3}', items }
  } catch (err) {
    logger.warn('[briefing] Failed to fetch pending approvals', { error: err })
    return { key: 'approvals', title: 'Pending Approvals', emoji: '\u{23F3}', items: [] }
  }
}

async function fetchRelationshipAlerts(
  supabase: SupabaseClient,
  orgId: string,
): Promise<BriefingSection> {
  try {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    // Find contacts with no recent messages/interactions
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, name, type, last_contacted_at')
      .eq('org_id', orgId)
      .in('type', ['client', 'lead'])
      .or(`last_contacted_at.is.null,last_contacted_at.lt.${thirtyDaysAgo.toISOString()}`)
      .order('last_contacted_at', { ascending: true, nullsFirst: true })
      .limit(10)

    const items: BriefingItem[] = (contacts ?? []).map((c: Record<string, unknown>) => {
      const lastContact = c.last_contacted_at
        ? new Date(c.last_contacted_at as string).toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })
        : 'Never'
      return {
        label: c.name as string,
        detail: `Last contact: ${lastContact} (${c.type})`,
        urgency: c.last_contacted_at === null ? 'high' as const : 'normal' as const,
      }
    })

    return { key: 'relationships', title: 'Relationship Alerts', emoji: '\u{1F465}', items }
  } catch (err) {
    logger.warn('[briefing] Failed to fetch relationship alerts', { error: err })
    return { key: 'relationships', title: 'Relationship Alerts', emoji: '\u{1F465}', items: [] }
  }
}

async function fetchRecentLeads(
  supabase: SupabaseClient,
  orgId: string,
): Promise<BriefingSection> {
  try {
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const { data } = await supabase
      .from('leads')
      .select('company_name, source, score, created_at')
      .eq('org_id', orgId)
      .gte('created_at', sevenDaysAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(10)

    const items: BriefingItem[] = (data ?? []).map((lead: Record<string, unknown>) => ({
      label: (lead.company_name as string) || 'Unknown',
      detail: `via ${lead.source || '?'} (score: ${lead.score ?? '?'})`,
      urgency: 'normal' as const,
    }))

    return { key: 'leads', title: 'Recent Leads (7 days)', emoji: '\u{1F525}', items }
  } catch (err) {
    logger.warn('[briefing] Failed to fetch recent leads', { error: err })
    return { key: 'leads', title: 'Recent Leads (7 days)', emoji: '\u{1F525}', items: [] }
  }
}

async function fetchSuggestedActions(
  supabase: SupabaseClient,
  orgId: string,
): Promise<BriefingSection> {
  const items: BriefingItem[] = []

  try {
    // 1. Overdue invoices that could be auto-chased
    const { data: overdueInvoices } = await supabase
      .from('invoices')
      .select('invoice_number, total, due_date, contacts(name)')
      .eq('org_id', orgId)
      .eq('status', 'overdue')
      .order('due_date', { ascending: true })
      .limit(3)

    for (const inv of overdueInvoices ?? []) {
      const contact = (inv as Record<string, unknown>).contacts as { name: string } | null
      const daysOverdue = inv.due_date
        ? Math.floor((Date.now() - new Date(inv.due_date).getTime()) / (1000 * 60 * 60 * 24))
        : 0
      if (daysOverdue >= 3) {
        items.push({
          label: `Chase invoice #${inv.invoice_number} (${contact?.name ?? 'Unknown'}, $${inv.total})`,
          detail: `${daysOverdue}d overdue -- reply "chase" to send reminder`,
          urgency: daysOverdue > 14 ? 'critical' : 'high',
        })
      }
    }

    // 2. Stale leads that need follow-up
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
    const { data: staleLeads } = await supabase
      .from('leads')
      .select('company_name, stage, updated_at')
      .eq('org_id', orgId)
      .in('stage', ['new', 'qualified'])
      .lt('updated_at', threeDaysAgo)
      .order('updated_at', { ascending: true })
      .limit(3)

    for (const lead of staleLeads ?? []) {
      const daysSince = Math.floor((Date.now() - new Date(lead.updated_at).getTime()) / (1000 * 60 * 60 * 24))
      items.push({
        label: `Follow up with ${lead.company_name || 'Unknown'} (${lead.stage})`,
        detail: `${daysSince}d since last activity`,
        urgency: daysSince > 7 ? 'high' : 'normal',
      })
    }

    // 3. Proposals that need sending
    const { data: draftProposals } = await supabase
      .from('proposals')
      .select('id, title, contacts(name)')
      .eq('org_id', orgId)
      .eq('status', 'draft')
      .order('created_at', { ascending: true })
      .limit(3)

    for (const prop of draftProposals ?? []) {
      const contact = (prop as Record<string, unknown>).contacts as { name: string } | null
      items.push({
        label: `Send draft proposal: ${prop.title ?? 'Untitled'}`,
        detail: contact?.name ?? '',
        urgency: 'normal',
      })
    }
  } catch (err) {
    logger.warn('[briefing] Failed to fetch suggested actions', { error: err })
  }

  return { key: 'actions', title: 'Suggested Actions', emoji: '\u{26A1}', items }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  return value.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function summaryCard(label: string, value: string, color: string): string {
  return `
    <div style="flex: 1; min-width: 120px; background: #f9fafb; border-radius: 8px; padding: 12px; text-align: center; border-top: 3px solid ${color};">
      <div style="font-size: 22px; font-weight: 700; color: ${color};">${value}</div>
      <div style="font-size: 12px; color: #666; margin-top: 4px;">${label}</div>
    </div>
  `
}
