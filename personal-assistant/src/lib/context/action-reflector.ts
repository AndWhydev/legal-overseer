import type { SupabaseClient } from '@supabase/supabase-js'
import { writeTimelineEvent } from './timeline-writer'
import { linkTaskToContact } from './relationship-linker'
import { invalidateCrossRefs } from './xref-cache'
import { resolveEntity } from './entity-resolver'
import { logger } from '@/lib/core/logger'

/**
 * Maps completed tool executions to context side-effects.
 * Fire-and-forget: logs errors but NEVER throws.
 * Called from engine.ts after successful tool execution.
 */
export async function reflectAction(
  supabase: SupabaseClient,
  orgId: string,
  toolName: string,
  toolInput: Record<string, unknown>,
  toolResult: unknown
): Promise<void> {
  try {
    switch (toolName) {
      case 'send_email':
        await reflectSendEmail(supabase, orgId, toolInput)
        break
      case 'send_sms':
        await reflectSendSms(supabase, orgId, toolInput)
        break
      case 'create_task':
        await reflectCreateTask(supabase, orgId, toolInput, toolResult)
        break
      case 'send_whatsapp':
        await reflectSendWhatsapp(supabase, orgId, toolInput)
        break
      default:
        // Read-only tools — no write-back needed
        break
    }
  } catch (err) {
    logger.error('[action-reflector] Failed to reflect action', {
      tool: toolName,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

async function reflectSendEmail(
  supabase: SupabaseClient,
  orgId: string,
  input: Record<string, unknown>
): Promise<void> {
  const to = input.to as string | undefined
  if (!to) return

  const contacts = await resolveEntity(supabase, to, orgId)
  if (contacts.length === 0) return

  const contact = contacts[0]
  const subject = (input.subject as string) ?? ''
  const body = (input.body as string) ?? ''
  const snippet = body.length > 200 ? body.slice(0, 197) + '...' : body

  await writeTimelineEvent(
    supabase,
    orgId,
    'contact',
    contact.id,
    'message_sent',
    { channel: 'email', subject, snippet, to },
    'email',
    undefined
  )

  await invalidateCrossRefs(supabase, orgId, 'contact', contact.id)
}

async function reflectSendSms(
  supabase: SupabaseClient,
  orgId: string,
  input: Record<string, unknown>
): Promise<void> {
  const to = input.to as string | undefined
  if (!to) return

  const contacts = await resolveEntity(supabase, to, orgId)
  if (contacts.length === 0) return

  const contact = contacts[0]
  const message = (input.message as string) ?? ''
  const snippet = message.length > 200 ? message.slice(0, 197) + '...' : message

  await writeTimelineEvent(
    supabase,
    orgId,
    'contact',
    contact.id,
    'message_sent',
    { channel: 'sms', snippet, to },
    'sms',
    undefined
  )

  await invalidateCrossRefs(supabase, orgId, 'contact', contact.id)
}

async function reflectSendWhatsapp(
  supabase: SupabaseClient,
  orgId: string,
  input: Record<string, unknown>
): Promise<void> {
  const to = input.to as string | undefined
  if (!to) return

  const contacts = await resolveEntity(supabase, to, orgId)
  if (contacts.length === 0) return

  const contact = contacts[0]
  const message = (input.message as string) ?? ''
  const snippet = message.length > 200 ? message.slice(0, 197) + '...' : message

  await writeTimelineEvent(
    supabase,
    orgId,
    'contact',
    contact.id,
    'message_sent',
    { channel: 'whatsapp', snippet, to },
    'whatsapp',
    undefined
  )

  await invalidateCrossRefs(supabase, orgId, 'contact', contact.id)
}

async function reflectCreateTask(
  supabase: SupabaseClient,
  orgId: string,
  input: Record<string, unknown>,
  toolResult: unknown
): Promise<void> {
  const contactId = input.contact_id as string | undefined
  const result = toolResult as Record<string, unknown> | null
  const taskId = (result?.id as string) ?? (result?.data as Record<string, unknown>)?.id as string | undefined

  if (!taskId) return

  if (contactId) {
    await linkTaskToContact(supabase, orgId, taskId, contactId)

    await writeTimelineEvent(
      supabase,
      orgId,
      'contact',
      contactId,
      'task_created',
      { task_id: taskId, title: input.title as string ?? '' },
      undefined,
      { type: 'task', id: taskId }
    )

    await invalidateCrossRefs(supabase, orgId, 'contact', contactId)
  }

  await writeTimelineEvent(
    supabase,
    orgId,
    'task',
    taskId,
    'task_created',
    { title: input.title as string ?? '', priority: input.priority as string ?? 'medium' }
  )

  await invalidateCrossRefs(supabase, orgId, 'task', taskId)
}
