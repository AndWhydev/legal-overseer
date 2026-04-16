import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('@/lib/core/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

import {
  channelToolHandlers,
  channelToolDefinitions,
  normaliseIMessageHandle,
} from '../channel-tools'

const ORG_ID = 'org-test-123'
const BB_URL = 'https://bb.example.com'
const BB_PASSWORD = 'pw with spaces & symbols'

function makeSupabase(opts: {
  connection?: { id: string; config: { bb_server_url: string; bb_password: string } } | null
  insertError?: unknown
} = {}): SupabaseClient {
  const { connection = { id: 'conn-1', config: { bb_server_url: BB_URL, bb_password: BB_PASSWORD } }, insertError } = opts
  const inserts: unknown[] = []

  const fromMock = vi.fn((table: string) => {
    if (table === 'org_connections') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: connection, error: null }),
      }
    }
    if (table === 'channel_messages') {
      return {
        insert: vi.fn((row: unknown) => {
          inserts.push(row)
          return insertError
            ? Promise.reject(insertError)
            : Promise.resolve({ data: null, error: null })
        }),
      }
    }
    return { select: vi.fn().mockReturnThis() }
  })
  const supabase = { from: fromMock, _inserts: inserts } as unknown as SupabaseClient
  return supabase
}

describe('normaliseIMessageHandle', () => {
  it('accepts Apple ID email (lowercased)', () => {
    expect(normaliseIMessageHandle('User@Example.com')).toBe('user@example.com')
  })

  it('rejects malformed email', () => {
    expect(normaliseIMessageHandle('not-an-email@')).toBeNull()
  })

  it('accepts +E.164 phone', () => {
    expect(normaliseIMessageHandle('+61400123456')).toBe('+61400123456')
  })

  it('normalises AU local 04xxxxxxxx → +614xxxxxxxx', () => {
    expect(normaliseIMessageHandle('0400123456')).toBe('+61400123456')
  })

  it('strips whitespace, dashes, parens', () => {
    expect(normaliseIMessageHandle('+61 400-123 (456)')).toBe('+61400123456')
  })

  it('rejects too-short numbers', () => {
    expect(normaliseIMessageHandle('12345')).toBeNull()
  })

  it('rejects non-digit garbage', () => {
    expect(normaliseIMessageHandle('abc123def')).toBeNull()
  })

  it('rejects empty / whitespace', () => {
    expect(normaliseIMessageHandle('')).toBeNull()
    expect(normaliseIMessageHandle('   ')).toBeNull()
  })
})

describe('send_imessage tool', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    globalThis.fetch = fetchMock as unknown as typeof fetch
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('is registered in tool definitions and handlers', () => {
    expect(channelToolDefinitions.some(t => t.name === 'send_imessage')).toBe(true)
    expect(typeof channelToolHandlers.send_imessage).toBe('function')
  })

  it('rejects invalid recipient before calling BlueBubbles', async () => {
    const supabase = makeSupabase()
    const result = await channelToolHandlers.send_imessage(
      { recipient: 'not-a-number', message: 'hi' },
      ORG_ID,
      supabase,
    )
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/Invalid iMessage recipient/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns not-connected error when org has no iMessage connection', async () => {
    const supabase = makeSupabase({ connection: null })
    const result = await channelToolHandlers.send_imessage(
      { recipient: '+61400123456', message: 'hi' },
      ORG_ID,
      supabase,
    )
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/not connected/i)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends to BlueBubbles with encoded password and chatGuid', async () => {
    fetchMock.mockResolvedValue(new Response('ok', { status: 200 }))
    const supabase = makeSupabase()

    const result = await channelToolHandlers.send_imessage(
      { recipient: '+61400123456', message: 'hello there', recipient_name: 'Alice' },
      ORG_ID,
      supabase,
    )

    expect(result.success).toBe(true)
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/api/v1/message/text?password=')
    expect(url).toContain(encodeURIComponent(BB_PASSWORD))
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.chatGuid).toBe('iMessage;-;+61400123456')
    expect(body.message).toBe('hello there')
    expect(body.tempGuid).toMatch(/^bitbit-/)
  })

  it('returns error when BlueBubbles responds non-2xx', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 500 }))
    const supabase = makeSupabase()

    const result = await channelToolHandlers.send_imessage(
      { recipient: '+61400123456', message: 'hi' },
      ORG_ID,
      supabase,
    )
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/iMessage send failed: 500/)
  })

  it('records outgoing message in channel_messages on success', async () => {
    fetchMock.mockResolvedValue(new Response('ok', { status: 200 }))
    const supabase = makeSupabase()

    const result = await channelToolHandlers.send_imessage(
      { recipient: '+61400123456', message: 'logged please' },
      ORG_ID,
      supabase,
    )
    expect(result.success).toBe(true)

    const inserts = (supabase as unknown as { _inserts: Array<Record<string, unknown>> })._inserts
    expect(inserts).toHaveLength(1)
    const row = inserts[0] as Record<string, unknown>
    expect(row.channel).toBe('imessage')
    expect(row.org_id).toBe(ORG_ID)
    expect(row.body).toBe('logged please')
    expect((row.metadata as Record<string, unknown>).type).toBe('outgoing')
    expect((row.metadata as Record<string, unknown>).recipient).toBe('+61400123456')
    // `temp_guid: true` marks this row as a pre-delivery send record; a future
    // reconciler can match it against the real BB GUID from the inbound webhook.
    expect((row.metadata as Record<string, unknown>).temp_guid).toBe(true)
    expect((row.metadata as Record<string, unknown>).truncated).toBe(false)
  })

  it('flags metadata.truncated when message exceeds 2000 chars', async () => {
    fetchMock.mockResolvedValue(new Response('ok', { status: 200 }))
    const supabase = makeSupabase()
    const longBody = 'a'.repeat(2500)

    await channelToolHandlers.send_imessage(
      { recipient: '+61400123456', message: longBody },
      ORG_ID,
      supabase,
    )

    const inserts = (supabase as unknown as { _inserts: Array<Record<string, unknown>> })._inserts
    const row = inserts[0] as Record<string, unknown>
    expect((row.body as string).length).toBe(2000)
    expect((row.metadata as Record<string, unknown>).truncated).toBe(true)
  })

  it('still succeeds even if channel_messages insert throws (non-critical)', async () => {
    fetchMock.mockResolvedValue(new Response('ok', { status: 200 }))
    const supabase = makeSupabase({ insertError: new Error('db down') })

    const result = await channelToolHandlers.send_imessage(
      { recipient: '+61400123456', message: 'hi' },
      ORG_ID,
      supabase,
    )
    expect(result.success).toBe(true)
  })
})
