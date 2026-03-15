import { describe, it, expect } from 'vitest'
import { chunkConversation } from './chunker'
import type { ConversationMessage } from './types'

describe('chunkConversation', () => {
  const createMessage = (overrides?: Partial<ConversationMessage>): ConversationMessage => ({
    content: 'Test message',
    sender: 'Alice',
    timestamp: new Date().toISOString(),
    messageId: 'msg-1',
    ...overrides,
  })

  it('returns empty array for empty messages', () => {
    const chunks = chunkConversation([])
    expect(chunks).toHaveLength(0)
  })

  it('groups single message as one chunk', () => {
    const messages = [createMessage({ messageId: 'msg-1', sender: 'Alice' })]
    const chunks = chunkConversation(messages)

    expect(chunks).toHaveLength(1)
    expect(chunks[0].messageIds).toEqual(['msg-1'])
    expect(chunks[0].text).toContain('Alice')
    expect(chunks[0].text).toContain('Test message')
  })

  it('groups sequential messages within time window', () => {
    const now = new Date()
    const messages = [
      createMessage({
        messageId: 'msg-1',
        sender: 'Alice',
        content: 'Hey, how are you?',
        timestamp: now.toISOString(),
      }),
      createMessage({
        messageId: 'msg-2',
        sender: 'Bob',
        content: 'I am good, thanks!',
        timestamp: new Date(now.getTime() + 60000).toISOString(), // 1 min later
      }),
      createMessage({
        messageId: 'msg-3',
        sender: 'Alice',
        content: 'Great! Want to grab coffee?',
        timestamp: new Date(now.getTime() + 120000).toISOString(), // 2 mins later
      }),
    ]

    const chunks = chunkConversation(messages, 30) // 30-min window
    expect(chunks).toHaveLength(1)
    expect(chunks[0].messageIds).toEqual(['msg-1', 'msg-2', 'msg-3'])
  })

  it('splits messages when time window is exceeded', () => {
    const now = new Date()
    const messages = [
      createMessage({
        messageId: 'msg-1',
        sender: 'Alice',
        timestamp: now.toISOString(),
      }),
      createMessage({
        messageId: 'msg-2',
        sender: 'Bob',
        timestamp: new Date(now.getTime() + 31 * 60000).toISOString(), // 31 mins later
      }),
    ]

    const chunks = chunkConversation(messages, 30) // 30-min window
    expect(chunks).toHaveLength(2)
    expect(chunks[0].messageIds).toEqual(['msg-1'])
    expect(chunks[1].messageIds).toEqual(['msg-2'])
  })

  it('formats conversation with sender and time', () => {
    const now = new Date('2025-03-15T14:30:00Z')
    const messages = [
      createMessage({
        messageId: 'msg-1',
        sender: 'Alice',
        content: 'Hello',
        timestamp: now.toISOString(),
      }),
      createMessage({
        messageId: 'msg-2',
        sender: 'Bob',
        content: 'Hi there!',
        timestamp: new Date(now.getTime() + 60000).toISOString(),
      }),
    ]

    const chunks = chunkConversation(messages)
    const text = chunks[0].text

    // Should format as [Sender, HH:MM]: content
    expect(text).toMatch(/\[Alice.*\d{2}:\d{2}\].*Hello/)
    expect(text).toMatch(/\[Bob.*\d{2}:\d{2}\].*Hi there!/)
  })

  it('includes all message IDs in chunk for citation', () => {
    const now = new Date()
    const messages = [
      createMessage({ messageId: 'msg-1', sender: 'A' }),
      createMessage({
        messageId: 'msg-2',
        sender: 'B',
        timestamp: new Date(now.getTime() + 600000).toISOString(),
      }),
      createMessage({
        messageId: 'msg-3',
        sender: 'A',
        timestamp: new Date(now.getTime() + 1200000).toISOString(),
      }),
    ]

    const chunks = chunkConversation(messages)
    expect(chunks[0].messageIds).toEqual(['msg-1', 'msg-2', 'msg-3'])
  })

  it('sets proper chunk metadata from first message', () => {
    const now = new Date('2025-03-15T14:30:00Z')
    const messages = [
      createMessage({
        messageId: 'msg-1',
        sender: 'Alice',
        timestamp: now.toISOString(),
      }),
      createMessage({
        messageId: 'msg-2',
        sender: 'Bob',
        timestamp: new Date(now.getTime() + 60000).toISOString(),
      }),
    ]

    const chunks = chunkConversation(messages)
    const metadata = chunks[0].metadata

    expect(metadata.message_id).toBe('msg-1')
    expect(metadata.sender).toBe('Alice')
    expect(metadata.chunk_index).toBe(0)
    expect(metadata.total_chunks).toBe(1)
    expect(metadata.is_full_body).toBe(true)
  })

  it('generates deterministic chunkId from first message', () => {
    const messages = [
      createMessage({ messageId: 'msg-abc-123' }),
      createMessage({ messageId: 'msg-def-456' }),
    ]

    const chunks = chunkConversation(messages)
    expect(chunks[0].chunkId).toBe('msg-abc-123#conv0')
  })

  it('handles messages with special characters', () => {
    const messages = [
      createMessage({
        content: 'Hey! Do you like $pecial ch@rs & p0nctuation?',
        sender: 'Alice',
      }),
    ]

    const chunks = chunkConversation(messages)
    expect(chunks[0].text).toContain('$pecial ch@rs & p0nctuation')
  })

  it('preserves exact message order in group', () => {
    const now = new Date()
    const senders = ['Alice', 'Bob', 'Charlie', 'David']
    const messages = senders.map((sender, i) =>
      createMessage({
        sender,
        content: `Message from ${sender}`,
        messageId: `msg-${i}`,
        timestamp: new Date(now.getTime() + i * 60000).toISOString(),
      })
    )

    const chunks = chunkConversation(messages, 60)
    const text = chunks[0].text

    // Check order is preserved
    const aliceIndex = text.indexOf('Alice')
    const bobIndex = text.indexOf('Bob')
    const charlieIndex = text.indexOf('Charlie')
    const davidIndex = text.indexOf('David')

    expect(aliceIndex).toBeLessThan(bobIndex)
    expect(bobIndex).toBeLessThan(charlieIndex)
    expect(charlieIndex).toBeLessThan(davidIndex)
  })

  it('handles default time window (30 minutes)', () => {
    const now = new Date()
    const messages = [
      createMessage({ messageId: 'msg-1', timestamp: now.toISOString() }),
      createMessage({
        messageId: 'msg-2',
        timestamp: new Date(now.getTime() + 31 * 60000).toISOString(),
      }),
    ]

    // Call without specifying timeWindowMinutes (should default to 30)
    const chunks = chunkConversation(messages)
    expect(chunks).toHaveLength(2) // Should split because > 30 mins
  })
})
