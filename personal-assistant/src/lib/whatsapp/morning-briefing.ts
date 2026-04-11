import type { SupabaseClient } from '@supabase/supabase-js'
import { sendMessage } from '../channels/whatsapp'
import { getPendingApprovals } from '../agent/approval-queue'
import {
  getRecentDelegatedActions,
  type DelegationActionEntry,
} from '../agent/delegation-mandate'
import { formatResponse, type BriefingSection } from './response-formatter'

export interface BriefingConfig {
  timezone?: string
  includeLeads?: boolean
  includeInvoices?: boolean
  includeTasks?: boolean
  includeApprovals?: boolean
  includeDelegatedActions?: boolean
}

/**
 * Generate a morning briefing message for WhatsApp delivery.
 * Queries overdue tasks, new leads, pending approvals, and invoice status.
 */
export async function generateMorningBriefing(
  supabase: SupabaseClient,
  orgId: string,
  config: BriefingConfig = {}
): Promise<string> {
  const includeAll = !config.includeLeads && !config.includeInvoices && !config.includeTasks && !config.includeApprovals && !config.includeDelegatedActions

  const sections: BriefingSection[] = []

  // Pending approvals
  if (includeAll || config.includeApprovals) {
    const items = await fetchPendingApprovalItems(supabase, orgId)
    sections.push({ emoji: '⏳', title: 'Pending Approvals', items, showEmpty: false })
  }

  // Overdue invoices
  if (includeAll || config.includeInvoices) {
    const items = await fetchOverdueInvoiceItems(supabase, orgId)
    sections.push({ emoji: '🔴', title: 'Overdue Invoices', items, showEmpty: false })
  }

  // New leads (last 24h)
  if (includeAll || config.includeLeads) {
    const items = await fetchRecentLeadItems(supabase, orgId)
    sections.push({ emoji: '🔥', title: 'New Leads', items, showEmpty: false })
  }

  // High-priority tasks
  if (includeAll || config.includeTasks) {
    const items = await fetchHighPriorityTaskItems(supabase, orgId)
    sections.push({ emoji: '📋', title: "Today's Priorities", items, showEmpty: true })
  }

  // Delegated actions (what BitBit did autonomously overnight)
  if (includeAll || config.includeDelegatedActions) {
    const items = await fetchDelegatedActionItems(supabase, orgId)
    sections.push({ emoji: '🤖', title: 'What I Did Autonomously', items, showEmpty: false })
  }

  return formatResponse.morningBriefing(sections)
}

/**
 * Generate and send the morning briefing via WhatsApp.
 */
export async function sendMorningBriefing(
  supabase: SupabaseClient,
  orgId: string,
  recipientPhone: string,
  config: BriefingConfig = {}
): Promise<{ sent: boolean; sections: number }> {
  const message = await generateMorningBriefing(supabase, orgId, config)
  const messageId = await sendMessage(recipientPhone, message)
  const sectionCount = message.split('*').length // Rough proxy

  return { sent: messageId !== null, sections: sectionCount }
}

async function fetchPendingApprovalItems(
  supabase: SupabaseClient,
  orgId: string
): Promise<string[]> {
  try {
    const approvals = await getPendingApprovals(supabase, orgId, { limit: 5 })
    return approvals.map((a) => {
      const agent = a.agent_name ?? 'Agent'
      return `${agent}: ${a.action_summary}`
    })
  } catch {
    return []
  }
}

async function fetchOverdueInvoiceItems(
  supabase: SupabaseClient,
  orgId: string
): Promise<string[]> {
  try {
    const { data } = await supabase
      .from('invoices')
      .select('invoice_number, total, client_contact_id, contacts(name)')
      .eq('org_id', orgId)
      .eq('status', 'overdue')
      .order('due_date', { ascending: true })
      .limit(5)

    if (!data) return []

    return data.map((inv: Record<string, unknown>) => {
      const contact = inv.contacts as { name: string } | null
      const name = contact?.name ?? 'Unknown'
      return `#${inv.invoice_number} — ${name} — $${inv.total}`
    })
  } catch {
    return []
  }
}

async function fetchRecentLeadItems(
  supabase: SupabaseClient,
  orgId: string
): Promise<string[]> {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    // Try leads table first
    const { data: leads } = await supabase
      .from('leads')
      .select('company_name, source, score')
      .eq('org_id', orgId)
      .gte('created_at', since)
      .order('score', { ascending: false })
      .limit(5)

    if (leads?.length) {
      return leads.map((l: Record<string, unknown>) =>
        `${l.company_name || 'Unknown'} via ${l.source || '?'} (score: ${l.score || '?'})`
      )
    }

    // Fallback: contacts with type=lead
    const { data: contacts } = await supabase
      .from('contacts')
      .select('name, type')
      .eq('org_id', orgId)
      .eq('type', 'lead')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(5)

    if (!contacts) return []
    return contacts.map((c: Record<string, unknown>) => c.name as string)
  } catch {
    return []
  }
}

async function fetchHighPriorityTaskItems(
  supabase: SupabaseClient,
  orgId: string
): Promise<string[]> {
  try {
    const { data } = await supabase
      .from('tasks')
      .select('title, priority')
      .eq('org_id', orgId)
      .in('status', ['pending', 'in_progress'])
      .in('priority', ['critical', 'high'])
      .order('priority', { ascending: true })
      .limit(5)

    if (!data) return []

    return data.map((t: Record<string, unknown>) => {
      const emoji = t.priority === 'critical' ? '🔴' : '🟠'
      return `${emoji} ${t.title}`
    })
  } catch {
    return []
  }
}

/**
 * Fetch delegated actions from the last 24 hours, formatted for the briefing.
 * Groups by entity and includes financial impact when present.
 */
export async function fetchDelegatedActionItems(
  supabase: SupabaseClient,
  orgId: string
): Promise<string[]> {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const actions = await getRecentDelegatedActions(supabase, orgId, since)

    if (actions.length === 0) return []

    // Group actions by entity_id
    const byEntity = new Map<string, DelegationActionEntry[]>()
    for (const action of actions) {
      const group = byEntity.get(action.entity_id) ?? []
      group.push(action)
      byEntity.set(action.entity_id, group)
    }

    // Resolve entity names and format each group
    const items: string[] = []
    for (const [entityId, entityActions] of byEntity) {
      const { data: entity } = await supabase
        .from('entity_nodes')
        .select('name')
        .eq('id', entityId)
        .single()

      const entityName = entity?.name ?? entityId

      // Calculate financial impact for this entity
      let totalFinancial = 0
      for (const action of entityActions) {
        if (action.financial_impact) {
          const amount = (action.financial_impact as Record<string, unknown>).amount
          if (typeof amount === 'number') totalFinancial += amount
        }
      }

      if (entityActions.length === 1) {
        const a = entityActions[0]
        let line = `${entityName}: ${a.action_summary}`
        if (totalFinancial !== 0) {
          line += ` ($${Math.abs(totalFinancial).toLocaleString()})`
        }
        items.push(line)
      } else {
        let line = `${entityName}: ${entityActions.length} actions`
        if (totalFinancial !== 0) {
          line += ` ($${Math.abs(totalFinancial).toLocaleString()} total)`
        }
        items.push(line)
        // Add sub-items (up to 3)
        for (const a of entityActions.slice(0, 3)) {
          items.push(`  ↳ ${a.action_summary}`)
        }
        if (entityActions.length > 3) {
          items.push(`  ↳ ...and ${entityActions.length - 3} more`)
        }
      }
    }

    return items
  } catch {
    return []
  }
}
