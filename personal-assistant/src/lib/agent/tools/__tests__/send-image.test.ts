import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSendSendblueMedia = vi.fn()

vi.mock('@/lib/channels/sendblue-media', () => ({
  sendSendblueMedia: (...args: unknown[]) => mockSendSendblueMedia(...args),
}))

vi.mock('@/lib/core/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

import { channelToolHandlers } from '../channel-tools'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('send_image handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns error when to is missing', async () => {
    const result = await channelToolHandlers.send_image(
      { to: '', image_url: 'https://example.com/photo.jpg' },
      'org-1',
      {} as any,
    )
    expect(result).toEqual({ success: false, error: 'Missing to or image_url' })
  })

  it('returns error when image_url is missing', async () => {
    const result = await channelToolHandlers.send_image(
      { to: '+61400000000', image_url: '' },
      'org-1',
      {} as any,
    )
    expect(result).toEqual({ success: false, error: 'Missing to or image_url' })
  })

  it('rejects non-HTTP URLs', async () => {
    const result = await channelToolHandlers.send_image(
      { to: '+61400000000', image_url: 'ftp://files.example.com/photo.jpg' },
      'org-1',
      {} as any,
    )
    expect(result).toEqual({
      success: false,
      error: 'image_url must be a public URL starting with http:// or https://',
    })
  })

  it('rejects data: URIs', async () => {
    const result = await channelToolHandlers.send_image(
      { to: '+61400000000', image_url: 'data:image/png;base64,abc123' },
      'org-1',
      {} as any,
    )
    expect(result).toEqual({
      success: false,
      error: 'image_url must be a public URL starting with http:// or https://',
    })
  })

  it('rejects non-string image_url values', async () => {
    const result = await channelToolHandlers.send_image(
      { to: '+61400000000', image_url: { href: 'https://cdn.example.com/photo.jpg' } as any },
      'org-1',
      {} as any,
    )
    expect(result).toEqual({
      success: false,
      error: 'image_url must be a public URL starting with http:// or https://',
    })
  })

  it('calls sendSendblueMedia with correct args and returns success', async () => {
    mockSendSendblueMedia.mockResolvedValue({ success: true })

    const result = await channelToolHandlers.send_image(
      { to: '+61400000000', image_url: 'https://cdn.example.com/photo.jpg', caption: 'Check this out' },
      'org-1',
      {} as any,
    )

    expect(mockSendSendblueMedia).toHaveBeenCalledWith('+61400000000', 'https://cdn.example.com/photo.jpg', 'Check this out')
    expect(result).toEqual({
      success: true,
      data: { to: '+61400000000', imageUrl: 'https://cdn.example.com/photo.jpg', caption: 'Check this out' },
    })
  })

  it('sends without caption when not provided', async () => {
    mockSendSendblueMedia.mockResolvedValue({ success: true })

    const result = await channelToolHandlers.send_image(
      { to: '+61400000000', image_url: 'https://cdn.example.com/photo.jpg' },
      'org-1',
      {} as any,
    )

    expect(mockSendSendblueMedia).toHaveBeenCalledWith('+61400000000', 'https://cdn.example.com/photo.jpg', '')
    expect(result).toEqual({
      success: true,
      data: { to: '+61400000000', imageUrl: 'https://cdn.example.com/photo.jpg', caption: undefined },
    })
  })

  it('returns error when sendSendblueMedia fails', async () => {
    mockSendSendblueMedia.mockResolvedValue({ success: false, error: 'Sendblue API error' })

    const result = await channelToolHandlers.send_image(
      { to: '+61400000000', image_url: 'https://cdn.example.com/photo.jpg' },
      'org-1',
      {} as any,
    )

    expect(result).toEqual({ success: false, error: 'Sendblue API error' })
  })
})
