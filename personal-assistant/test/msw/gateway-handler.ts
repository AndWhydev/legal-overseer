/**
 * MSW + MockLanguageModelV3 helpers for locking down AI SDK v6 behaviour.
 *
 * The Vercel AI Gateway uses a custom fetch internally, so HTTP-level interception
 * is brittle. We instead expose MockLanguageModelV3 factories that tests pass to
 * `callModelViaGateway` via the `_testModel` hook (see gateway-adapter.ts).
 */

import { setupServer as mswSetupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import {
  MockLanguageModelV3,
  simulateReadableStream,
  convertArrayToReadableStream,
} from 'ai/test'
import type { LanguageModelV3StreamPart, LanguageModelV3Usage, LanguageModelV3FinishReason } from '@ai-sdk/provider'

export type SimulatedEvent =
  | { type: 'text-delta'; id?: string; delta: string }
  | { type: 'reasoning-delta'; id?: string; delta: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; input: unknown }
  | { type: 'error'; error: unknown }
  | {
      type: 'finish'
      finishReason?: 'stop' | 'length' | 'content-filter' | 'tool-calls' | 'error' | 'other' | 'unknown'
      /** Simplified shape. Gets expanded to the full v3 nested usage structure. */
      usage?: { inputTokens?: number; outputTokens?: number }
    }

function makeV3Usage(u?: { inputTokens?: number; outputTokens?: number }): LanguageModelV3Usage {
  return {
    inputTokens: { total: u?.inputTokens, noCache: u?.inputTokens, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: {
      total: u?.outputTokens,
      text: undefined, reasoning: undefined,
      prediction: { accepted: undefined, rejected: undefined },
    },
  } as unknown as LanguageModelV3Usage
}

function expand(events: SimulatedEvent[]): LanguageModelV3StreamPart[] {
  const parts: LanguageModelV3StreamPart[] = [{ type: 'stream-start', warnings: [] }]
  // Track open text/reasoning parts so we can emit matching start/end frames (v6 requires framing)
  const openText = new Set<string>()
  const openReasoning = new Set<string>()
  let finishEmitted = false
  for (const e of events) {
    if (e.type === 'text-delta') {
      const id = e.id ?? 'txt-1'
      if (!openText.has(id)) {
        parts.push({ type: 'text-start', id })
        openText.add(id)
      }
      parts.push({ type: 'text-delta', id, delta: e.delta })
    } else if (e.type === 'reasoning-delta') {
      const id = e.id ?? 'r-1'
      if (!openReasoning.has(id)) {
        parts.push({ type: 'reasoning-start', id })
        openReasoning.add(id)
      }
      parts.push({ type: 'reasoning-delta', id, delta: e.delta })
    } else if (e.type === 'tool-call') {
      parts.push({ type: 'tool-call', toolCallId: e.toolCallId, toolName: e.toolName, input: e.input as string })
    } else if (e.type === 'error') {
      parts.push({ type: 'error', error: e.error })
    } else if (e.type === 'finish') {
      for (const id of openText) parts.push({ type: 'text-end', id })
      openText.clear()
      for (const id of openReasoning) parts.push({ type: 'reasoning-end', id })
      openReasoning.clear()
      parts.push({
        type: 'finish',
        finishReason: (e.finishReason ?? 'stop') as unknown as LanguageModelV3FinishReason,
        usage: makeV3Usage(e.usage),
      })
      finishEmitted = true
    }
  }
  if (!finishEmitted) {
    for (const id of openText) parts.push({ type: 'text-end', id })
    for (const id of openReasoning) parts.push({ type: 'reasoning-end', id })
    parts.push({
      type: 'finish',
      finishReason: 'stop' as unknown as LanguageModelV3FinishReason,
      usage: makeV3Usage(),
    })
  }
  return parts
}

/**
 * Build a MockLanguageModelV3 whose doStream replays the given events in v6 chunk shape.
 * Pass the returned model to `callModelViaGateway(config, model)` via the `_testModel` hook.
 */
export function mockGatewayDirect(events: SimulatedEvent[], opts?: { toolCallsOverride?: unknown }): MockLanguageModelV3 {
  const parts = expand(events)
  return new MockLanguageModelV3({
    doStream: async () => ({
      stream: simulateReadableStream({ chunks: parts, chunkDelayInMs: null, initialDelayInMs: null }),
      ...(opts?.toolCallsOverride !== undefined ? { toolCalls: opts.toolCallsOverride as never } : {}),
    }),
  })
}

/**
 * HTTP-level handler for ai-gateway.vercel.sh. Kept for tests that prefer
 * network-level interception over the `_testModel` hook. Best-effort: the
 * real gateway stream protocol may drift, so prefer `mockGatewayDirect`.
 */
export function mockGatewayReply(events: SimulatedEvent[]) {
  const parts = expand(events)
  const body = parts.map(p => `data: ${JSON.stringify(p)}\n\n`).join('') + 'data: [DONE]\n\n'
  return http.post('https://ai-gateway.vercel.sh/*', () =>
    HttpResponse.text(body, { headers: { 'content-type': 'text/event-stream' } }),
  )
}

/** Re-export for convenience so callers don't import msw/node themselves. */
export const setupServer = mswSetupServer

/** Re-export ai/test helper for direct use in tests. */
export { convertArrayToReadableStream }
