import { describe, it, expect } from 'vitest'
import { chunkText } from './chunker'
import type { PineconeMetadata } from './types'

describe('chunkText', () => {
  const createMetadata = (overrides?: Partial<PineconeMetadata>): PineconeMetadata => ({
    message_id: 'msg-123',
    org_id: 'org-abc',
    channel: 'gmail',
    sender: 'alice@example.com',
    sender_email: 'alice@example.com',
    subject: 'Test Subject',
    received_at: '2025-03-15T10:00:00Z',
    chunk_index: 0,
    total_chunks: 1,
    is_full_body: true,
    ...overrides,
  })

  it('returns single atomic chunk for short message (<500 tokens)', () => {
    const shortText = 'This is a short message.'
    const metadata = createMetadata()

    const chunks = chunkText(shortText, metadata)

    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toMatchObject({
      chunkId: 'msg-123#chunk0',
      metadata: {
        chunk_index: 0,
        total_chunks: 1,
      },
    })
    // Verify metadata prepend is included
    expect(chunks[0].text).toContain('From: alice@example.com')
    expect(chunks[0].text).toContain('Subject: Test Subject')
    expect(chunks[0].text).toContain('Channel: gmail')
  })

  it('returns multiple chunks for long message', () => {
    // Create a message > 500 tokens
    const longText = Array(200)
      .fill(0)
      .map((_, i) => `Line ${i}: This is a test line with some content to make it longer.`)
      .join('\n\n')

    const metadata = createMetadata()
    const chunks = chunkText(longText, metadata)

    expect(chunks.length).toBeGreaterThan(1)

    // Verify chunk structure
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i].chunkId).toBe(`msg-123#chunk${i}`)
      expect(chunks[i].metadata.chunk_index).toBe(i)
      expect(chunks[i].metadata.total_chunks).toBe(chunks.length)
    }
  })

  it('includes metadata prepend with From/Subject/Date/Channel format', () => {
    const text = 'Message content here.'
    const metadata = createMetadata({
      sender: 'bob@example.com',
      subject: 'Important Update',
      received_at: '2025-03-10T14:30:00Z',
      channel: 'outlook',
    })

    const chunks = chunkText(text, metadata)

    expect(chunks[0].text).toContain('From: bob@example.com')
    expect(chunks[0].text).toContain('Subject: Important Update')
    expect(chunks[0].text).toContain('Date:')
    expect(chunks[0].text).toContain('Channel: outlook')
    // Verify the pipe separators
    expect(chunks[0].text).toContain('|')
  })

  it('generates chunk IDs in format {message_id}#chunk{N}', () => {
    const text = 'Short test.'
    const metadata = createMetadata({ message_id: 'msg-xyz-789' })

    const chunks = chunkText(text, metadata)

    expect(chunks[0].chunkId).toBe('msg-xyz-789#chunk0')
  })

  it('returns single empty chunk for empty text', () => {
    const metadata = createMetadata()
    const chunks = chunkText('', metadata)

    expect(chunks).toHaveLength(1)
    expect(chunks[0].chunkId).toBe('msg-123#chunk0')
    expect(chunks[0].metadata.chunk_index).toBe(0)
    expect(chunks[0].metadata.total_chunks).toBe(1)
  })

  it('preserves metadata in chunks', () => {
    const text = 'Test message.'
    const customMetadata = createMetadata({
      channel: 'slack',
      sender: 'user123',
      sender_email: 'user@company.com',
    })

    const chunks = chunkText(text, customMetadata)

    expect(chunks[0].metadata.channel).toBe('slack')
    expect(chunks[0].metadata.sender).toBe('user123')
    expect(chunks[0].metadata.sender_email).toBe('user@company.com')
    expect(chunks[0].metadata.org_id).toBe('org-abc')
  })

  it('handles invalid ISO date gracefully in metadata prepend', () => {
    const text = 'Message content.'
    const metadata = createMetadata({
      received_at: 'invalid-date',
    })

    const chunks = chunkText(text, metadata)

    // Should still include the date part in prepend (invalid dates become "Invalid Date")
    expect(chunks[0].text).toContain('Date:')
    // The formatDateForChunk function converts invalid dates to "Invalid Date"
    expect(chunks[0].text).toMatch(/Date:\s*(Invalid Date|invalid-date)/i)
  })
})
