import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseApprovalReply, sendApprovalRequest, sendDigest } from './whatsapp'

describe('parseApprovalReply', () => {
  it('parses simple approval and rejection replies', () => {
    expect(parseApprovalReply('Y')).toEqual({ type: 'simple', decision: 'approved' })
    expect(parseApprovalReply('N')).toEqual({ type: 'simple', decision: 'rejected' })
    expect(parseApprovalReply('y')).toEqual({ type: 'simple', decision: 'approved' })
  })

  it('parses indexed digest replies', () => {
    expect(parseApprovalReply('1Y')).toEqual({ type: 'indexed', index: 1, decision: 'approved' })
    expect(parseApprovalReply('2N')).toEqual({ type: 'indexed', index: 2, decision: 'rejected' })
  })

  it('returns null for invalid replies', () => {
    expect(parseApprovalReply('hello')).toBeNull()
    expect(parseApprovalReply('')).toBeNull()
  })
})

describe('message formatting', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    process.env.WHATSAPP_PHONE_NUMBER_ID = '123'
    process.env.WHATSAPP_ACCESS_TOKEN = 'token'
  })

  it('formats approval request payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: 'msg-1' }] }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await sendApprovalRequest('61400000000', 'abcdef123456', 'Invoice Sezer', 'Bookkeeper', 0.83)

    const request = fetchMock.mock.calls[0]
    const body = JSON.parse(request[1].body)
    expect(body.text.body).toContain('[BitBit] Bookkeeper wants to: Invoice Sezer')
    expect(body.text.body).toContain('Confidence: 83%')
    expect(body.text.body).toContain('Reply Y to approve, N to reject')
    expect(body.text.body).toContain('Ref: abcdef12')
  })

  it('formats digest payload with multiple items', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: 'msg-2' }] }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await sendDigest('61400000000', [
      { id: 'a1', summary: 'Invoice Sezer', agentName: 'Bookkeeper' },
      { id: 'a2', summary: 'Follow up with landlord', agentName: 'Ops Agent' },
    ])

    const request = fetchMock.mock.calls[0]
    const body = JSON.parse(request[1].body)
    expect(body.text.body).toContain('[BitBit] Daily Digest - 2 pending approvals:')
    expect(body.text.body).toContain('1. Bookkeeper: Invoice Sezer')
    expect(body.text.body).toContain('2. Ops Agent: Follow up with landlord')
    expect(body.text.body).toContain("Reply with number + Y/N (e.g. '1Y' or '2N')")
  })
})
