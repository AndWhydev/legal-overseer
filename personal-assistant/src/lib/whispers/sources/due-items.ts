import type { SupabaseClient } from '@supabase/supabase-js'
import type { Whisper } from '../types'

function truncateWhisper(text: string, max = 50): string {
  if (text.length <= max) return text
  const cut = text.lastIndexOf(' ', max - 3)
  return (cut > 0 ? text.slice(0, cut) : text.slice(0, max - 3)) + '...'
}

export async function whisperDueItems(
  supabase: SupabaseClient,
  orgId: string,
): Promise<Whisper[]> {
  const whispers: Whisper[] = []
  const today = new Date().toISOString().split('T')[0]

  // Overdue invoices
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, total, currency, due_date, client_contact_id, contacts!client_contact_id(name)')
    .eq('org_id', orgId)
    .in('status', ['sent', 'viewed', 'overdue'])
    .lte('due_date', today)
    .order('due_date', { ascending: true })
    .limit(3)

  if (invoices?.length) {
    for (const inv of invoices) {
      const dueDate = new Date(inv.due_date)
      const now = new Date()
      const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (24 * 60 * 60 * 1000))
      const contactName = Array.isArray(inv.contacts)
        ? inv.contacts[0]?.name
        : (inv.contacts as { name: string } | null)?.name

      const urgency = Math.min(1, 0.5 + daysOverdue / 14)
      const label = contactName || `Invoice ${inv.invoice_number}`

      whispers.push({
        text: truncateWhisper(daysOverdue === 0
          ? `${label}'s invoice due today`
          : `${label}'s invoice ${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} overdue`),
        score: urgency,
        source: 'due_items',
        context: {
          invoiceId: inv.id,
          invoiceNumber: inv.invoice_number,
          contactName,
          daysOverdue,
          total: inv.total,
          currency: inv.currency,
        },
      })
    }
  }

  // Overdue/due tasks
  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, title, priority, status, metadata')
    .eq('org_id', orgId)
    .in('status', ['pending', 'in_progress'])
    .in('priority', ['critical', 'high'])
    .order('priority', { ascending: true })
    .limit(3)

  if (tasks?.length) {
    for (const task of tasks) {
      const priorityScore = task.priority === 'critical' ? 0.9 : 0.65

      whispers.push({
        text: truncateWhisper(task.title),
        score: priorityScore,
        source: 'due_items',
        context: {
          taskId: task.id,
          taskTitle: task.title,
          priority: task.priority,
        },
      })
    }
  }

  return whispers
}
