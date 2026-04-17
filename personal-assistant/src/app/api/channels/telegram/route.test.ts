import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
  createClientMock,
  resolveChannelIdentityMock,
  resolveOrgFromWebhookMock,
  linkChannelIdentityMock,
  sendTelegramMessageMock,
  handleGatewayMessageMock,
} = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  resolveChannelIdentityMock: vi.fn(),
  resolveOrgFromWebhookMock: vi.fn(),
  linkChannelIdentityMock: vi.fn(),
  sendTelegramMessageMock: vi.fn(),
  handleGatewayMessageMock: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: createClientMock,
}))
vi.mock('@/lib/conversation/identity-resolver', () => ({
  resolveChannelIdentity: resolveChannelIdentityMock,
  linkChannelIdentity: linkChannelIdentityMock,
}))
vi.mock('@/lib/core/resolve-org', () => ({
  resolveOrgFromWebhook: resolveOrgFromWebhookMock,
}))
vi.mock('@/lib/channels/gateway-handler', () => ({
  handleGatewayMessage: handleGatewayMessageMock,
}))
vi.mock('@/lib/channels/telegram', () => ({
  sendTelegramMessage: sendTelegramMessageMock,
}))
vi.mock('@/lib/security/webhook-verification', () => ({
  timingSafeCompare: (a: string, b: string) => a === b,
}))
vi.mock('@/lib/core/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))
vi.mock('next/server', async (importOriginal) => {
  const mod = await importOriginal<typeof import('next/server')>()
  return { ...mod, after: (fn: () => Promise<void>) => { void fn() } }
})

const CHAT_ID = '1234567890'
const ORG_ID = 'org-target-abc'

/**
 * Builds a mocked supabase client that returns `conn` from the
 * org_connections lookup in consumePairingCode. Captures update/insert calls
 * for assertion.
 */
function buildSupabase(
  conn: {
    id: string
    org_id: string
    config: Record<string, unknown>
    status: string
  } | null,
) {
  const updates: Array<{ patch: Record<string, unknown>; id?: string }> = []

  const maybeSingle = vi.fn().mockResolvedValue({ data: conn, error: null })

  const selectBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    filter: vi.fn().mockReturnThis(),
    maybeSingle,
    update: vi.fn().mockImplementation((patch: Record<string, unknown>) => ({
      eq: vi.fn().mockImplementation(async (_col: string, val: string) => {
        updates.push({ patch, id: val })
        return { data: null, error: null }
      }),
    })),
  }

  const from = vi.fn().mockReturnValue(selectBuilder)
  return { supabase: { from } as unknown as ReturnType<typeof createClientMock>, updates }
}

function buildRequest(text: string): NextRequest {
  return new Request('https://app.bitbit.chat/api/webhooks/telegram', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      message: {
        message_id: 1,
        chat: { id: Number(CHAT_ID) },
        from: { id: 99, first_name: 'Alex' },
        text,
      },
    }),
  }) as unknown as NextRequest
}

