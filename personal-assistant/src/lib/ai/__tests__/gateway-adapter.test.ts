import { describe, expect, it } from 'vitest'
import { MockLanguageModelV3, simulateReadableStream } from 'ai/test'
import { callModelViaGateway } from '@/lib/ai/gateway-adapter'
import { mockGatewayDirect } from '../../../../test/msw/gateway-handler'

const BASE_CONFIG = {
  model: 'anthropic/claude-sonnet-4.6',
  maxTokens: 256,
  system: 'you are a test',
  tools: [],
  messages: [{ role: 'user' as const, content: 'hello' }],
}

describe('gateway-adapter (AI SDK v6 regression lock)', () => {
  it('accumulates v6 text-delta chunks using `delta` (not v5 `textDelta`)', async () => {
    const model = mockGatewayDirect([
      { type: 'text-delta', id: 'txt1', delta: 'hello ' },
      { type: 'text-delta', id: 'txt1', delta: 'world' },
      { type: 'finish', usage: { inputTokens: 1, outputTokens: 2} },
    ])

    const result = await callModelViaGateway(BASE_CONFIG, model)

    expect(result.streamedDeltas).toEqual(['hello ', 'world'])
    expect(result.response.content[0]).toEqual({ type: 'text', text: 'hello world' })
    // REGRESSION PROOF: AI SDK v6 TextStreamPart text-delta carries `text: string`.
    // If gateway-adapter.ts reverts to v5 `chunk.textDelta` or the v3-provider `chunk.delta`,
    // streamedDeltas becomes [undefined, undefined] and this test fails.
  })

  it('captures reasoning-delta and records thinking start time', async () => {
    const model = mockGatewayDirect([
      { type: 'reasoning-delta', id: 'r1', delta: 'thinking...' },
      { type: 'text-delta', id: 't1', delta: 'done' },
      { type: 'finish' },
    ])

    const result = await callModelViaGateway(BASE_CONFIG, model)

    expect(result.hadThinking).toBe(true)
    expect(result.streamedThinkingDeltas).toContain('thinking...')
    expect(typeof result.thinkingStartTime).toBe('number')
  })

  it('rejects when an error chunk is emitted mid-stream', async () => {
    const model = mockGatewayDirect([
      { type: 'text-delta', id: 't1', delta: 'partial' },
      { type: 'error', error: new Error('provider boom') },
      { type: 'finish' },
    ])

    await expect(callModelViaGateway(BASE_CONFIG, model)).rejects.toThrow(/provider boom/)
    // Regression: before this test existed, error chunks were silently dropped and the adapter finished with empty content, causing 'API error: Cannot read properties of undefined' downstream.
  })

  it('reads v6 usage fields (inputTokens/outputTokens), not v5 prompt/completion', async () => {
    const model = mockGatewayDirect([
      { type: 'text-delta', id: 't1', delta: 'hi' },
      { type: 'finish', usage: { inputTokens: 12, outputTokens: 34} },
    ])

    const result = await callModelViaGateway(BASE_CONFIG, model)

    expect(result.response.usage.input_tokens).toBe(12)
    expect(result.response.usage.output_tokens).toBe(34)
    // REGRESSION PROOF: v5 used promptTokens/completionTokens. If the adapter reads those, these numbers become undefined.
  })

  it('round-trips a tool-call chunk into Anthropic-shaped tool_use content', async () => {
    const model = mockGatewayDirect([
      {
        type: 'tool-call',
        toolCallId: 'tc1',
        toolName: 'get_weather',
        input: { city: 'BNE' },
      },
      { type: 'finish', finishReason: 'tool-calls' },
    ])

    const result = await callModelViaGateway(BASE_CONFIG, model)

    const toolUse = result.response.content.find(
      (b): b is { type: 'tool_use'; id: string; name: string; input: unknown } => b.type === 'tool_use',
    )
    expect(toolUse).toBeDefined()
    expect(toolUse).toEqual({
      type: 'tool_use',
      id: 'tc1',
      name: 'get_weather',
      input: { city: 'BNE' },
    })
  })

  it('passes systemContentBlocks as SystemModelMessage array (v6 system-param shape)', async () => {
    // REGRESSION PROOF: commit 8456b5f0 built system parts as
    //   { type: 'text', text, providerOptions }
    // which crashed at runtime with:
    //   "Invalid prompt: system must be a string, SystemModelMessage,
    //    or array of SystemModelMessage".
    // v6 requires { role: 'system', content, providerOptions? }. This test
    // captures the prompt forwarded to the provider and asserts the shape.
    let capturedPrompt: unknown
    const model = new MockLanguageModelV3({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      doStream: (async (options: any) => {
        capturedPrompt = options.prompt
        return {
          stream: simulateReadableStream({
            chunks: [
              { type: 'stream-start', warnings: [] },
              { type: 'text-start', id: 't1' },
              { type: 'text-delta', id: 't1', delta: 'ok' },
              { type: 'text-end', id: 't1' },
              {
                type: 'finish',
                finishReason: 'stop',
                usage: {
                  inputTokens: { total: 1 },
                  outputTokens: { total: 1, prediction: {} },
                },
              },
            ],
            chunkDelayInMs: null,
            initialDelayInMs: null,
          }),
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any,
    })

    await callModelViaGateway(
      {
        model: 'anthropic/claude-sonnet-4.6',
        maxTokens: 256,
        system: 'fallback',
        systemContentBlocks: [
          { type: 'text', text: 'cached part', cache_control: { type: 'ephemeral' } },
          { type: 'text', text: 'uncached part' },
        ],
        tools: [],
        messages: [{ role: 'user' as const, content: 'hello' }],
      },
      model,
    )

    const prompt = capturedPrompt as Array<{
      role: string
      content: unknown
      providerOptions?: Record<string, unknown>
    }>
    const systemMsgs = prompt.filter(m => m.role === 'system')
    expect(systemMsgs).toHaveLength(2)
    expect(systemMsgs[0].providerOptions?.anthropic).toEqual({
      cacheControl: { type: 'ephemeral' },
    })
    expect(systemMsgs[1].providerOptions).toBeUndefined()
  })

  it('does not throw when toolCalls resolves to undefined (length-of-undefined regression)', async () => {
    const model = mockGatewayDirect(
      [
        { type: 'text-delta', id: 't1', delta: 'ok' },
        { type: 'finish' },
      ],
      // Force streamResult.toolCalls to resolve to undefined — the exact shape that
      // caused today's 'Cannot read properties of undefined (reading \'length\')' crash.
      { toolCallsOverride: undefined },
    )

    const result = await callModelViaGateway(BASE_CONFIG, model)
    expect(Array.isArray(result.response.content)).toBe(true)
    // Must still produce a text block from the streamed delta even when tool calls are absent.
    expect(result.response.content.some(b => b.type === 'text')).toBe(true)
  })
})
