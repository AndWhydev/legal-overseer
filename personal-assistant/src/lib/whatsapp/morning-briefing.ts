import type { SupabaseClient } from '@supabase/supabase-js'

export interface BriefingConfig {
  timezone?: string
  includeLeads?: boolean
  includeInvoices?: boolean
  includeTasks?: boolean
  includeApprovals?: boolean
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
  const sections: string[] = []
  const includeAll = !config.includeLeads && !config.includeInvoices && !config.includeTasks && !config.includeApprovals

  // Greeting
  const hour = new Date().getHours()
  const greeting = hour < 12 ? '☀️ Good morning' : hour < 17 ? '👋 Good afternoon' : '🌙 Good evening'
  sections.push(`${greeting}! Here's your BitBit briefing:\n`)

  // Overdue tasks
  if (includeAll || config.includeTasks) {
    const { data: overdue } = await supabase
      .from('tasks')
      .select('title, priority')
      .eq('org_id', orgId)
      .eq('status', 'pending')
      .in('priority', ['critical', 'high'])
      .order('priority', { ascending: true })
      .limit(5)

    if (overdue?.length) {
      const lines = overdue.map((t) => `  • ${t.title} (${t.priority})`)
      sections.push(`🔴 *${overdue.length} High-Priority Tasks*\n${lines.join('\n')}`)
    } else {
      sections.push('✅ *Tasks* — No critical items pending')
    }
  }

  // New leads (last 24h)
  if (includeAll || config.includeLeads) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: leads, count } = await supabase
      .from('leads')
      .select('company_name, source, score', { count: 'exact' })
      .eq('org_id', orgId)
      .gte('created_at', since)
      .order('score', { ascending: false })
      .limit(3)

    if (leads?.length) {
      const lines = leads.map((l) => `  • ${l.company_name || 'Unknown'} via ${l.source || '?'} (score: ${l.score || '?'})`)
      sections.push(`🔥 *${count || leads.length} New Lead${(count || leads.length) > 1 ? 's' : ''}*\n${lines.join('\n')}`)
    } else {
      sections.push('📭 *Leads* — No new leads overnight')
    }
  }

  // Pending approvals
  if (includeAll || config.includeApprovals) {
    const { count } = await supabase
      .from('approval_queue')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('status', 'pending')

    if (count && count > 0) {
      sections.push(`⏳ *${count} Pending Approval${count > 1 ? 's'  : ''}* — Reply "approvals" to review`)
    }
  }

  // Invoice summary
  if (includeAll || config.includeInvoices) {
    const { data: overdue } = await supabase
      .from('invoices')
      .select('total, client_contact_id, contacts(name)')
      .eq('org_id', orgId)
      .eq('status', 'overdue')
      .limit(5)

    if (overdue?.length) {
      const total = overdue.reduce((sum, inv) => sum + (Number(inv.total) || 0), 0)
      sections.push(`💰 *${overdue.length} Overdue Invoice${overdue.length > 1 ? 's' : ''}* — $${total.toLocaleString()} outstanding`)
    } else {
      sections.push('💰 *Invoices* — All up to date')
    }
  }

  sections.push('\n_Reply with any command or question. Type "help" for options._')

  return sections.join('\n\n')
}
