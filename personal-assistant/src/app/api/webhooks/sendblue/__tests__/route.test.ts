import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '../route'
import { NextRequest } from 'next/server'

// Mock dependencies
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      insert: () => ({ select: () => ({ single: () => ({ data: { id: 'msg-1' } }) }) }),
      select: () => ({ eq: () => ({ single: () => ({ data: null }) }) }),
    }),
  }),
}))

vi.mock('@/lib/conversation/identity-resolver', () => ({
  resolveChannelIdentity: vi.fn(),
}))

vi.mock('@/lib/conversation/inbound-enrichment', () => ({
  enrichInboundMessage: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/channels/gateway-handler', () => ({
  handleGatewayMessage: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/channels/sendblue', () => ({
  sendSendblueMessage: vi.fn().mockResolvedValue({ success: true }),
}))

vi.mock('@/lib/channels/sendblue-media', () => ({
  downloadSendblueMedia: vi.fn(),
}))

vi.mock('@/lib/channels/voice-transcription', () => ({
  transcribeVoiceNote: vi.fn(),
}))

vi.mock('@/lib/core/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

function makeRequest(body: Record<string, unknown>, headers?: Record<string, string>): NextRequest {
  return new NextRequest('https://app.bitbit.chat/api/webhooks/sendblue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

describe('POST /api/webhooks/sendblue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
    process.env.SENDBLUE_FROM_NUMBER = '+15551234567'
  })

  it('returns 400 on invalid JSON', async () => {
    const req = new NextRequest('https://app.bitbit.chat/api/webhooks/sendblue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 403 on API key mismatch', async () => {
    process.env.SENDBLUE_WEBHOOK_SECRET = 'correct-key'
    try {
      const res = await POST(makeRequest(
        { from_number: '+1234', content: 'test' },
        { 'sb-api-key-id': 'wrong-key' },
      ))
      expect(res.status).toBe(403)
    } finally {
      delete process.env.SENDBLUE_WEBHOOK_SECRET
    }
  })

  it('handles status callbacks gracefully', async () => {
    const res = await POST(makeRequest({
      status: 'DELIVERED',
      to_number: '+1234',
      from_number: '+5678',
      content: '',
    }))
    const body = await res.json()
    expect(body.ok).toBe(true)
  })

  it('ignores messages with no content or media', async () => {
    const res = await POST(makeRequest({
      from_number: '+1234',
      to_number: '+5678',
      content: '',
    }))
    const body = await res.json()
    expect(body.ok).toBe(true)
  })

  it('ignores echo messages from our own number', async () => {
    const { handleGatewayMessage } = await import('@/lib/channels/gateway-handler')
    const res = await POST(makeRequest({
      from_number: '+15551234567',
      to_number: '+1999',
      content: 'echo',
    }))
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(handleGatewayMessage).not.toHaveBeenCalled()
  })

  it('sends registration reply for unknown numbers', async () => {
    const { resolveChannelIdentity } = await import('@/lib/conversation/identity-resolver')
    const { sendSendblueMessage } = await import('@/lib/channels/sendblue')
    vi.mocked(resolveChannelIdentity).mockResolvedValue(null)

    const res = await POST(makeRequest({
      from_number: '+1999',
      to_number: '+5678',
      content: 'hello',
    }))
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(sendSendblueMessage).toHaveBeenCalledWith('+1999', expect.stringContaining('not set up'))
  })

  it('processes text messages through gateway handler', async () => {
    const { resolveChannelIdentity } = await import('@/lib/conversation/identity-resolver')
    const { handleGatewayMessage } = await import('@/lib/channels/gateway-handler')
    vi.mocked(resolveChannelIdentity).mockResolvedValue({
      userId: 'user-1', orgId: 'org-1', email: 'test@test.com',
      displayName: 'Test User', isAuthenticated: true,
    })

    await POST(makeRequest({
      from_number: '+1999',
      to_number: '+5678',
      content: 'hey what\'s up',
    }))

    expect(handleGatewayMessage).toHaveBeenCalledWith(expect.objectContaining({
      channel: 'sendblue',
      text: "hey what's up",
      replyTo: '+1999',
    }))
  })

  it('processes voice memo with transcription', async () => {
    const { resolveChannelIdentity } = await import('@/lib/conversation/identity-resolver')
    const { downloadSendblueMedia } = await import('@/lib/channels/sendblue-media')
    const { transcribeVoiceNote } = await import('@/lib/channels/voice-transcription')
    const { handleGatewayMessage } = await import('@/lib/channels/gateway-handler')

    vi.mocked(resolveChannelIdentity).mockResolvedValue({
      userId: 'user-1', orgId: 'org-1', email: 'test@test.com',
      displayName: 'Test User', isAuthenticated: true,
    })
    vi.mocked(downloadSendblueMedia).mockResolvedValue({
      buffer: Buffer.from('audio'),
      mimeType: 'audio/x-caf',
      filename: 'voice.caf',
      category: 'audio',
    })
    vi.mocked(transcribeVoiceNote).mockResolvedValue({
      text: 'hey can you check my calendar',
      duration: 5,
      language: 'en',
      success: true,
    })

    await POST(makeRequest({
      from_number: '+1999',
      to_number: '+5678',
      content: '',
      media_url: 'https://cdn.sendblue.co/voice.caf',
    }))

    expect(handleGatewayMessage).toHaveBeenCalledWith(expect.objectContaining({
      text: '[voice note]: "hey can you check my calendar"',
      channelMetadata: expect.objectContaining({ isVoiceNote: true }),
    }))
  })

  it('processes images with vision content blocks', async () => {
    const { resolveChannelIdentity } = await import('@/lib/conversation/identity-resolver')
    const { downloadSendblueMedia } = await import('@/lib/channels/sendblue-media')
    const { handleGatewayMessage } = await import('@/lib/channels/gateway-handler')

    vi.mocked(resolveChannelIdentity).mockResolvedValue({
      userId: 'user-1', orgId: 'org-1', email: 'test@test.com',
      displayName: 'Test User', isAuthenticated: true,
    })
    vi.mocked(downloadSendblueMedia).mockResolvedValue({
      buffer: Buffer.from('fake-png'),
      mimeType: 'image/png',
      filename: 'photo.png',
      category: 'image',
    })

    await POST(makeRequest({
      from_number: '+1999',
      to_number: '+5678',
      content: 'what is this?',
      media_url: 'https://cdn.sendblue.co/photo.png',
    }))

    expect(handleGatewayMessage).toHaveBeenCalledWith(expect.objectContaining({
      text: 'what is this?',
      contentBlocks: [expect.objectContaining({
        type: 'image',
        source: expect.objectContaining({ type: 'base64', media_type: 'image/png' }),
      })],
    }))
  })
})
