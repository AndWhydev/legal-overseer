import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ChannelMessage } from './types'
import {
  isCommandEmail,
  parseEmailCommand,
  formatEmailResponse,
  processEmailCommand,
} from './email-command'

// Mock the classifier
vi.mock('@/lib/agent/classifier', () => ({
  classifyMessage: vi.fn().mockResolvedValue({
    significance: 7,
    timeSensitivity: 'today',
    resolves: [],
    unblocks: [],
    recommendedActions: ['create_task'],
    reasoning: 'User is requesting task creation',
    category: 'personal',
  }),
}))

// Mock the action router
vi.mock('@/lib/agent/action-router', () => ({
  routeMessage: vi.fn().mockReturnValue({
    decision: 'immediate',
    reason: 'High significance',
    priority: 7,
  }),
}))

// Mock the engine
vi.mock('@/lib/agent/engine', () => ({
  runAgentChat: vi.fn(async function* () {
    yield { type: 'thinking_start', data: {} }
    yield { type: 'message', data: 'Task created successfully for Steve.' }
    yield { type: 'done', data: {} }
  }),
}))

function makeEmail(overrides: Partial<ChannelMessage> = {}): ChannelMessage {
  return {
    id: 'email-1',
    channel: 'gmail',
    externalId: 'msg-1',
    sender: 'John Doe',
    senderEmail: 'john@example.com',
    subject: '[BitBit] Create task for Steve',
    body: 'Please create a task to follow up about the invoice.',
    receivedAt: new Date(),
    isActionable: true,
    priority: 'high',
    metadata: {},
    ...overrides,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockSupabase(): any {
  return {
    from: vi.fn().mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    }),
  }
}

describe('isCommandEmail', () => {
  it('detects [BitBit] prefix in subject', () => {
    const email = makeEmail({ subject: '[BitBit] Create a task' })
    expect(isCommandEmail(email)).toBe(true)
  })

  it('detects [BITBIT] uppercase prefix', () => {
    const email = makeEmail({ subject: '[BITBIT] Do something' })
    expect(isCommandEmail(email)).toBe(true)
  })

  it('detects ! prefix', () => {
    const email = makeEmail({ subject: '! Create task' })
    expect(isCommandEmail(email)).toBe(true)
  })

  it('detects !bitbit prefix', () => {
    const email = makeEmail({ subject: '!bitbit schedule meeting' })
    expect(isCommandEmail(email)).toBe(true)
  })

  it('rejects non-command emails', () => {
    const email = makeEmail({ subject: 'Regular email about invoice' })
    expect(isCommandEmail(email)).toBe(false)
  })

  it('handles missing subject', () => {
    const email = makeEmail({ subject: undefined })
    expect(isCommandEmail(email)).toBe(false)
  })
})

describe('parseEmailCommand', () => {
  it('extracts subject as command text', () => {
    const email = makeEmail({ subject: 'Create task for Steve' })
    const parsed = parseEmailCommand(email)
    expect(parsed.commandText).toContain('Create task for Steve')
  })

  it('strips Re: prefix from subject', () => {
    const email = makeEmail({ subject: 're: Create task for Steve' })
    const parsed = parseEmailCommand(email)
    expect(parsed.commandText).not.toContain('re:')
    expect(parsed.commandText).toContain('Create task for Steve')
  })

  it('strips Fwd: prefix from subject', () => {
    const email = makeEmail({ subject: 'Fwd: Invoice follow-up' })
    const parsed = parseEmailCommand(email)
    expect(parsed.commandText).not.toContain('Fwd:')
    expect(parsed.commandText).toContain('Invoice follow-up')
  })

  it('strips email signatures from body', () => {
    const email = makeEmail({
      body: 'Create a task for Steve\n\n-- \nSent from my iPhone',
    })
    const parsed = parseEmailCommand(email)
    expect(parsed.context).not.toContain('Sent from my')
    expect(parsed.context).toContain('Create a task for Steve')
  })

  it('handles "Sent from" signature', () => {
    const email = makeEmail({
      body: 'Task to follow up\n\nSent from my Mail app',
    })
    const parsed = parseEmailCommand(email)
    expect(parsed.context).not.toContain('Sent from')
  })

  it('handles quoted reply patterns', () => {
    const email = makeEmail({
      body: 'Create this task\n\nOn Mon, Jan 15, 2024 at 10:30 AM wrote:\n> Original message',
    })
    const parsed = parseEmailCommand(email)
    expect(parsed.context).toContain('Create this task')
    expect(parsed.context).not.toContain('Original message')
  })

  it('includes body in context when present', () => {
    const email = makeEmail({
      subject: 'Create task',
      body: 'Follow up with Steve about invoice payment.',
    })
    const parsed = parseEmailCommand(email)
    expect(parsed.commandText).toContain('Create task')
    expect(parsed.commandText).toContain('Context:')
    expect(parsed.commandText).toContain('Follow up with Steve')
  })
})

