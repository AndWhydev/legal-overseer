import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

type SendResult = { success: boolean; error?: string }

// Hoisted references so vi.mock factories can see them at top of module init.
const hoisted = vi.hoisted(() => {
  type SendFnMock = (to: string, text: string) => Promise<SendResult>
  type TypingFnMock = (to: string) => Promise<void>
  type VoidFnMock = (to: string, text: string) => Promise<void>

  const pipelineHandleMessage = vi.fn()
  const sendSendblueMessage = vi.fn<SendFnMock>(async () => ({ success: true }))
  const sendTypingIndicator = vi.fn<TypingFnMock>(async () => undefined)
  const sendVoiceMemoBubble = vi.fn<SendFnMock>(async () => ({ success: true }))
  const sendTelegramMessage = vi.fn<VoidFnMock>(async () => undefined)
  const sendTelnyxWhatsApp = vi.fn<SendFnMock>(async () => ({ success: true }))
  const keepaliveInstances: Array<{
    start: ReturnType<typeof vi.fn>
    stop: ReturnType<typeof vi.fn>
    reassert: ReturnType<typeof vi.fn>
    options: { send: () => Promise<void> } | undefined
  }> = []
  return {
    pipelineHandleMessage,
    sendSendblueMessage,
    sendTypingIndicator,
    sendVoiceMemoBubble,
    sendTelegramMessage,
    sendTelnyxWhatsApp,
    keepaliveInstances,
  }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ __isMockSupabase: true })),
}))

vi.mock('@/lib/conversation/unified-pipeline', () => ({
  UnifiedConversationPipeline: class {
    handleMessage = hoisted.pipelineHandleMessage
  },
}))

vi.mock('../sendblue', () => ({
  sendSendblueMessage: hoisted.sendSendblueMessage,
  sendTypingIndicator: hoisted.sendTypingIndicator,
}))

vi.mock('../sendblue-voice-memo', () => ({
  sendVoiceMemoBubble: hoisted.sendVoiceMemoBubble,
}))

vi.mock('../telegram', () => ({
  sendTelegramMessage: hoisted.sendTelegramMessage,
}))

vi.mock('../telnyx-whatsapp', () => ({
  sendTelnyxWhatsApp: hoisted.sendTelnyxWhatsApp,
}))

vi.mock('../typing-keepalive', () => ({
  TypingKeepalive: class {
    start = vi.fn()
    stop = vi.fn()
    reassert = vi.fn()
    options: { send: () => Promise<void> } | undefined
    constructor(options?: { send: () => Promise<void> }) {
      this.options = options
      hoisted.keepaliveInstances.push(this as unknown as {
        start: ReturnType<typeof vi.fn>
        stop: ReturnType<typeof vi.fn>
        reassert: ReturnType<typeof vi.fn>
        options: { send: () => Promise<void> } | undefined
      })
    }
  },
  NOOP_TYPING_KEEPALIVE: { start() {}, stop() {}, reassert() {} },
}))

import { handleGatewayMessage } from '../gateway-handler'

async function* yieldMessage(text: string) {
  yield { type: 'message', data: text }
}

const IDENTITY = { userId: 'user-1', orgId: 'org-1' }

function lastKeepalive() {
  return hoisted.keepaliveInstances[hoisted.keepaliveInstances.length - 1]
}

