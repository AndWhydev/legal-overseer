import { vi } from 'vitest'
import type { ChannelAdapter, ChannelMessage, ChannelType } from '@/lib/channels/types'

/**
 * Creates a mock channel adapter with configurable responses.
 */
export function createMockAdapter(
  type: ChannelType,
  overrides: Partial<ChannelAdapter> = {},
): ChannelAdapter & { setMessages: (msgs: ChannelMessage[]) => void; setAvailable: (v: boolean) => void } {
  let messages: ChannelMessage[] = []
  let available = true

  const adapter: ChannelAdapter = {
    type,
    name: type.charAt(0).toUpperCase() + type.slice(1),
    description: `Mock ${type} adapter`,
    icon: 'TestIcon',
    pull: vi.fn(async () => messages),
    isAvailable: vi.fn(async () => available),
    ...overrides,
  }

  return {
    ...adapter,
    setMessages(msgs: ChannelMessage[]) { messages = msgs },
    setAvailable(v: boolean) { available = v },
  }
}

/**
 * Create a set of mock channel adapters for all supported channels.
 */
export function createMockChannels() {
  const gmail = createMockAdapter('gmail')
  const outlook = createMockAdapter('outlook')
  const asana = createMockAdapter('asana')
  const calendly = createMockAdapter('calendly')
  const stripe = createMockAdapter('stripe')
  const whatsapp = createMockAdapter('whatsapp')

  return { gmail, outlook, asana, calendly, stripe, whatsapp }
}

/**
 * Factory for ChannelMessage test fixtures.
 */
let msgCounter = 0

export function makeChannelMsg(overrides: Partial<ChannelMessage> = {}): ChannelMessage {
  msgCounter++
  return {
    id: `msg-${msgCounter}`,
    channel: 'gmail',
    externalId: `ext-${msgCounter}`,
    sender: 'Test Sender',
    senderEmail: 'test@example.com',
    subject: 'Test subject',
    body: 'Test body content',
    receivedAt: new Date('2026-02-20T10:00:00Z'),
    isActionable: false,
    priority: 'medium',
    metadata: {},
    ...overrides,
  }
}

export function resetMsgCounter() {
  msgCounter = 0
}
