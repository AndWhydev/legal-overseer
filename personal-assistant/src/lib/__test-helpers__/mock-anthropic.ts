import { vi } from 'vitest'
import { resolveModel } from '@/lib/agent/model-registry'

/**
 * Creates a mock Anthropic client that returns canned responses.
 * Usage:
 *   const { client, mockCreate, setResponse } = createMockAnthropic()
 *   setResponse({ text: '{"intent":"invoice"}' })
 */
export function createMockAnthropic() {
  const mockCreate = vi.fn()

  function setResponse(options: { text: string } | { error: Error }) {
    if ('error' in options) {
      mockCreate.mockRejectedValue(options.error)
    } else {
      mockCreate.mockResolvedValue({
        id: 'msg-mock',
        type: 'message',
        role: 'assistant',
        model: resolveModel('classification'),
        content: [{ type: 'text', text: options.text }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 100, output_tokens: 50 },
      })
    }
  }

  const client = {
    messages: { create: mockCreate },
  }

  return { client: client as any, mockCreate, setResponse }
}