describe('POST /api/channels/telegram — pairing flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
    delete process.env.TELEGRAM_WEBHOOK_SECRET
  })

  it('/start <CODE> with valid code links identity and marks connection connected', async () => {
    const { supabase, updates } = buildSupabase({
      id: 'conn-1',
      org_id: ORG_ID,
      config: {
        pairing_code: 'ABCD1234EF',
        pairing_code_expires_at: new Date(Date.now() + 60_000).toISOString(),
        user_id: 'user-target',
      },
      status: 'provisioning',
    })
    createClientMock.mockReturnValue(supabase)

    const mod = await import('./route')
    const res = await mod.POST(buildRequest('/start ABCD1234EF'))

    expect(res.status).toBe(200)

    // Channel identity was linked for the telegram chat_id → org.
    expect(linkChannelIdentityMock).toHaveBeenCalledOnce()
    const [, userId, orgId, identifier] = linkChannelIdentityMock.mock.calls[0]
    expect(userId).toBe('user-target')
    expect(orgId).toBe(ORG_ID)
    expect(identifier.channelIdentifier).toBe(CHAT_ID)
    expect(identifier.channelType).toBe('telegram')

    // Connection status flipped to connected + code scrubbed.
    const connectedUpdate = updates.find(u => u.patch.status === 'connected')
    expect(connectedUpdate).toBeTruthy()
    const newConfig = connectedUpdate?.patch.config as Record<string, unknown>
    expect(newConfig.chat_id).toBe(CHAT_ID)
    expect(newConfig.pairing_code).toBe(null)
    expect(newConfig.pairing_code_expires_at).toBe(null)
    expect(newConfig.linked_at).toBeTruthy()

    // Default inbox pipeline was not invoked — pairing branch returns early.
    expect(handleGatewayMessageMock).not.toHaveBeenCalled()

    // Confirmation message sent back to user.
    expect(sendTelegramMessageMock).toHaveBeenCalledWith(
      CHAT_ID,
      expect.stringContaining("all set"),
    )
  })

  it('/start <CODE> with expired code flips status=error and does not link', async () => {
    const { supabase, updates } = buildSupabase({
      id: 'conn-1',
      org_id: ORG_ID,
      config: {
        pairing_code: 'EXPIREDCDE',
        pairing_code_expires_at: new Date(Date.now() - 60_000).toISOString(),
        user_id: 'user-target',
      },
      status: 'provisioning',
    })
    createClientMock.mockReturnValue(supabase)
    resolveChannelIdentityMock.mockResolvedValue(null)
    resolveOrgFromWebhookMock.mockResolvedValue(null)

    const mod = await import('./route')
    await mod.POST(buildRequest('/start EXPIREDCDE'))

    const errUpdate = updates.find(u => u.patch.status === 'error')
    expect(errUpdate?.patch.last_error).toMatch(/expired/i)
    expect(linkChannelIdentityMock).not.toHaveBeenCalled()

    // Falls through to unrecognised-chat reply (no identity resolved).
    expect(sendTelegramMessageMock).toHaveBeenCalledWith(
      CHAT_ID,
      expect.stringContaining("recognize"),
    )
  })

  it('/start <UNKNOWN> falls through when code does not match any row', async () => {
    const { supabase } = buildSupabase(null)
    createClientMock.mockReturnValue(supabase)
    resolveChannelIdentityMock.mockResolvedValue(null)
    resolveOrgFromWebhookMock.mockResolvedValue(null)

    const mod = await import('./route')
    await mod.POST(buildRequest('/start NOSUCH1234'))

    expect(linkChannelIdentityMock).not.toHaveBeenCalled()
    expect(sendTelegramMessageMock).toHaveBeenCalledWith(
      CHAT_ID,
      expect.stringContaining("recognize"),
    )
  })

  it('plain /start (no code) falls through to default handler', async () => {
    const { supabase } = buildSupabase(null)
    createClientMock.mockReturnValue(supabase)
    resolveChannelIdentityMock.mockResolvedValue(null)
    resolveOrgFromWebhookMock.mockResolvedValue(null)

    const mod = await import('./route')
    await mod.POST(buildRequest('/start'))

    // Regex requires at least 4 chars after /start — plain /start is not a
    // pairing attempt, so the pair lookup path is skipped entirely.
    expect(linkChannelIdentityMock).not.toHaveBeenCalled()
  })

  it('normal message on already-linked chat routes to gateway handler', async () => {
    const { supabase } = buildSupabase(null)
    createClientMock.mockReturnValue(supabase)
    resolveChannelIdentityMock.mockResolvedValue({
      userId: 'user-x',
      orgId: ORG_ID,
      displayName: 'Alex',
    })

    const mod = await import('./route')
    await mod.POST(buildRequest('hey BitBit, what meetings do I have?'))

    expect(handleGatewayMessageMock).toHaveBeenCalledOnce()
    const arg = handleGatewayMessageMock.mock.calls[0][0]
    expect(arg.channel).toBe('telegram')
    expect(arg.text).toMatch(/meetings/)
    expect(arg.identity.orgId).toBe(ORG_ID)
  })
})
