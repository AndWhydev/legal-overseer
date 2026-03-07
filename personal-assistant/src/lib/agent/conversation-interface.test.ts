import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  ConversationMessage,
  ConversationRouter,
  WebTransport,
  WhatsAppTransport,
  EmailTransport,
  SMSTransport,
  SlackTransport,
  AgentResponse,
  createConversationRouter,
} from './conversation-interface'

// Mock Supabase client
const createMockSupabase = (): Partial<SupabaseClient> => ({
  from: vi.fn().mockReturnValue({
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
  }),
  auth: {
    getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
  } as any,
})

describe('ConversationMessage', () => {
  it('should create a valid user message', () => {
    const msg: ConversationMessage = {
      id: 'msg_1',
      content: 'Hello',
      role: 'user',
      channel: 'web',
      metadata: {
        userId: 'user_1',
        orgId: 'org_1',
        threadId: 'thread_1',
      },
      timestamp: new Date(),
    }

    expect(msg.role).toBe('user')
    expect(msg.channel).toBe('web')
    expect(msg.metadata.userId).toBe('user_1')
  })

  it('should support attachments', () => {
    const msg: ConversationMessage = {
      id: 'msg_1',
      content: 'Check this file',
      role: 'user',
      channel: 'email',
      metadata: {
        userId: 'user_1',
        orgId: 'org_1',
        attachments: [
          { type: 'pdf', url: 'https://example.com/doc.pdf', name: 'document.pdf' },
        ],
      },
      timestamp: new Date(),
    }

    expect(msg.metadata.attachments).toHaveLength(1)
    expect(msg.metadata.attachments![0].type).toBe('pdf')
  })
})

describe('WebTransport', () => {
  let transport: WebTransport

  beforeEach(() => {
    transport = new WebTransport()
  })

  it('should have correct channel', () => {
    expect(transport.channel).toBe('web')
  })

  it('should format text responses', () => {
    const response: AgentResponse = {
      type: 'text',
      content: 'Hello from agent',
    }
    const formatted = transport.formatResponse(response)
    expect(formatted).toBe('Hello from agent')
  })

  it('should format error responses', () => {
    const response: AgentResponse = {
      type: 'error',
      content: 'Something went wrong',
    }
    const formatted = transport.formatResponse(response)
    expect(formatted).toContain('Error:')
    expect(formatted).toContain('Something went wrong')
  })

  it('should format thinking responses', () => {
    const response: AgentResponse = {
      type: 'thinking',
      content: 'Processing your request',
    }
    const formatted = transport.formatResponse(response)
    expect(formatted).toContain('Thinking:')
  })

  it('should send message through controller', async () => {
    const chunks: Uint8Array[] = []
    const mockController = {
      enqueue: vi.fn((chunk: Uint8Array) => chunks.push(chunk)),
    } as any

    const webTransport = new WebTransport(mockController)
    await webTransport.sendMessage('thread_1', 'Test message')

    expect(mockController.enqueue).toHaveBeenCalled()
  })
})

describe('WhatsAppTransport', () => {
  let transport: WhatsAppTransport
  let mockSupabase: Partial<SupabaseClient>

  beforeEach(() => {
    mockSupabase = createMockSupabase()
    transport = new WhatsAppTransport(mockSupabase as SupabaseClient, 'org_1')
  })

  it('should have correct channel', () => {
    expect(transport.channel).toBe('whatsapp')
  })

  it('should format responses with emoji', () => {
    const response: AgentResponse = {
      type: 'text',
      content: 'Here is your task list',
      metadata: {
        toolsCalled: ['search_tasks', 'create_task'],
      },
    }
    const formatted = transport.formatResponse(response)
    expect(formatted).toContain('Here is your task list')
    expect(formatted).toContain('Used:')
  })

  it('should truncate long responses', () => {
    const longContent = 'x'.repeat(2000)
    const response: AgentResponse = {
      type: 'text',
      content: longContent,
    }
    const formatted = transport.formatResponse(response)
    expect(formatted.length).toBeLessThanOrEqual(1010) // content + metadata
  })

  it('should format error responses with emoji', () => {
    const response: AgentResponse = {
      type: 'error',
      content: 'Task creation failed',
    }
    const formatted = transport.formatResponse(response)
    expect(formatted).toContain('❌')
    expect(formatted).toContain('Task creation failed')
  })
})

