/**
 * AI Gateway Adapter
 *
 * Bridges the TAOR engine (which uses Anthropic SDK types internally) to the
 * Vercel AI Gateway via the AI SDK. All format conversion lives here so the
 * engine doesn't need to know about AI SDK internals.
 */

import { streamText, jsonSchema, gateway } from 'ai'
import type { LanguageModel, StreamTextResult } from 'ai'
import { logger } from '@/lib/core/logger'

// ── Anthropic-compatible types (avoids importing @anthropic-ai/sdk) ────────

interface AnthropicTool {
  name: string
  description?: string
  input_schema: Record<string, unknown>
}

interface AnthropicMessageParam {
  role: 'user' | 'assistant'
  content: string | Array<Record<string, unknown>>
}

// ── Public types ───────────────────────────────────────────────────────────

/** Anthropic-compatible content block with optional cache_control. */
export interface SystemContentBlock {
  type: 'text'
  text: string
  cache_control?: { type: 'ephemeral' }
}

export interface GatewayCallConfig {
  model: string // Gateway model ID, e.g. 'anthropic/claude-sonnet-4.6'
  maxTokens: number
  system: string
  /** When provided, used as the system parameter for prompt caching support. Falls back to `system` string. */
  systemContentBlocks?: SystemContentBlock[]
  tools: AnthropicTool[]
  messages: AnthropicMessageParam[]
  thinking?: { type: 'enabled'; budget_tokens: number }
}

export interface GatewayCallResult {
  streamedDeltas: string[]
  streamedThinkingDeltas: string[]
  hadThinking: boolean
  thinkingStartTime: number | null
  response: AnthropicLikeResponse
}

export interface AnthropicLikeResponse {
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'tool_use'; id: string; name: string; input: unknown }
  >
  stop_reason: string
  usage: { input_tokens: number; output_tokens: number }
}

// ── Message Conversion ─────────────────────────────────────────────────────

function convertMessages(messages: AnthropicMessageParam[]) {
  // Build a map of tool_use_id -> toolName from assistant messages so we can
  // populate the required `toolName` field on tool-result parts.
  const toolNameMap = new Map<string, string>()
  for (const msg of messages) {
    if (msg.role === 'assistant' && Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === 'tool_use') {
          toolNameMap.set(block.id as string, block.name as string)
        }
      }
    }
  }

  const result: Array<
    | { role: 'user'; content: string }
    | { role: 'assistant'; content: string | Array<{ type: string; [k: string]: unknown }> }
    | { role: 'tool'; content: Array<{ type: 'tool-result'; toolCallId: string; toolName: string; output: { type: 'text'; value: string } }> }
  > = []

  for (const msg of messages) {
    if (msg.role === 'user') {
      if (typeof msg.content === 'string') {
        if (msg.content.length > 0) {
          result.push({ role: 'user', content: msg.content })
        }
      } else if (Array.isArray(msg.content)) {
        const toolResults = msg.content.filter(b => b.type === 'tool_result')
        if (toolResults.length > 0) {
          result.push({
            role: 'tool',
            content: toolResults.map(b => ({
              type: 'tool-result' as const,
              toolCallId: b.tool_use_id as string,
              toolName: toolNameMap.get(b.tool_use_id as string) ?? 'unknown',
              output: {
                type: 'text' as const,
                value: typeof b.content === 'string' ? b.content : JSON.stringify(b.content),
              },
            })),
          })
          // Include any non-tool-result text as separate user message
          const textParts = msg.content
            .filter(b => b.type === 'text')
            .map(b => b.text as string)
            .filter(t => t.length > 0)
          if (textParts.length > 0) {
            result.push({ role: 'user', content: textParts.join('\n') })
          }
        } else {
          const text = msg.content
            .filter(b => b.type === 'text')
            .map(b => b.text as string)
            .join('\n')
          if (text.length > 0) {
            result.push({ role: 'user', content: text })
          }
        }
      }
    } else if (msg.role === 'assistant') {
      if (typeof msg.content === 'string') {
        if (msg.content.length > 0) {
          result.push({ role: 'assistant', content: msg.content })
        }
      } else if (Array.isArray(msg.content)) {
        const parts: Array<{ type: string; [k: string]: unknown }> = []
        for (const block of msg.content) {
          if (block.type === 'text' && (block.text as string).length > 0) {
            parts.push({ type: 'text', text: block.text as string })
          } else if (block.type === 'tool_use') {
            parts.push({
              type: 'tool-call',
              toolCallId: block.id as string,
              toolName: block.name as string,
              input: block.input,
            })
          }
        }
        if (parts.length > 0) {
          result.push({ role: 'assistant', content: parts })
        }
      }
    }
  }

  return result
}

// ── Tool Conversion ────────────────────────────────────────────────────────

function convertTools(tools: AnthropicTool[]) {
  const result: Record<string, { description: string; inputSchema: ReturnType<typeof jsonSchema> }> = {}
  for (const t of tools) {
    result[t.name] = {
      description: t.description || '',
      inputSchema: jsonSchema(t.input_schema),
    }
  }
  return result
}