describe('handleGatewayMessage — integration', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://supabase.local')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-test')
    vi.stubEnv('BITBIT_IMESSAGE_STREAMING', 'false')
    hoisted.keepaliveInstances.length = 0
    hoisted.pipelineHandleMessage.mockReset()
    hoisted.sendSendblueMessage.mockClear()
    hoisted.sendTypingIndicator.mockClear()
    hoisted.sendVoiceMemoBubble.mockClear()
    hoisted.sendTelegramMessage.mockClear()
    hoisted.sendTelnyxWhatsApp.mockClear()
    // Reset mocks to default success resolution after mockClear.
    hoisted.sendSendblueMessage.mockResolvedValue({ success: true })
    hoisted.sendTypingIndicator.mockResolvedValue(undefined)
    hoisted.sendVoiceMemoBubble.mockResolvedValue({ success: true })
    hoisted.sendTelegramMessage.mockResolvedValue(undefined)
    hoisted.sendTelnyxWhatsApp.mockResolvedValue({ success: true })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })

  it('legacy path: sendblue single bubble → one send, keepalive started+stopped', async () => {
    hoisted.pipelineHandleMessage.mockImplementation(() => yieldMessage('hello there'))

    await handleGatewayMessage({
      channel: 'sendblue',
      text: 'hi',
      identity: IDENTITY,
      replyTo: '+61412345678',
    })

    expect(hoisted.sendSendblueMessage).toHaveBeenCalledTimes(1)
    expect(hoisted.sendSendblueMessage).toHaveBeenCalledWith('+61412345678', 'hello there')
    const ka = lastKeepalive()
    expect(ka.start).toHaveBeenCalledTimes(1)
    expect(ka.stop).toHaveBeenCalledTimes(1)
  })

  it('legacy path: markdown is stripped before the send (channel-aware render)', async () => {
    hoisted.pipelineHandleMessage.mockImplementation(() =>
      yieldMessage('**Bold** and _italic_ and\n- a\n- b'),
    )

    await handleGatewayMessage({
      channel: 'sendblue',
      text: 'hi',
      identity: IDENTITY,
      replyTo: '+61412345678',
    })

    const sent = hoisted.sendSendblueMessage.mock.calls.map(c => c[1] as string)
    expect(sent.join('\n')).not.toMatch(/\*\*/)
    expect(sent.join('\n')).not.toMatch(/^- /m)
    expect(sent.join('\n')).toMatch(/• a/)
  })

  it('streaming path: flag ON + sendblue → accumulator produces path-specific bubble boundaries', async () => {
    // 5 paragraphs, >40 non-whitespace chars → triggers accumulator's early
    // drain on push(). The streaming path ships the first paragraph solo,
    // then collapses middle paragraphs into bubble #2, and reserves the
    // final slot for flushComplete() (which ships the trailing paragraph).
    // The legacy path, by contrast, splits the full text in one pass and
    // caps by collapsing the *tail* (p3+p4+p5) into bubble #3 — so comparing
    // bubble #2 and #3 proves which path ran.
    vi.stubEnv('BITBIT_IMESSAGE_STREAMING', 'true')
    vi.useFakeTimers()
    const paragraphs = [
      'para one alpha bravo',
      'para two charlie delta',
      'para three echo foxtrot',
      'para four golf hotel',
      'para five india juliet',
    ]
    const multi = paragraphs.join('\n\n')
    hoisted.pipelineHandleMessage.mockImplementation(() => yieldMessage(multi))

    const promise = handleGatewayMessage({
      channel: 'sendblue',
      text: 'hi',
      identity: IDENTITY,
      replyTo: '+61412345678',
    })
    await vi.runAllTimersAsync()
    await promise

    expect(hoisted.sendSendblueMessage).toHaveBeenCalledTimes(3)
    // Bubble #1: first paragraph shipped solo by accumulator drain.
    expect(hoisted.sendSendblueMessage.mock.calls[0][1]).toBe('para one alpha bravo')
    // Bubble #2: middle paragraphs collapsed by shipText's slot-cap logic
    // (accumulator-specific — legacy would ship 'para two charlie delta' alone).
    expect(hoisted.sendSendblueMessage.mock.calls[1][1]).toBe(
      'para two charlie delta\n\npara three echo foxtrot\n\npara four golf hotel',
    )
    // Bubble #3: final paragraph shipped by flushComplete (legacy would
    // collapse p3+p4+p5 here instead).
    expect(hoisted.sendSendblueMessage.mock.calls[2][1]).toBe('para five india juliet')

    const ka = lastKeepalive()
    expect(ka.reassert.mock.calls.length).toBeGreaterThanOrEqual(1)
    expect(ka.stop).toHaveBeenCalledTimes(1)

    // The TypingKeepalive constructor was given a `send` callback that
    // forwards to sendTypingIndicator(replyTo) — regression-proof against
    // someone removing that wiring.
    expect(ka.options).toBeDefined()
    await ka.options!.send()
    expect(hoisted.sendTypingIndicator).toHaveBeenCalledWith('+61412345678')
  })

  it('streaming path: flag ON + whatsapp → still legacy (sendblue-only gate)', async () => {
    vi.stubEnv('BITBIT_IMESSAGE_STREAMING', 'true')
    hoisted.pipelineHandleMessage.mockImplementation(() => yieldMessage('hey'))

    await handleGatewayMessage({
      channel: 'whatsapp',
      text: 'hi',
      identity: IDENTITY,
      replyTo: '+61412345678',
    })

    expect(hoisted.sendTelnyxWhatsApp).toHaveBeenCalledTimes(1)
    expect(hoisted.keepaliveInstances.length).toBe(0)
  })

  it('non-sendblue channel: no typing keepalive instance is constructed', async () => {
    hoisted.pipelineHandleMessage.mockImplementation(() => yieldMessage('ack'))

    await handleGatewayMessage({
      channel: 'telegram',
      text: 'hi',
      identity: IDENTITY,
      replyTo: 'chat-42',
    })

    expect(hoisted.sendTelegramMessage).toHaveBeenCalledWith('chat-42', 'ack')
    expect(hoisted.keepaliveInstances.length).toBe(0)
    expect(hoisted.sendTypingIndicator).not.toHaveBeenCalled()
  })

  it('pipeline throws → error reply sent, keepalive stopped', async () => {
    hoisted.pipelineHandleMessage.mockImplementation(async function* () {
      throw new Error('boom')
    })

    await handleGatewayMessage({
      channel: 'sendblue',
      text: 'hi',
      identity: IDENTITY,
      replyTo: '+61412345678',
    })

    expect(hoisted.sendSendblueMessage).toHaveBeenCalledTimes(1)
    expect(hoisted.sendSendblueMessage.mock.calls[0][1]).toMatch(/something went wrong/i)
    const ka = lastKeepalive()
    expect(ka.stop).toHaveBeenCalledTimes(1)
  })

  it('pipeline returns no message event → error reply sent, keepalive stopped', async () => {
    hoisted.pipelineHandleMessage.mockImplementation(async function* () {
      yield { type: 'thread', data: { threadId: 't-1', isNew: true } }
    })

    await handleGatewayMessage({
      channel: 'sendblue',
      text: 'hi',
      identity: IDENTITY,
      replyTo: '+61412345678',
    })

    expect(hoisted.sendSendblueMessage).toHaveBeenCalledTimes(1)
    expect(hoisted.sendSendblueMessage.mock.calls[0][1]).toMatch(/something went wrong/i)
    expect(lastKeepalive().stop).toHaveBeenCalledTimes(1)
  })

  it('missing Supabase env → error reply, pipeline never constructed', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    hoisted.pipelineHandleMessage.mockImplementation(() => yieldMessage('should not get here'))

    await handleGatewayMessage({
      channel: 'sendblue',
      text: 'hi',
      identity: IDENTITY,
      replyTo: '+61412345678',
    })

    expect(hoisted.pipelineHandleMessage).not.toHaveBeenCalled()
    expect(hoisted.sendSendblueMessage).toHaveBeenCalledTimes(1)
    expect(hoisted.sendSendblueMessage.mock.calls[0][1]).toMatch(/something went wrong/i)
  })

  it('voice memo: short reply + voiceNote metadata → sends audio, skips text', async () => {
    hoisted.pipelineHandleMessage.mockImplementation(() => yieldMessage('quick reply here'))
    hoisted.sendVoiceMemoBubble.mockResolvedValueOnce({ success: true })

    await handleGatewayMessage({
      channel: 'sendblue',
      text: '(voice note)',
      identity: IDENTITY,
      replyTo: '+61412345678',
      channelMetadata: { isVoiceNote: true },
    })

    expect(hoisted.sendVoiceMemoBubble).toHaveBeenCalledTimes(1)
    expect(hoisted.sendVoiceMemoBubble).toHaveBeenCalledWith('+61412345678', 'quick reply here')
    expect(hoisted.sendSendblueMessage).not.toHaveBeenCalled()
    expect(lastKeepalive().stop).toHaveBeenCalledTimes(1)
  })

  it('voice memo: streaming flag + voiceNote → voice path wins over streaming', async () => {
    // Pins the branch ordering in gateway-handler.ts: voice-memo check (L~192)
    // runs BEFORE the streaming-accumulator branch (L~206). If someone reorders
    // them, this test flags it — voice replies must never leak through the
    // streaming path and get text-bubbled.
    vi.stubEnv('BITBIT_IMESSAGE_STREAMING', 'true')
    hoisted.pipelineHandleMessage.mockImplementation(() => yieldMessage('quick reply here'))
    hoisted.sendVoiceMemoBubble.mockResolvedValueOnce({ success: true })

    await handleGatewayMessage({
      channel: 'sendblue',
      text: '(voice note)',
      identity: IDENTITY,
      replyTo: '+61412345678',
      channelMetadata: { isVoiceNote: true },
    })

    expect(hoisted.sendVoiceMemoBubble).toHaveBeenCalledTimes(1)
    expect(hoisted.sendVoiceMemoBubble).toHaveBeenCalledWith('+61412345678', 'quick reply here')
    expect(hoisted.sendSendblueMessage).not.toHaveBeenCalled()
    expect(lastKeepalive().stop).toHaveBeenCalledTimes(1)
  })

  it('voice memo: synthesis fails → falls back to text path', async () => {
    hoisted.pipelineHandleMessage.mockImplementation(() => yieldMessage('quick reply here'))
    hoisted.sendVoiceMemoBubble.mockResolvedValueOnce({ success: false, error: 'synth err' })

    await handleGatewayMessage({
      channel: 'sendblue',
      text: '(voice note)',
      identity: IDENTITY,
      replyTo: '+61412345678',
      channelMetadata: { isVoiceNote: true },
    })

    expect(hoisted.sendVoiceMemoBubble).toHaveBeenCalledTimes(1)
    expect(hoisted.sendSendblueMessage).toHaveBeenCalledWith('+61412345678', 'quick reply here')
  })

  it('voice memo: long reply (>30 words) skips voice attempt entirely', async () => {
    const longReply = Array.from({ length: 40 }, (_, i) => `w${i}`).join(' ')
    hoisted.pipelineHandleMessage.mockImplementation(() => yieldMessage(longReply))

    await handleGatewayMessage({
      channel: 'sendblue',
      text: '(voice note)',
      identity: IDENTITY,
      replyTo: '+61412345678',
      channelMetadata: { isVoiceNote: true },
    })

    expect(hoisted.sendVoiceMemoBubble).not.toHaveBeenCalled()
    expect(hoisted.sendSendblueMessage).toHaveBeenCalledTimes(1)
  })

  it('legacy path: multi-paragraph reply → 3 sends capped (splitIntoBubbles integration)', async () => {
    // Pins MAX_BUBBLES=3 cap + tail-collapse shape from splitIntoBubbles — update both if that constant moves.
    vi.useFakeTimers()
    const multi = ['one', 'two', 'three', 'four', 'five'].join('\n\n')
    hoisted.pipelineHandleMessage.mockImplementation(() => yieldMessage(multi))

    const promise = handleGatewayMessage({
      channel: 'sendblue',
      text: 'hi',
      identity: IDENTITY,
      replyTo: '+61412345678',
    })
    await vi.runAllTimersAsync()
    await promise

    expect(hoisted.sendSendblueMessage).toHaveBeenCalledTimes(3)
    expect(hoisted.sendSendblueMessage.mock.calls[0][1]).toBe('one')
    expect(hoisted.sendSendblueMessage.mock.calls[1][1]).toBe('two')
    expect(hoisted.sendSendblueMessage.mock.calls[2][1]).toBe('three\n\nfour\n\nfive')
  })
})
