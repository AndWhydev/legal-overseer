/**
 * TAOR-to-UIMessageStream Bridge
 *
 * Pure adapter that converts BitBit's AgentEvent async generator into
 * an AI SDK v6 UIMessageStream. The TAOR engine is not modified — this
 * layer only translates event shapes.
 *
 * Usage:
 *   const stream = bridgeTAORToUIStream(pipeline.handleMessage(...))
 *   return createUIMessageStreamResponse({ stream })
 */

import { createUIMessageStream } from 'ai'
import type { UIMessageStreamWriter } from 'ai'
import type { PipelineEvent } from '@/lib/conversation/unified-pipeline'
import type { BitBitUIMessage } from './ai-sdk-types'

type Writer = UIMessageStreamWriter<BitBitUIMessage>

// ── Voice hint inference ─────────────────────────────────────────────

export interface VoiceHint {
  shouldSpeak: boolean // Whether TTS should play this response
  summary?: string // Shortened version for TTS (if response is long)
  reason: string // Why this decision was made
}

/**
 * Extracts the first N sentences from text.
 * A sentence ends with `.`, `!`, or `?` followed by a space or end-of-string.
 */
function firstNSentences(text: string, n: number): string {
  const pattern = /[^.!?]*[.!?]/g
  const sentences: string[] = []
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null && sentences.length < n) {
    sentences.push(match[0].trim())
  }
  return sentences.join(' ')
}

/**
 * Infer whether a response should be spoken aloud or displayed as text only,
 * based on the response content characteristics.
 */
export function inferVoiceHint(responseText: string): VoiceHint {
  // Contains data tables (|---| pattern)
  if (/\|---/.test(responseText)) {
    return { shouldSpeak: false, reason: 'data_table' }
  }

  // Contains code blocks (``` pattern)
  if (/```/.test(responseText)) {
    return { shouldSpeak: false, reason: 'code_block' }
  }

  // Short confirmations (<50 chars, no markdown)
  if (responseText.length < 50 && !/[#*`|]/.test(responseText)) {
    return { shouldSpeak: true, reason: 'short_confirmation' }
  }

  // Long responses (>500 chars): speak a summary
  if (responseText.length > 500) {
    const summary = firstNSentences(responseText, 2)
    return {
      shouldSpeak: true,
      summary: summary || undefined,
      reason: 'long_response_summarized',
    }
  }

  // Default
  return { shouldSpeak: true, reason: 'standard' }
}

// Simple incrementing ID generator scoped per stream invocation.
function makeIdGenerator(prefix: string) {
  let counter = 0
  return () => `${prefix}-${++counter}`
}

/**
 * Converts a TAOR PipelineEvent async generator into a
 * `ReadableStream<UIMessageChunk>` compatible with AI SDK v6.
 */
