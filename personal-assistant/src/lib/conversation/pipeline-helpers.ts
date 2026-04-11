/**
 * Pipeline Helpers — utilities for consuming the unified pipeline
 * from non-streaming contexts (webhooks, crons).
 */

import { UnifiedConversationPipeline, type PipelineEvent } from './unified-pipeline'
import type { InboundMessage } from './types'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { EngineConfig } from '@/lib/agent/engine'
import { logger } from '@/lib/core/logger'

export interface PipelineResponse {
  responseContent: string
  threadId: string | null
  success: boolean
  error?: string
}

/**
 * Run a message through the unified pipeline and collect the full response.
 * Used by SMS/email/WhatsApp webhooks that need the complete response text
 * (can't stream to the channel).
 */
export async function runPipelineToCompletion(
  supabase: SupabaseClient,
  inbound: InboundMessage,
  opts?: {
    identity?: { userId: string; orgId: string; email?: string; displayName?: string }
    engineOverrides?: Partial<EngineConfig>
  }
): Promise<PipelineResponse> {
  const pipeline = new UnifiedConversationPipeline(supabase)
  let responseContent = ''
  let threadId: string | null = null

  try {
    const events = pipeline.handleMessage(inbound, {
      supabase,
      identity: opts?.identity,
      engineOverrides: opts?.engineOverrides,
    })

    for await (const event of events) {
      switch (event.type) {
        case 'thread':
          threadId = (event as { type: 'thread'; data: { threadId: string } }).data.threadId
          break
        case 'message':
          responseContent = event.data as string
          break
        case 'content_delta':
          responseContent += event.data as string
          break
        case 'error':
          logger.error('[pipeline-helpers] Pipeline error event', { error: event.data })
          return {
            responseContent: '',
            threadId,
            success: false,
            error: event.data as string,
          }
        // done, thinking_*, stage, tool_call, tool_result — ignored
      }
    }

    return { responseContent, threadId, success: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error('[pipeline-helpers] Pipeline execution failed', { error: msg })
    return { responseContent: '', threadId, success: false, error: msg }
  }
}
