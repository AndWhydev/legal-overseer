import type { SupabaseClient } from '@supabase/supabase-js'
import { dispatchNotification } from '@/lib/notifications/dispatcher'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface JobReminderTickResult {
  processed: number
  remindersSent: number
  followUpsSent: number
  failed: number
}

// ---------------------------------------------------------------------------
// Scheduler Tick
// ---------------------------------------------------------------------------

export async function runJobReminderTick(
  supabase: SupabaseClient,
  orgId: string,
  _configId: string,
): Promise<JobReminderTickResult> {
  const result: JobReminderTickResult = { processed: 0, remindersSent: 0, followUpsSent: 0, failed: 0 }
  const now = new Date()

  // ── 1. Pre-job reminders: jobs starting in next 24h ──────────────────
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000)

  const { data: upcomingJobs, error: upErr } = await supabase
    .from('jobs')
    .select('id, title, address, scheduled_at, contact_id, contact:contacts(name, phone, email)')
    .eq('org_id', orgId)
    .eq('status', 'booked')
    .gte('scheduled_at', now.toISOString())
    .lte('scheduled_at', in24h.toISOString())

  if (!upErr && upcomingJobs) {
    for (const job of upcomingJobs) {
      result.processed += 1
      try {
        const contact = job.contact as unknown as { name: string; phone: string | null; email: string | null } | null
        if (!contact) continue

        const scheduledDate = new Date(job.scheduled_at!)
        const timeStr = scheduledDate.toLocaleString('en-AU', {
          weekday: 'short', day: 'numeric', month: 'short',
          hour: 'numeric', minute: '2-digit',
        })

        await dispatchNotification(supabase, {
          orgId,
          type: 'info',
          channels: contact.phone ? ['whatsapp'] : ['email'],
          title: `Job reminder: ${job.title}`,
          body: `Hi ${contact.name}, just a reminder about your upcoming job: ${job.title}${job.address ? ` at ${job.address}` : ''} scheduled for ${timeStr}. See you then!`,
        })

        result.remindersSent += 1
      } catch {
        result.failed += 1
      }
    }
  }

  // ── 2. Post-job follow-ups: completed >24h ago with no invoice ───────
  const ago24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  const { data: completedJobs, error: compErr } = await supabase
    .from('jobs')
    .select('id, title, contact_id, contact:contacts(name, phone, email)')
    .eq('org_id', orgId)
    .eq('status', 'complete')
    .lt('completed_at', ago24h.toISOString())

  if (!compErr && completedJobs) {
    for (const job of completedJobs) {
      result.processed += 1
      try {
        const contact = job.contact as unknown as { name: string; phone: string | null; email: string | null } | null
        if (!contact) continue

        await dispatchNotification(supabase, {
          orgId,
          type: 'info',
          channels: contact.phone ? ['whatsapp'] : ['email'],
          title: `Thanks for choosing us — ${job.title}`,
          body: `Hi ${contact.name}, thanks for letting us handle "${job.title}". We hope everything looks great! Your invoice will be with you shortly. If you have a moment, we'd really appreciate a Google review.`,
        })

        result.followUpsSent += 1
      } catch {
        result.failed += 1
      }
    }
  }

  return result
}
