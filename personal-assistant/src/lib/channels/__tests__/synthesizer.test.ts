import { describe, expect, it, vi, afterEach } from 'vitest'
import { getAdapter, getAllAdapters } from '../synthesizer'

// Mock all adapters to avoid real API calls
vi.mock('../gmail', () => ({
  gmailAdapter: { type: 'gmail', name: 'Gmail', description: 'Mock', icon: 'Mail', pull: vi.fn(async () => []), isAvailable: vi.fn(async () => false) },
}))
vi.mock('../outlook', () => ({
  outlookAdapter: { type: 'outlook', name: 'Outlook', description: 'Mock', icon: 'Mail', pull: vi.fn(async () => []), isAvailable: vi.fn(async () => false) },
}))
vi.mock('../imessage', () => ({
  imessageAdapter: { type: 'imessage', name: 'iMessage', description: 'Mock', icon: 'MessageSquare', pull: vi.fn(async () => []), isAvailable: vi.fn(async () => false) },
}))
vi.mock('../calendar', () => ({
  calendarAdapter: { type: 'calendar', name: 'Calendar', description: 'Mock', icon: 'Calendar', pull: vi.fn(async () => []), isAvailable: vi.fn(async () => false) },
}))
vi.mock('../reminders', () => ({
  remindersAdapter: { type: 'reminders', name: 'Reminders', description: 'Mock', icon: 'Bell', pull: vi.fn(async () => []), isAvailable: vi.fn(async () => false) },
}))
vi.mock('../whatsapp', () => ({
  whatsappAdapter: { type: 'whatsapp', name: 'WhatsApp', description: 'Mock', icon: 'Phone', pull: vi.fn(async () => []), isAvailable: vi.fn(async () => false) },
}))
vi.mock('../gsc', () => ({
  gscAdapter: { type: 'gsc', name: 'GSC', description: 'Mock', icon: 'Search', pull: vi.fn(async () => []), isAvailable: vi.fn(async () => false) },
}))
vi.mock('../asana', () => ({
  asanaAdapter: { type: 'asana', name: 'Asana', description: 'Mock', icon: 'CheckSquare', pull: vi.fn(async () => []), isAvailable: vi.fn(async () => false) },
}))
vi.mock('../calendly', () => ({
  calendlyAdapter: { type: 'calendly', name: 'Calendly', description: 'Mock', icon: 'Clock', pull: vi.fn(async () => []), isAvailable: vi.fn(async () => false) },
}))
vi.mock('../stripe', () => ({
  stripeAdapter: { type: 'stripe', name: 'Stripe', description: 'Mock', icon: 'CreditCard', pull: vi.fn(async () => []), isAvailable: vi.fn(async () => false) },
}))
vi.mock('@/lib/context/timeline-writer', () => ({
  writeMessageEvent: vi.fn(),
}))

afterEach(() => vi.restoreAllMocks())

describe('getAdapter', () => {
  it('returns gmail adapter', () => {
    const adapter = getAdapter('gmail')
    expect(adapter).toBeDefined()
    expect(adapter?.type).toBe('gmail')
  })

  it('returns outlook adapter', () => {
    const adapter = getAdapter('outlook')
    expect(adapter).toBeDefined()
    expect(adapter?.type).toBe('outlook')
  })

  it('returns asana adapter', () => {
    const adapter = getAdapter('asana')
    expect(adapter?.type).toBe('asana')
  })

  it('returns calendly adapter', () => {
    const adapter = getAdapter('calendly')
    expect(adapter?.type).toBe('calendly')
  })

  it('returns stripe adapter', () => {
    const adapter = getAdapter('stripe')
    expect(adapter?.type).toBe('stripe')
  })

  it('returns undefined for unknown type', () => {
    const adapter = getAdapter('unknown' as any)
    expect(adapter).toBeUndefined()
  })
})

describe('getAllAdapters', () => {
  it('returns all registered adapters', () => {
    const adapters = getAllAdapters()
    expect(adapters.length).toBeGreaterThanOrEqual(8)
    const types = adapters.map(a => a.type)
    expect(types).toContain('gmail')
    expect(types).toContain('outlook')
    expect(types).toContain('asana')
    expect(types).toContain('calendly')
    expect(types).toContain('stripe')
    expect(types).toContain('whatsapp')
  })

  it('all adapters have required fields', () => {
    const adapters = getAllAdapters()
    for (const adapter of adapters) {
      expect(adapter.type).toBeTruthy()
      expect(adapter.name).toBeTruthy()
      expect(typeof adapter.pull).toBe('function')
      expect(typeof adapter.isAvailable).toBe('function')
    }
  })
})
