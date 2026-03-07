import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase/service-client'
import type { ChannelMessage } from '@/lib/channels/types'

/**
 * Agent classification endpoint optimized for cold start performance.
 *
 * Accepts either a message_id (to look up from DB) or inline text+channel
 * for direct classification. Uses the service-role client (not cookie-based)
 * to avoid session overhead.
 *
 * Cold start optimization:
 * - Anthropic SDK imported at module level (needs to be warm)
 * - Context assembly lazy-loaded only when needed
 * - Service client is a singleton (no per-request creation)
 *
 * Target: <3s response from cold start (DEPLOY-03)
 * Capacity: 10 concurrent requests without pool exhaustion (DEPLOY-04)
 */

// Module-level imports for warm start -- these are needed on every request
import Anthropic from '@anthropic-ai/sdk'

export const maxDuration = 30
export const dynamic = 'force-dynamic'

interface ClassifyRequest {
  message_id?: string
  text?: string
  channel?: string
  org_id?: string
}

interface ClassifyResponse {
  classification: {
    significance: number
    timeSensitivity: string
    category: string
    recommendedActions: string[]
    reasoning: string
  }
  duration_ms: number
}

export async function POST(request: Request): Promise<NextResponse> {
  const startTime = Date.now()

  try {
    const body = (await request.json()) as ClassifyRequest

    if (!body.message_id && !body.text) {
      return NextResponse.json(
        { error: 'Provide either message_id or text' },
        { status: 400 }
      )
    }

    const supabase = getServiceClient()

    // If message_id provided, look up the message
    let message: ChannelMessage | null = null
    let orgId = body.org_id || ''

    if (body.message_id) {
      const { data, error } = await supabase
        .from('channel_messages')
        .select('*')
        .eq('id', body.message_id)
        .single()

      if (error || !data) {
        return NextResponse.json(
          { error: 'Message not found', duration_ms: Date.now() - startTime },
          { status: 404 }
        )
      }

      message = {
        id: data.id,
        channel: (data.channel || 'gmail') as ChannelMessage['channel'],
        externalId: data.external_id || data.id,
        sender: data.sender || 'unknown',
        senderEmail: data.sender_email || undefined,
        subject: data.subject || undefined,
        body: data.body || '',
        receivedAt: new Date(data.received_at || Date.now()),
        isActionable: data.is_actionable ?? true,
        priority: data.priority || 'medium',
        metadata: data.metadata || {},
      }
      orgId = data.org_id || orgId
    } else {
      // Build a synthetic message from inline text
      message = {
        id: 'inline-' + Date.now(),
        channel: (body.channel || 'gmail') as ChannelMessage['channel'],
        externalId: 'inline-' + Date.now(),
        sender: 'api-caller',
        body: body.text!,
        receivedAt: new Date(),
        isActionable: true,
        priority: 'medium',
        metadata: {},
      }
    }

    // Lazy-load classifier to reduce cold start for health-check-only instances
    const { classifyMessage } = await import('@/lib/agent/classifier')
    const result = await classifyMessage(supabase, message, orgId)

    const durationMs = Date.now() - startTime

    const response: ClassifyResponse = {
      classification: {
        significance: result.significance,
        timeSensitivity: result.timeSensitivity,
        category: result.category,
        recommendedActions: result.recommendedActions,
        reasoning: result.reasoning,
      },
      duration_ms: durationMs,
    }

    return NextResponse.json(response)
  } catch (err) {
    const durationMs = Date.now() - startTime
    const errorMessage = err instanceof Error ? err.message : String(err)

    logger.error('[classify] Classification failed:', err)

    return NextResponse.json(
      {
        error: errorMessage,
        duration_ms: durationMs,
      },
      { status: 500 }
    )
  }
}