export function bridgeTAORToUIStream(
  events: AsyncGenerator<PipelineEvent>
): ReadableStream {
  const nextTextId = makeIdGenerator('txt')
  const nextReasoningId = makeIdGenerator('rsn')

  return createUIMessageStream<BitBitUIMessage>({
    execute: async ({ writer }: { writer: Writer }) => {
      let textId: string | null = null
      let reasoningId: string | null = null
      let responseTextBuffer = '' // Accumulates content for voice hint inference

      // Helper: ensure a text-start has been emitted, return the active id
      function ensureTextStarted(): string {
        if (textId === null) {
          textId = nextTextId()
          writer.write({ type: 'text-start', id: textId })
        }
        return textId
      }

      // Helper: close any open text part
      function closeText(): void {
        if (textId !== null) {
          writer.write({ type: 'text-end', id: textId })
          textId = null
        }
      }

      // Helper: close any open reasoning part
      function closeReasoning(): void {
        if (reasoningId !== null) {
          writer.write({ type: 'reasoning-end', id: reasoningId })
          reasoningId = null
        }
      }

      for await (const event of events) {
        switch (event.type) {
          // ── Reasoning / thinking ────────────────────────────────────
          case 'thinking_start': {
            closeText()
            reasoningId = nextReasoningId()
            writer.write({ type: 'reasoning-start', id: reasoningId })
            break
          }
          case 'thinking_delta': {
            if (reasoningId !== null) {
              writer.write({
                type: 'reasoning-delta',
                id: reasoningId,
                delta: event.data,
              })
            }
            break
          }
          case 'thinking_complete': {
            closeReasoning()
            break
          }
          case 'thinking': {
            // Legacy single-shot thinking: emit as complete reasoning block
            closeText()
            const id = nextReasoningId()
            writer.write({ type: 'reasoning-start', id })
            writer.write({ type: 'reasoning-delta', id, delta: event.data })
            writer.write({ type: 'reasoning-end', id })
            break
          }

          // ── Text content ────────────────────────────────────────────
          case 'content_delta': {
            closeReasoning()
            const id = ensureTextStarted()
            writer.write({ type: 'text-delta', id, delta: event.data })
            responseTextBuffer += event.data
            break
          }
          case 'message': {
            // Full message text — only use if no deltas were streamed
            // (content_delta already sent the text incrementally)
            if (textId !== null) break // Already streaming via deltas, skip duplicate
            closeReasoning()
            const id = ensureTextStarted()
            writer.write({ type: 'text-delta', id, delta: event.data })
            responseTextBuffer += event.data
            break
          }

          // ── Tool lifecycle ──────────────────────────────────────────
          case 'tool_call': {
            writer.write({
              type: 'tool-input-available',
              toolCallId: event.data.callId,
              toolName: event.data.name,
              input: event.data.input,
            })
            break
          }
          case 'tool_result': {
            if (event.data.success) {
              writer.write({
                type: 'tool-output-available',
                toolCallId: event.data.callId,
                output: event.data.result,
              })
            } else {
              writer.write({
                type: 'tool-output-error',
                toolCallId: event.data.callId,
                errorText:
                  typeof event.data.result === 'string'
                    ? event.data.result
                    : JSON.stringify(event.data.result),
              })
            }
            // If this tool result is queued for approval, also emit approval request
            if (event.data.queued && event.data.approvalId) {
              writer.write({
                type: 'tool-approval-request',
                approvalId: event.data.approvalId,
                toolCallId: event.data.callId,
              })
            }
            break
          }
          case 'tool_progress': {
            writer.write({
              type: 'data-tool_progress',
              data: event.data,
            })
            break
          }

          // ── Citations ───────────────────────────────────────────────
          case 'citation': {
            for (const cit of event.data.citations) {
              writer.write({
                type: 'source-url',
                sourceId: `cite-${cit.index}`,
                url: cit.url,
                title: cit.title,
              })
            }
            break
          }

          // ── Plan / stage ────────────────────────────────────────────
          case 'plan': {
            writer.write({
              type: 'data-plan',
              data: {
                stages: event.data.stages.map((s) => ({
                  id: s.id,
                  label: s.label,
                  sublabel: s.sublabel,
                  icon: s.icon,
                  toolHint: s.toolHint,
                })),
              },
            })
            break
          }
          case 'plan_stage_update': {
            writer.write({
              type: 'data-plan_stage_update',
              data: event.data,
            })
            break
          }
          case 'stage': {
            writer.write({
              type: 'data-stage',
              data: event.data,
            })
            break
          }

          // ── Sub-agents ──────────────────────────────────────────────
          case 'sub_agent_start': {
            writer.write({
              type: 'data-sub_agent',
              data: {
                agentId: event.data.agentId,
                description: event.data.description,
                phase: 'start' as const,
              },
            })
            break
          }
          case 'sub_agent_complete': {
            writer.write({
              type: 'data-sub_agent',
              data: {
                agentId: event.data.agentId,
                summary: event.data.summary,
                phase: 'complete' as const,
              },
            })
            break
          }

          // ── Budget / cost events ────────────────────────────────────
          case 'cost_blocked': {
            writer.write({
              type: 'data-budget',
              data: {
                type: 'cost_blocked',
                data: event.data as unknown as Record<string, unknown>,
              },
            })
            break
          }
          case 'budget_blocked': {
            writer.write({
              type: 'data-budget',
              data: {
                type: 'budget_blocked',
                data: event.data as unknown as Record<string, unknown>,
              },
            })
            break
          }
          case 'budget_warning': {
            writer.write({
              type: 'data-budget',
              data: {
                type: 'budget_warning',
                data: event.data as unknown as Record<string, unknown>,
              },
            })
            break
          }
          case 'execution_cap_hit': {
            writer.write({
              type: 'data-budget',
              data: {
                type: 'execution_cap_hit',
                data: event.data as unknown as Record<string, unknown>,
              },
            })
            break
          }

          // ── Thread info (PipelineEvent-only) ────────────────────────
          case 'thread': {
            writer.write({
              type: 'data-thread',
              data: event.data,
            })
            break
          }

          // ── Transient events ────────────────────────────────────────
          case 'checkpoint': {
            writer.write({
              type: 'data-checkpoint',
              data: event.data,
              transient: true,
            })
            break
          }
          case 'synthesis_start': {
            writer.write({
              type: 'data-synthesis',
              data: event.data,
              transient: true,
            })
            break
          }

          // ── Follow-ups ──────────────────────────────────────────────
          case 'follow_ups': {
            const data = Array.isArray(event.data)
              ? { suggestions: event.data }
              : event.data
            if (Array.isArray(data.suggestions)) {
              writer.write({
                type: 'data-follow_ups',
                data,
              })
            }
            break
          }

          // ── Error ───────────────────────────────────────────────────
          case 'error': {
            writer.write({
              type: 'error',
              errorText: event.data,
            })
            break
          }

          // ── Done ────────────────────────────────────────────────────
          case 'done': {
            // Close any open parts before stream ends
            closeText()
            closeReasoning()
            // Emit voice hint based on response characteristics
            if (responseTextBuffer.length > 0) {
              const voiceHint = inferVoiceHint(responseTextBuffer)
              writer.write({
                type: "data-voice_hint" as any,
                data: voiceHint as any,
              })
            }
            // Stream naturally ends when the generator is exhausted
            break
          }

          default: {
            // Future event types are silently ignored to keep forward-compat
            break
          }
        }
      }

      // Safety: close any still-open parts
      closeText()
      closeReasoning()
    },
    onError: (error: unknown) => {
      if (error instanceof Error) return error.message
      return String(error)
    },
  })
}
