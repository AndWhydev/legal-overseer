import type { SupabaseClient } from '@supabase/supabase-js'
import type { RoleAction } from '../role-registry'
import type { AutonomyLevel } from '@/lib/bitbit-core'
import { draftReply, type DraftedReply, type DraftRequest } from '@/lib/agent/client-comms'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResponseDraftRequest {
  contactId: string
  contactName: string
  channel: 'email' | 'whatsapp' | 'sms'
  incomingMessage: string
  topic: string
  urgency: 'critical' | 'high' | 'medium' | 'low'
}

export interface ResponseDraftResult {
  draft: DraftedReply | null
  action: RoleAction | null
  error?: string
}

// ---------------------------------------------------------------------------
// Response Drafter
// ---------------------------------------------------------------------------

/**
 * Drafts contextual replies using the existing client-comms draftReply
 * infrastructure. Routes through autonomy gate based on autonomy level.
 *
 * This function wraps client-comms.draftReply() and translates results
 * into role actions for the role engine to process.
 */
export async function draftContextualResponse(
  supabase: SupabaseClient,
  orgId: string,
  request: ResponseDraftRequest,
  autonomyLevel: AutonomyLevel,
): Promise<ResponseDraftResult> {
  const tag = `[response-drafter:${orgId.slice(0, 8)}]`

  try {
    // Resolve contact slug from contact ID
    const { data: contact } = await supabase
      .from('contacts')
      .select('slug, name')
      .eq('org_id', orgId)
      .eq('id', request.contactId)
      .single()

    if (!contact?.slug) {
      logger.warn(`${tag} Could not resolve contact slug for ${request.contactId}`)
      return {
        draft: null,
        action: null,
        error: `Contact ${request.contactId} not found or has no slug`,
      }
    }

    // Determine approval requirement based on autonomy level
    const requireApproval = autonomyLevel !== 'autopilot'

    const draftRequest: DraftRequest = {
      contactSlug: contact.slug,
      incomingMessage: request.incomingMessage,
      channel: request.channel,
      requireApproval,
    }

    const draft = await draftReply(supabase, orgId, draftRequest)

    logger.info(
      `${tag} Drafted response for ${request.contactName} (${request.channel}, ` +
      `confidence: ${draft.confidence.toFixed(2)}, approval: ${draft.approvalId ? 'queued' : 'direct'})`,
    )

    // Translate to role action
    const action: RoleAction = {
      type: draft.approvalId ? 'draft_queued' : 'response_ready',
      summary: draft.approvalId
        ? `Draft reply to ${request.contactName} queued for approval (${request.channel})`
        : `Draft reply to ${request.contactName} ready to send (${request.channel})`,
      payload: {
        contactId: request.contactId,
        contactName: request.contactName,
        channel: request.channel,
        topic: request.topic,
        urgency: request.urgency,
        draftPreview: draft.body.slice(0, 200),
        confidence: draft.confidence,
        approvalId: draft.approvalId ?? null,
        voiceUsed: draft.voice,
        sentimentLabel: draft.sentiment?.label ?? null,
      },
      confidence: draft.confidence,
      reversible: true,
    }

    return { draft, action }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error(`${tag} Draft failed for ${request.contactName}: ${message}`)
    return {
      draft: null,
      action: null,
      error: message,
    }
  }
}

/**
 * Batch-draft responses for multiple unanswered threads.
 * Used by the comms role evaluate() to handle all pending threads in one tick.
 */
export async function batchDraftResponses(
  supabase: SupabaseClient,
  orgId: string,
  requests: ResponseDraftRequest[],
  autonomyLevel: AutonomyLevel,
): Promise<ResponseDraftResult[]> {
  const tag = `[response-drafter:${orgId.slice(0, 8)}]`
  const results: ResponseDraftResult[] = []

  // Process sequentially to avoid rate limits
  for (const request of requests) {
    const result = await draftContextualResponse(supabase, orgId, request, autonomyLevel)
    results.push(result)
  }

  const drafted = results.filter(r => r.draft !== null).length
  const failed = results.filter(r => r.error).length
  logger.info(`${tag} Batch draft: ${drafted} drafted, ${failed} failed out of ${requests.length}`)

  return results
}