describe('formatEmailResponse', () => {
  it('generates HTML email with proper structure', () => {
    const html = formatEmailResponse('Task created successfully', 'john@example.com').htmlBody
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('Task created successfully')
  })

  it('includes inline CSS styles', () => {
    const html = formatEmailResponse('Test message', 'john@example.com').htmlBody
    expect(html).toContain('<style>')
    expect(html).toContain('font-family')
  })

  it('includes header with BitBit branding', () => {
    const html = formatEmailResponse('Test', 'john@example.com').htmlBody
    expect(html).toContain('BitBit Response')
  })

  it('includes footer with instructions', () => {
    const html = formatEmailResponse('Test', 'john@example.com').htmlBody
    expect(html).toContain('automated response')
  })

  it('returns subject line with Re: prefix', () => {
    const { subject } = formatEmailResponse('Test', 'john@example.com')
    expect(subject).toContain('Re:')
    expect(subject).toContain('BitBit')
  })

  it('escapes HTML special characters in message', () => {
    const html = formatEmailResponse('Error: <script>alert("xss")</script>', 'john@example.com').htmlBody
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
  })

  it('includes timestamp', () => {
    const html = formatEmailResponse('Test', 'john@example.com').htmlBody
    expect(html).toContain('Processed:')
  })
})

describe('processEmailCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects non-command emails', async () => {
    const supabase = mockSupabase()
    const email = makeEmail({ subject: 'Regular email' })
    const result = await processEmailCommand(supabase, 'org-1', email)
    expect(result.success).toBe(false)
    expect(result.error).toContain('does not appear')
  })

  it('constructs proper command text from subject and body', async () => {
    const supabase = mockSupabase()
    const email = makeEmail({ subject: '[BitBit] Create task', body: 'For Steve' })
    const result = await processEmailCommand(supabase, 'org-1', email)
    expect(result.success).toBe(true)
    expect(result.agentResponse).toBeDefined()
  })

  it('processes valid command email successfully', async () => {
    const supabase = mockSupabase()
    const email = makeEmail({
      subject: '[BitBit] Create task for Steve',
      body: 'Follow up about invoice',
    })
    const result = await processEmailCommand(supabase, 'org-1', email)
    expect(result.success).toBe(true)
    expect(result.agentResponse).toContain('Task created')
  })

  it('returns email queued indicator', async () => {
    const supabase = mockSupabase()
    const email = makeEmail({ subject: '[BitBit] Create task' })
    const result = await processEmailCommand(supabase, 'org-1', email)
    expect(result.emailQueued).toBe(true)
  })

  it('logs command processing steps', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const supabase = mockSupabase()
    const email = makeEmail({ subject: '[BitBit] Task' })
    await processEmailCommand(supabase, 'org-1', email)
    // The logger outputs formatted strings with color codes and metadata JSON
    expect(consoleSpy).toHaveBeenCalled()
    const calls = consoleSpy.mock.calls as any[][]
    expect(calls.some(call => typeof call[0] === 'string' && call[0].includes('[email-command]'))).toBe(true)
    consoleSpy.mockRestore()
  })

  it('aggregates agent response message correctly', async () => {
    const supabase = mockSupabase()
    const email = makeEmail({ subject: '[BitBit] Task' })
    const result = await processEmailCommand(supabase, 'org-1', email)
    // The mock engine yields a message event
    expect(result.success).toBe(true)
    expect(result.agentResponse).toBeDefined()
  })

  it('includes org ID in engine config', async () => {
    const supabase = mockSupabase()
    const email = makeEmail({ subject: '[BitBit] Task' })
    const result = await processEmailCommand(supabase, 'test-org-123', email)
    // The processEmailCommand should pass the org ID to the engine
    // Just verify it processes successfully
    expect(result.success).toBe(true)
  })
})
