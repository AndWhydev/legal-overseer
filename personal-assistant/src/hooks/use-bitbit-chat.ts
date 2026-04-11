/**
 * useBitBitChat — typed wrapper around AI SDK v6 useChat
 *
 * Configures DefaultChatTransport for the /api/agent/chat route and
 * provides typed helpers for extracting BitBit custom data parts from
 * message.parts arrays.
 *
 * Usage:
 *   const { messages, sendMessage, status, getPlanParts, ... } = useBitBitChat()
 */

'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, isDataUIPart } from 'ai'
import type { UIMessagePart } from 'ai'
import type { BitBitUIMessage, BitBitDataTypes } from '@/lib/agent/ai-sdk-types'

type BitBitPart = UIMessagePart<BitBitDataTypes, Record<string, never>>

// ---------------------------------------------------------------------------
// Transport factory — one per chatId to avoid cross-thread state leaks
// ---------------------------------------------------------------------------

const transportCache = new Map<string, DefaultChatTransport<BitBitUIMessage>>()

function getTransport(chatId?: string | null): DefaultChatTransport<BitBitUIMessage> {
  const key = chatId || '__default__'
  let transport = transportCache.get(key)
  if (!transport) {
    transport = new DefaultChatTransport<BitBitUIMessage>({
      api: '/api/agent/chat',
    })
    transportCache.set(key, transport)
  }
  return transport
}

// ---------------------------------------------------------------------------
// Part extraction helpers
// ---------------------------------------------------------------------------

/** Extract all custom data parts of a specific type from a single message. */
function getDataParts<K extends keyof BitBitDataTypes>(
  message: BitBitUIMessage,
  name: K
): Array<{ type: `data-${K}`; data: BitBitDataTypes[K]; id?: string }> {
  const typeName = `data-${name}` as const
  const results: Array<{ type: `data-${K}`; data: BitBitDataTypes[K]; id?: string }> = []
  for (const part of message.parts) {
    if (isDataUIPart(part as BitBitPart) && part.type === typeName) {
      results.push(part as { type: `data-${K}`; data: BitBitDataTypes[K]; id?: string })
    }
  }
  return results
}

/** Get the latest plan from a message (usually there's at most one). */
function getLatestPlan(message: BitBitUIMessage) {
  const plans = getDataParts(message, 'plan')
  return plans.length > 0 ? plans[plans.length - 1].data : null
}

/** Get all plan stage updates from a message. */
function getPlanStageUpdates(message: BitBitUIMessage) {
  return getDataParts(message, 'plan_stage_update').map((p) => p.data)
}

/** Get all stage lifecycle events from a message. */
function getStages(message: BitBitUIMessage) {
  return getDataParts(message, 'stage').map((p) => p.data)
}

/** Get all tool progress heartbeats from a message. */
function getToolProgress(message: BitBitUIMessage) {
  return getDataParts(message, 'tool_progress').map((p) => p.data)
}

/** Get all budget/cost events from a message. */
function getBudgetEvents(message: BitBitUIMessage) {
  return getDataParts(message, 'budget').map((p) => p.data)
}

/** Get the thread info (emitted at stream start). */
function getThreadInfo(message: BitBitUIMessage) {
  const parts = getDataParts(message, 'thread')
  return parts.length > 0 ? parts[0].data : null
}

/** Get all sub-agent lifecycle events from a message. */
function getSubAgentEvents(message: BitBitUIMessage) {
  return getDataParts(message, 'sub_agent').map((p) => p.data)
}

/** Get follow-up suggestions from a message. */
function getFollowUps(message: BitBitUIMessage): string[] {
  const parts = getDataParts(message, 'follow_ups')
  return parts.length > 0 ? parts[parts.length - 1].data.suggestions : []
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useBitBitChat(options?: { chatId?: string | null }) {
  const transport = getTransport(options?.chatId)
  const chat = useChat<BitBitUIMessage>({
    transport,
    id: options?.chatId || undefined,
  })

  return {
    ...chat,

    // Typed part extractors — call with a message from `messages`
    getDataParts,
    getLatestPlan,
    getPlanStageUpdates,
    getStages,
    getToolProgress,
    getBudgetEvents,
    getThreadInfo,
    getSubAgentEvents,
    getFollowUps,
  }
}