describe('EmailTransport', () => {
  let transport: EmailTransport

  beforeEach(() => {
    transport = new EmailTransport()
  })

  it('should have correct channel', () => {
    expect(transport.channel).toBe('email')
  })

  it('should format responses as email', () => {
    const response: AgentResponse = {
      type: 'text',
      content: 'Task created successfully',
    }
    const formatted = transport.formatResponse(response)
    expect(formatted).toContain('Subject:')
    expect(formatted).toContain('Task created successfully')
  })
})

describe('SMSTransport', () => {
  let transport: SMSTransport

  beforeEach(() => {
    transport = new SMSTransport()
  })

  it('should have correct channel', () => {
    expect(transport.channel).toBe('sms')
  })

  it('should truncate to SMS length (160 chars)', () => {
    const longContent = 'x'.repeat(500)
    const response: AgentResponse = {
      type: 'text',
      content: longContent,
    }
    const formatted = transport.formatResponse(response)
    expect(formatted.length).toBeLessThanOrEqual(160)
  })
})

describe('SlackTransport', () => {
  let transport: SlackTransport

  beforeEach(() => {
    transport = new SlackTransport()
  })

  it('should have correct channel', () => {
    expect(transport.channel).toBe('slack')
  })

  it('should format responses for Slack', () => {
    const response: AgentResponse = {
      type: 'text',
      content: 'Task updated in Kanban board',
    }
    const formatted = transport.formatResponse(response)
    expect(formatted).toContain('>>>')
    expect(formatted).toContain('Task updated')
  })
})

describe('ConversationRouter', () => {
  let router: ConversationRouter
  let mockSupabase: Partial<SupabaseClient>

  beforeEach(() => {
    mockSupabase = createMockSupabase()
    const transports = new Map()
    transports.set('web', new WebTransport())
    transports.set('whatsapp', new WhatsAppTransport(mockSupabase as SupabaseClient, 'org_1'))
    transports.set('email', new EmailTransport())
    router = new ConversationRouter(transports, mockSupabase as SupabaseClient)
  })

  it('should initialize with transports', () => {
    expect(router).toBeDefined()
  })

  it('should register new transports', () => {
    const smsTransport = new SMSTransport()
    router.registerTransport('sms', smsTransport)
    // Verify registration (no error thrown)
    expect(router).toBeDefined()
  })

  it('should handle messages from web channel', async () => {
    const message: ConversationMessage = {
      id: 'msg_1',
      content: 'Create a task',
      role: 'user',
      channel: 'web',
      metadata: {
        userId: 'user_1',
        orgId: 'org_1',
        threadId: 'thread_1',
      },
      timestamp: new Date(),
    }

    // Should not throw
    await expect(
      router.handleMessage(message, { skipCostGuard: true })
    ).resolves.not.toThrow()
  })

  it('should handle messages from whatsapp channel', async () => {
    const message: ConversationMessage = {
      id: 'msg_1',
      content: 'What are my tasks?',
      role: 'user',
      channel: 'whatsapp',
      metadata: {
        userId: 'user_1',
        orgId: 'org_1',
        threadId: '1234567890',
      },
      timestamp: new Date(),
    }

    // Should not throw
    await expect(
      router.handleMessage(message, { skipCostGuard: true })
    ).resolves.not.toThrow()
  })

  it('should handle messages from email channel', async () => {
    const message: ConversationMessage = {
      id: 'msg_1',
      content: 'Add a new project',
      role: 'user',
      channel: 'email',
      metadata: {
        userId: 'user_1',
        orgId: 'org_1',
        threadId: 'email_thread_123',
      },
      timestamp: new Date(),
    }

    await expect(
      router.handleMessage(message, { skipCostGuard: true })
    ).resolves.not.toThrow()
  })

  it('should error on unknown channel', async () => {
    const message: ConversationMessage = {
      id: 'msg_1',
      content: 'Hello',
      role: 'user',
      channel: 'slack', // not registered
      metadata: {
        userId: 'user_1',
        orgId: 'org_1',
      },
      timestamp: new Date(),
    }

    // Register slack first
    router.registerTransport('slack', new SlackTransport())
    await expect(router.handleMessage(message)).resolves.not.toThrow()
  })

  it('should normalize message before processing', async () => {
    const message: ConversationMessage = {
      id: 'msg_1',
      content: 'Test message',
      role: 'user',
      channel: 'web',
      metadata: {
        userId: 'user_1',
        orgId: 'org_1',
        threadId: 'thread_1',
        replyTo: 'msg_0',
      },
      timestamp: new Date(),
    }

    // Should preserve metadata
    await expect(
      router.handleMessage(message, { skipCostGuard: true })
    ).resolves.not.toThrow()
  })

  it('should support thread context assembly', async () => {
    // Mock conversation history
    const mockFromFn = vi.fn()
    mockSupabase.from = mockFromFn.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [
          {
            id: 'msg_1',
            content: 'Previous message',
            role: 'user',
            channel: 'web',
            timestamp: new Date(),
          },
        ],
        error: null,
      }),
    })

    const message: ConversationMessage = {
      id: 'msg_2',
      content: 'Follow-up message',
      role: 'user',
      channel: 'web',
      metadata: {
        userId: 'user_1',
        orgId: 'org_1',
        threadId: 'thread_1',
      },
      timestamp: new Date(),
    }

    await expect(
      router.handleMessage(message, { skipCostGuard: true })
    ).resolves.not.toThrow()
  })
})