// ── Gateway Call ───────────────────────────────────────────────────────────

/**
 * Call the AI model via Vercel AI Gateway.
 *
 * Converts Anthropic-format inputs to AI SDK format, streams the response,
 * and returns an Anthropic-compatible result the TAOR engine can consume.
 */
export async function callModelViaGateway(
  config: GatewayCallConfig,
  // Test-only hook: inject a MockLanguageModelV3 instead of the real gateway. Never used in prod.
  _testModel?: LanguageModel,
): Promise<GatewayCallResult> {
  let messages: ReturnType<typeof convertMessages>
  let tools: ReturnType<typeof convertTools>
  try {
    messages = convertMessages(config.messages)
    tools = convertTools(config.tools)
  } catch (convErr) {
    console.error('[gateway-adapter] Conversion error:', convErr)
    throw convErr
  }

  // Build providerOptions: merge thinking when present
  const anthropicOptions: Record<string, unknown> = {}
  if (config.thinking) {
    anthropicOptions.thinking = config.thinking
  }
  const providerOptions = Object.keys(anthropicOptions).length > 0
    ? { anthropic: anthropicOptions }
    : undefined

  // When systemContentBlocks are provided, build an array of system parts
  // with per-part providerOptions for prompt caching. The AI SDK Anthropic
  // provider reads cacheControl from each part's providerOptions to set
  // cache_control: { type: 'ephemeral' } on the corresponding content block.
  let systemParam: string | Array<{ type: 'text'; text: string; providerOptions?: Record<string, unknown> }>

  if (config.systemContentBlocks && config.systemContentBlocks.length > 0) {
    systemParam = config.systemContentBlocks.map(b => ({
      type: 'text' as const,
      text: b.text,
      ...(b.cache_control && {
        providerOptions: {
          anthropic: { cacheControl: b.cache_control },
        },
      }),
    }))
  } else {
    systemParam = config.system
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const streamResult = streamText({
    model: _testModel ?? gateway(config.model),
    system: systemParam,
    messages: messages as Parameters<typeof streamText>[0]['messages'],
    tools,
    maxOutputTokens: config.maxTokens,
    ...(providerOptions && { providerOptions }),
  } as any)

  // Collect streaming events
  const streamedDeltas: string[] = []
  const streamedThinkingDeltas: string[] = []
  let hadThinking = false
  let thinkingStartTime: number | null = null

  try {
  for await (const chunk of streamResult.fullStream) {
    // AI SDK v6 TextStreamPart: text-delta carries `text: string` (v5 used `textDelta`)
    if (chunk.type === 'text-delta') {
      streamedDeltas.push(chunk.text)
    } else if (chunk.type === 'reasoning-delta') {
      // AI SDK v6: reasoning chunks are `reasoning-delta` with `text: string`
      if (!hadThinking) {
        hadThinking = true
        thinkingStartTime = Date.now()
      }
      streamedThinkingDeltas.push(chunk.text)
    } else if (chunk.type === 'error') {
      // Surface gateway/provider errors explicitly instead of silently finishing
      const raw = (chunk as { error?: unknown }).error
      const msg = raw instanceof Error ? raw.message : typeof raw === 'string' ? raw : JSON.stringify(raw)
      logger.error('[gateway-adapter] Stream error chunk', { error: msg })
      throw raw instanceof Error ? raw : new Error(msg)
    }
  }

  // Build Anthropic-compatible response
  const text = await streamResult.text
  const toolCalls = (await streamResult.toolCalls) ?? []
  // AI SDK v6: LanguageModelUsage uses inputTokens/outputTokens (v5 used promptTokens/completionTokens)
  const usage = (await streamResult.usage) ?? { inputTokens: 0, outputTokens: 0 }
  const finishReason = (await streamResult.finishReason) ?? 'stop'

  const content: AnthropicLikeResponse['content'] = []
  if (text) {
    content.push({ type: 'text', text })
  }
  if (Array.isArray(toolCalls)) {
    for (const tc of toolCalls) {
      content.push({
        type: 'tool_use',
        id: tc.toolCallId,
        name: tc.toolName,
        input: (tc as Record<string, unknown>).input ?? (tc as Record<string, unknown>).args,
      })
    }
  }

  const stop_reason =
    finishReason === 'tool-calls' ? 'tool_use'
    : finishReason === 'length' ? 'max_tokens'
    : 'end_turn'

  return {
    streamedDeltas,
    streamedThinkingDeltas,
    hadThinking,
    thinkingStartTime,
    response: {
      content,
      stop_reason,
      usage: {
        input_tokens: usage.inputTokens ?? 0,
        output_tokens: usage.outputTokens ?? 0,
      },
    },
  }
  } catch (streamErr) {
    console.error('[gateway-adapter] Stream/response error:', streamErr)
    throw streamErr
  }
}
