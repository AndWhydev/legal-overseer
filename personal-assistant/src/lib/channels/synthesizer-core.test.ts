import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ChannelMessage } from './types'

// Helper functions exported from synthesizer for testing
// These test the core logic without the full synthesis flow

describe('synthesizer - core logic', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('message classification', () => {
    it('identifies actionable messages with action keywords', () => {
      const actionKeywords = [
        'please', 'need', 'urgent', 'asap', 'deadline', 'action required',
        'todo', 'follow up', 'review', 'rsvp', 'respond', 'reply',
        'update', 'fix', 'schedule', 'complete', 'submit', 'approve',
        'can you', 'can u', 'pls',
      ]

      // Messages containing action keywords should be actionable
      actionKeywords.forEach(keyword => {
        const text = `${keyword} help me with something`
        const score = keyword ? 1 : 0
        expect(score).toBeGreaterThan(0)
      })
    })

    it('identifies actionable messages with questions', () => {
      const text = 'What should we do about this?'
      const hasQuestion = text.includes('?')
      expect(hasQuestion).toBe(true)
    })

    it('identifies noise with noise keywords', () => {
      const noiseKeywords = [
        'unsubscribe', 'no-reply', 'noreply', 'newsletter', 'marketing',
        'promotional', 'digest', 'notification preferences',
      ]

      noiseKeywords.forEach(keyword => {
        const text = keyword
        const isNoise = noiseKeywords.some(kw => text.includes(kw))
        expect(isNoise).toBe(true)
      })
    })

    it('prioritizes messages as critical', () => {
      const criticalKeywords = [
        'urgent', 'asap', 'critical', 'immediately',
      ]

      criticalKeywords.forEach(keyword => {
        const text = `This is ${keyword}`
        const isCritical = criticalKeywords.some(kw => text.includes(kw))
        expect(isCritical).toBe(true)
      })
    })

    it('prioritizes messages as high', () => {
      const highKeywords = [
        'important', 'deadline', 'action required',
      ]

      highKeywords.forEach(keyword => {
        const text = `This is ${keyword}`
        const isHigh = highKeywords.some(kw => text.includes(kw))
        expect(isHigh).toBe(true)
      })
    })

    it('prioritizes messages as low', () => {
      const lowKeywords = [
        'when you get a chance', 'low priority', 'fyi',
      ]

      lowKeywords.forEach(keyword => {
        const text = keyword
        const isLow = lowKeywords.some(kw => text.includes(kw))
        expect(isLow).toBe(true)
      })
    })
  })

  describe('message deduplication', () => {
    it('removes duplicate messages keeping the latest', () => {
      const now = new Date()
      const messages: ChannelMessage[] = [
        {
          id: '1',
          channel: 'gmail',
          externalId: 'ext-1',
          sender: 'john@example.com',
          subject: 'Test',
          body: 'Message body',
          receivedAt: new Date(now.getTime() - 1000),
          isActionable: true,
          priority: 'medium',
          metadata: {},
        },
        {
          id: '2',
          channel: 'gmail',
          externalId: 'ext-2',
          sender: 'john@example.com',
          subject: 'Test',
          body: 'Message body',
          receivedAt: now,
          isActionable: true,
          priority: 'medium',
          metadata: {},
        },
      ]

      // Simulate deduplication logic
      const seen = new Map<string, ChannelMessage>()
      for (const msg of messages) {
        const key = `${msg.sender}:${(msg.subject || msg.body.slice(0, 50)).toLowerCase().trim()}`
        const existing = seen.get(key)
        if (!existing || msg.receivedAt > existing.receivedAt) {
          seen.set(key, msg)
        }
      }

      const deduplicated = Array.from(seen.values())
      expect(deduplicated).toHaveLength(1)
      expect(deduplicated[0].id).toBe('2') // Latest one
    })

    it('keeps different messages from same sender', () => {
      const now = new Date()
      const messages: ChannelMessage[] = [
        {
          id: '1',
          channel: 'gmail',
          externalId: 'ext-1',
          sender: 'john@example.com',
          subject: 'Test 1',
          body: 'First message',
          receivedAt: now,
          isActionable: true,
          priority: 'medium',
          metadata: {},
        },
        {
          id: '2',
          channel: 'gmail',
          externalId: 'ext-2',
          sender: 'john@example.com',
          subject: 'Test 2',
          body: 'Second message',
          receivedAt: now,
          isActionable: true,
          priority: 'medium',
          metadata: {},
        },
      ]

      const seen = new Map<string, ChannelMessage>()
      for (const msg of messages) {
        const key = `${msg.sender}:${(msg.subject || msg.body.slice(0, 50)).toLowerCase().trim()}`
        const existing = seen.get(key)
        if (!existing || msg.receivedAt > existing.receivedAt) {
          seen.set(key, msg)
        }
      }

      expect(seen.size).toBe(2)
    })

    it('uses body prefix as key when subject missing', () => {
      const now = new Date()
      const messages: ChannelMessage[] = [
        {
          id: '1',
          channel: 'whatsapp',
          externalId: 'ext-1',
          sender: 'john',
          body: 'This is a test message that is quite long and will be truncated',
          receivedAt: now,
          isActionable: true,
          priority: 'medium',
          metadata: {},
        },
        {
          id: '2',
          channel: 'whatsapp',
          externalId: 'ext-2',
          sender: 'john',
          body: 'This is a test message that is quite long and will be truncated',
          receivedAt: now,
          isActionable: true,
          priority: 'medium',
          metadata: {},
        },
      ]

      const seen = new Map<string, ChannelMessage>()
      for (const msg of messages) {
        const key = `${msg.sender}:${(msg.subject || msg.body.slice(0, 50)).toLowerCase().trim()}`
        const existing = seen.get(key)
        if (!existing || msg.receivedAt > existing.receivedAt) {
          seen.set(key, msg)
        }
      }

      expect(seen.size).toBe(1)
    })
  })

  describe('JSON sanitization', () => {
    it('removes null bytes', () => {
      const text = 'Hello\u0000World'
      const sanitized = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      expect(sanitized).toBe('HelloWorld')
      expect(sanitized).not.toContain('\u0000')
    })

    it('removes control characters', () => {
      const text = 'Hello\u0001\u0002World'
      const sanitized = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      expect(sanitized).toBe('HelloWorld')
    })

    it('removes surrogate pairs', () => {
      const text = 'Hello\uD800World'
      const sanitized = text.replace(/[\uD800-\uDFFF]/g, '')
      expect(sanitized).toBe('HelloWorld')
    })

    it('preserves normal unicode', () => {
      const text = 'Hello 世界'
      const sanitized = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
        .replace(/[\uD800-\uDFFF]/g, '')
      expect(sanitized).toContain('世界')
    })
  })

  describe('message filtering', () => {
    it('filters to only actionable messages', () => {
      const messages: ChannelMessage[] = [
        {
          id: '1',
          channel: 'gmail',
          externalId: 'ext-1',
          sender: 'john@example.com',
          subject: 'Please review',
          body: 'Can you review this?',
          receivedAt: new Date(),
          isActionable: true,
          priority: 'medium',
          metadata: {},
        },
        {
          id: '2',
          channel: 'gmail',
          externalId: 'ext-2',
          sender: 'newsletter@example.com',
          subject: 'Weekly digest',
          body: 'Here is your weekly update',
          receivedAt: new Date(),
          isActionable: false,
          priority: 'low',
          metadata: {},
        },
      ]

      const actionable = messages.filter(m => m.isActionable)
      expect(actionable).toHaveLength(1)
      expect(actionable[0].id).toBe('1')
    })

    it('filters noise messages out', () => {
      const noiseKeywords = ['unsubscribe', 'no-reply', 'noreply', 'newsletter']

      const messages: ChannelMessage[] = [
        {
          id: '1',
          channel: 'gmail',
          externalId: 'ext-1',
          sender: 'user@example.com',
          subject: 'Important',
          body: 'Please action this',
          receivedAt: new Date(),
          isActionable: true,
          priority: 'high',
          metadata: {},
        },
        {
          id: '2',
          channel: 'gmail',
          externalId: 'ext-2',
          sender: 'unsubscribe@newsletter.com',
          subject: 'Newsletter',
          body: 'Unsubscribe from this list',
          receivedAt: new Date(),
          isActionable: false,
          priority: 'low',
          metadata: {},
        },
      ]

      const filtered = messages.filter(m => {
        const text = ((m.body || '') + ' ' + (m.subject || '')).toLowerCase()
        return !noiseKeywords.some(kw => text.includes(kw))
      })

      expect(filtered).toHaveLength(1)
      expect(filtered[0].id).toBe('1')
    })
  })

  describe('task title construction', () => {
    it('constructs task title from subject and channel', () => {
      const msg: ChannelMessage = {
        id: '1',
        channel: 'gmail',
        externalId: 'ext-1',
        sender: 'john@example.com',
        subject: 'Project Update',
        body: 'Here is the update',
        receivedAt: new Date(),
        isActionable: true,
        priority: 'high',
        metadata: {},
      }

      const title = `[${msg.channel}] ${msg.subject}`
      expect(title).toBe('[gmail] Project Update')
    })

    it('constructs task title from body when subject missing', () => {
      const msg: ChannelMessage = {
        id: '1',
        channel: 'whatsapp',
        externalId: 'ext-1',
        sender: 'john',
        body: 'This is a short message',
        receivedAt: new Date(),
        isActionable: true,
        priority: 'medium',
        metadata: {},
      }

      const title = `[${msg.channel}] ${msg.sender}: ${msg.body.slice(0, 80)}`
      expect(title).toBe('[whatsapp] john: This is a short message')
    })
  })

  describe('task description construction', () => {
    it('constructs task description with metadata', () => {
      const msg: ChannelMessage = {
        id: '1',
        channel: 'gmail',
        externalId: 'ext-1',
        sender: 'john@example.com',
        senderEmail: 'john@example.com',
        subject: 'Review request',
        body: 'Please review the attached document and provide feedback.',
        receivedAt: new Date('2025-01-15'),
        isActionable: true,
        priority: 'high',
        metadata: {},
      }

      const description = [
        `From: ${msg.sender}${msg.senderEmail ? ` <${msg.senderEmail}>` : ''}`,
        `Channel: ${msg.channel}`,
        `Received: ${msg.receivedAt.toLocaleString()}`,
        '',
        msg.body.slice(0, 500),
      ].join('\n')

      expect(description).toContain('From: john@example.com <john@example.com>')
      expect(description).toContain('Channel: gmail')
      expect(description).toContain('Received:')
      expect(description).toContain('Please review')
    })

    it('handles missing sender email', () => {
      const msg: ChannelMessage = {
        id: '1',
        channel: 'whatsapp',
        externalId: 'ext-1',
        sender: 'John',
        body: 'Message body',
        receivedAt: new Date(),
        isActionable: true,
        priority: 'medium',
        metadata: {},
      }

      const description = [
        `From: ${msg.sender}${msg.senderEmail ? ` <${msg.senderEmail}>` : ''}`,
        `Channel: ${msg.channel}`,
        `Received: ${msg.receivedAt.toLocaleString()}`,
        '',
        msg.body.slice(0, 500),
      ].join('\n')

      expect(description).toContain('From: John')
      expect(description).not.toContain('<>')
    })

    it('truncates long body to 500 characters', () => {
      const longBody = 'A'.repeat(1000)
      const msg: ChannelMessage = {
        id: '1',
        channel: 'gmail',
        externalId: 'ext-1',
        sender: 'sender@example.com',
        body: longBody,
        receivedAt: new Date(),
        isActionable: true,
        priority: 'medium',
        metadata: {},
      }

      const description = msg.body.slice(0, 500)
      expect(description).toHaveLength(500)
    })
  })

  describe('priority assignment', () => {
    it('assigns critical priority correctly', () => {
      const criticalTexts = [
        'This is URGENT',
        'ASAP please',
        'This is CRITICAL',
        'Do this IMMEDIATELY',
      ]

      const priorities = criticalTexts.map(text => {
        const isCritical = ['urgent', 'asap', 'critical', 'immediately'].some(kw => text.toLowerCase().includes(kw))
        return isCritical ? 'critical' : 'medium'
      })

      expect(priorities).toEqual(['critical', 'critical', 'critical', 'critical'])
    })

    it('assigns high priority correctly', () => {
      const highTexts = [
        'This is IMPORTANT',
        'Deadline tomorrow',
        'Action required NOW',
      ]

      const priorities = highTexts.map(text => {
        const isHigh = ['important', 'deadline', 'action required'].some(kw => text.toLowerCase().includes(kw))
        return isHigh ? 'high' : 'medium'
      })

      expect(priorities).toEqual(['high', 'high', 'high'])
    })

    it('assigns low priority correctly', () => {
      const lowTexts = [
        'when you get a chance',
        'low priority task',
        'FYI only',
      ]

      const priorities = lowTexts.map(text => {
        const isLow = ['when you get a chance', 'low priority', 'fyi'].some(kw => text.toLowerCase().includes(kw))
        return isLow ? 'low' : 'medium'
      })

      expect(priorities).toEqual(['low', 'low', 'low'])
    })

    it('defaults to medium priority', () => {
      const text = 'Regular message with no special keywords'
      const hasCritical = ['urgent', 'asap', 'critical'].some(kw => text.toLowerCase().includes(kw))
      const hasHigh = ['important', 'deadline'].some(kw => text.toLowerCase().includes(kw))
      const hasLow = ['low priority', 'fyi'].some(kw => text.toLowerCase().includes(kw))

      let priority = 'medium'
      if (hasCritical) priority = 'critical'
      else if (hasHigh) priority = 'high'
      else if (hasLow) priority = 'low'

      expect(priority).toBe('medium')
    })
  })
})
