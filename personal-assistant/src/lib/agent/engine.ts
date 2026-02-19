import Anthropic from '@anthropic-ai/sdk'
import { getAgentTools, executeAgentTool } from './tools'
import { buildSystemPrompt } from './prompt-builder'
import { selectModel, getModel } from './model-router'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  toolCalls?: ToolCallResult[]
}

export interface ToolCallResult {
  name: string
  input: Record<string, unknown>
  result: unknown
  success: boolean
}

export interface EngineConfig {
  orgId: string
  model?: string
  maxIterations?: number
}

export type AgentEvent =
  | { type: 'thinking'; data: string }
  | { type: 'tool_call'; data: { name: string; input: unknown } }
  | { type: 'tool_result'; data: { name: string; result: unknown; success: boolean } }
  | { type: 'message'; data: string }
  | { type: 'error'; data: string }
  | { type: 'done'; data: unknown }

export async function* runAgentChat(
  message: string,
  config: EngineConfig
): AsyncGenerator<AgentEvent> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const maxIterations = config.maxIterations || 8

  // Model routing: select model based on message complexity
  const autoRouted = !config.model
  const selection = autoRouted ? selectModel(message) : null
  const model = config.model || selection?.model || 'claude-sonnet-4-5-20250929'
  const maxTokens = selection ? getModel(selection.tier).maxTokens : 4096

  const systemPrompt = await buildSystemPrompt(config.orgId)

  if (autoRouted && selection) {
    console.log(`[model-router] ${selection.tier}: ${selection.reasoning}`)
    yield { type: 'thinking', data: `Routing to ${selection.tier} (${selection.reasoning})` }
  }

  const tools = getAgentTools()
  let messages: Anthropic.MessageParam[] = [{ role: 'user', content: message }]

  for (let i = 0; i < maxIterations; i++) {
    let response: Anthropic.Message
    try {
      response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        tools,
        messages,
      })
    } catch (err) {
      yield { type: 'error', data: `API error: ${err instanceof Error ? err.message : String(err)}` }
      yield { type: 'done', data: {} }
      return
    }

    if (response.stop_reason !== 'tool_use') {
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map(b => b.text)
        .join('\n')
      yield { type: 'message', data: text }
      yield { type: 'done', data: { tokens: response.usage, model, tier: selection?.tier } }
      return
    }

    const toolBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
    )

    const toolResults: Anthropic.ToolResultBlockParam[] = []
    for (const tool of toolBlocks) {
      yield { type: 'tool_call', data: { name: tool.name, input: tool.input } }
      try {
        const result = await executeAgentTool(
          tool.name,
          tool.input as Record<string, unknown>,
          config.orgId
        )
        yield {
          type: 'tool_result',
          data: { name: tool.name, result: result.data, success: result.success },
        }
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tool.id,
          content: result.success ? JSON.stringify(result.data) : `Error: ${result.error}`,
          is_error: !result.success,
        })
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        yield {
          type: 'tool_result',
          data: { name: tool.name, result: null, success: false },
        }
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tool.id,
          content: `Tool execution failed: ${errorMsg}`,
          is_error: true,
        })
      }
    }

    messages = [
      ...messages,
      { role: 'assistant', content: response.content },
      { role: 'user', content: toolResults },
    ]
  }

  yield {
    type: 'message',
    data: 'Reached maximum iterations. Please try again with a more specific request.',
  }
  yield { type: 'done', data: {} }
}
