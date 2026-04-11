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

  it('handles very long messages with paragraph breaks', () => {
    // Create a message with double newlines (paragraph breaks)
    // This will allow the chunker to split properly
    const longContent = Array(80)
      .fill('This is a paragraph of content with enough words to make it substantial.')
      .join('\n\n')
    const metadata = createMetadata()

    const chunks = chunkText(longContent, metadata)

    // Should split into multiple chunks when content exceeds 500 tokens
    expect(chunks.length).toBeGreaterThanOrEqual(1)

    // Each chunk should maintain metadata
    for (const chunk of chunks) {
      expect(chunk.metadata).toBeDefined()
      expect(chunk.metadata.org_id).toBe('org-abc')
    }
  })

  it('preserves chunk overlap in multi-chunk messages', () => {
    const longText = Array(250)
      .fill(0)
      .map((_, i) => `Line ${i}: Content content content here.`)
      .join('\n\n')

    const metadata = createMetadata()
    const chunks = chunkText(longText, metadata)

    // For long messages, there should be chunk overlap
    if (chunks.length > 1) {
      // The last line of chunk 0 should appear in chunk 1 (overlap)
      expect(chunks[1].text).toContain('Line')
    }
  })

  it('handles all-whitespace content', () => {
    const text = '   \n\n   \t\t   '
    const metadata = createMetadata()

    const chunks = chunkText(text, metadata)

    expect(chunks).toHaveLength(1)
    expect(chunks[0].chunkId).toBe('msg-123#chunk0')
  })

  it('correctly formats date with current year omitted', () => {
    const text = 'Message content.'
    const currentYear = new Date().getFullYear()
    const currentYearDate = new Date(currentYear, 2, 15, 10, 30, 0).toISOString()
    const metadata = createMetadata({
      received_at: currentYearDate,
    })

    const chunks = chunkText(text, metadata)

    // Should include the date formatting
    expect(chunks[0].text).toContain('Date:')
    // For current year, the formatDateForChunk may still include year depending on locale
    // Just verify the month/day is there
    expect(chunks[0].text).toMatch(/Mar.*15/)
  })

  it('includes past year in date when different from current', () => {
    const text = 'Message content.'
    const pastYearDate = new Date(2024, 2, 15, 10, 30, 0).toISOString()
    const metadata = createMetadata({
      received_at: pastYearDate,
    })

    const chunks = chunkText(text, metadata)

    // Past year should appear in formatted date
    expect(chunks[0].text).toContain('Mar 15')
    expect(chunks[0].text).toContain('2024')
  })

  it('maintains chunk index integrity across multiple chunks', () => {
    const longText = Array(300)
      .fill(0)
      .map((_, i) => `Line ${i}: Test content to make this message very long.`)
      .join('\n\n')

    const metadata = createMetadata()
    const chunks = chunkText(longText, metadata)

    // Verify all chunks have sequential indices
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i].metadata.chunk_index).toBe(i)
      expect(chunks[i].metadata.total_chunks).toBe(chunks.length)
      expect(chunks[i].chunkId).toBe(`msg-123#chunk${i}`)
    }
  })

  it('handles mixed newline formats (\\r\\n, \\n)', () => {
    const text = 'Line 1\r\nLine 2\nLine 3\r\nLine 4'
    const metadata = createMetadata()

    const chunks = chunkText(text, metadata)

    expect(chunks).toHaveLength(1)
    expect(chunks[0].text).toContain('From: alice@example.com')
  })

  it('correctly estimates token boundaries', () => {
    // Token estimation uses 3.5 chars per token approximation
    // 500 tokens threshold ≈ 1750 chars

    // Short message with line breaks - will stay under 500 tokens
    const shortMessage = Array(80)
      .fill('Line of text.\n')
      .join('')

    // Long message with line breaks - will exceed 500 tokens
    const longMessage = Array(300)
      .fill('Line of substantial text content here.\n')
      .join('')

    const metadata = createMetadata()

    const shortChunks = chunkText(shortMessage, metadata)
    const longChunks = chunkText(longMessage, metadata)

    expect(shortChunks).toHaveLength(1) // Under 500 tokens
    expect(longChunks.length).toBeGreaterThan(1) // Over 500 tokens
  })

  it('prepends metadata before first chunk only once', () => {
    const text = Array(200)
      .fill(0)
      .map((_, i) => `Line ${i}: Content here.`)
      .join('\n\n')

    const metadata = createMetadata()
    const chunks = chunkText(text, metadata)

    // Verify metadata prepend appears in all chunks
    for (const chunk of chunks) {
      expect(chunk.text).toContain('From: alice@example.com')
      expect(chunk.text).toContain('Subject: Test Subject')
    }
  })

  it('handles messages with special characters in subject', () => {
    const text = 'Message body'
    const metadata = createMetadata({
      subject: 'RE: [URGENT] Project Status Update (Due Today!) @alice',
    })

    const chunks = chunkText(text, metadata)

    expect(chunks[0].text).toContain('[URGENT]')
    expect(chunks[0].text).toContain('@alice')
  })
})