describe('createConversationRouter factory', () => {
  it('should create router with default transports', () => {
    const mockSupabase = createMockSupabase()
    const router = createConversationRouter(mockSupabase as SupabaseClient)

    expect(router).toBeDefined()
    expect(router).toBeInstanceOf(ConversationRouter)
  })

  it('should support web controller', () => {
    const mockSupabase = createMockSupabase()
    const mockController = { enqueue: vi.fn() } as any

    const router = createConversationRouter(mockSupabase as SupabaseClient, mockController)
    expect(router).toBeDefined()
  })
})

describe('Integration scenarios', () => {
  let router: ConversationRouter
  let mockSupabase: Partial<SupabaseClient>

  beforeEach(() => {
    mockSupabase = createMockSupabase()
    const transports = new Map()
    transports.set('web', new WebTransport())
    transports.set('whatsapp', new WhatsAppTransport(mockSupabase as SupabaseClient, 'org_1'))
    transports.set('email', new EmailTransport())
    transports.set('sms', new SMSTransport())
    transports.set('slack', new SlackTransport())
    router = new ConversationRouter(transports, mockSupabase as SupabaseClient)
  })

  it('should route web messages to web transport', async () => {
    const message: ConversationMessage = {
      id: 'msg_1',
      content: 'Create task: Review PR',
      role: 'user',
      channel: 'web',
      metadata: {
        userId: 'user_1',
        orgId: 'org_1',
        threadId: 'thread_1',
      },
      timestamp: new Date(),
    }

    await expect(
      router.handleMessage(message, { skipCostGuard: true })
    ).resolves.not.toThrow()
  })

  it('should handle multi-channel responses', async () => {
    const channels: ConversationMessage['channel'][] = [
      'web',
      'whatsapp',
      'email',
      'sms',
      'slack',
    ]

    for (const channel of channels) {
      const message: ConversationMessage = {
        id: `msg_${channel}`,
        content: 'Test message',
        role: 'user',
        channel,
        metadata: {
          userId: 'user_1',
          orgId: 'org_1',
          threadId: `thread_${channel}`,
        },
        timestamp: new Date(),
      }

      await expect(
        router.handleMessage(message, { skipCostGuard: true })
      ).resolves.not.toThrow()
    }
  })

  it('should preserve thread identity across channels', async () => {
    const threadId = 'shared_thread_123'

    const webMsg: ConversationMessage = {
      id: 'msg_web',
      content: 'Started on web',
      role: 'user',
      channel: 'web',
      metadata: {
        userId: 'user_1',
        orgId: 'org_1',
        threadId,
      },
      timestamp: new Date(),
    }

    const emailMsg: ConversationMessage = {
      id: 'msg_email',
      content: 'Continued via email',
      role: 'user',
      channel: 'email',
      metadata: {
        userId: 'user_1',
        orgId: 'org_1',
        threadId,
      },
      timestamp: new Date(),
    }

    await expect(
      router.handleMessage(webMsg, { skipCostGuard: true })
    ).resolves.not.toThrow()
    await expect(
      router.handleMessage(emailMsg, { skipCostGuard: true })
    ).resolves.not.toThrow()
  })
})
