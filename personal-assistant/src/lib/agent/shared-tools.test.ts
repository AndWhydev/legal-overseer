import { describe, it, expect, vi, beforeEach } from 'vitest'

// Chainable mock that always returns itself, with configurable terminal methods
function createMockSupabase() {
  const mock: Record<string, ReturnType<typeof vi.fn>> = {}
  const chainMethods = ['from', 'select', 'insert', 'update', 'eq', 'ilike', 'or', 'gte', 'order', 'limit']
  for (const m of chainMethods) {
    mock[m] = vi.fn().mockImplementation(() => mock)
  }
  mock.single = vi.fn()
  return mock
}

const mockSupabase = createMockSupabase()

vi.mock('@/lib/context/entity-resolver', () => ({
  resolveEntityRanked: vi.fn(),
}))

vi.mock('@/lib/context/timeline-writer', () => ({
  writeTaskEvent: vi.fn(),
  writeInvoiceEvent: vi.fn(),
}))

vi.mock('@/lib/context/relationship-linker', () => ({
  linkTaskToContact: vi.fn(),
}))

import {
  createTask,
  updateTask,
  searchTasks,
  getContact,
  searchContacts,
  createInvoice,
  updateInvoice,
  searchInvoices,
  logActivity,
} from './shared-tools'
import { resolveEntityRanked } from '@/lib/context/entity-resolver'
import { writeTaskEvent } from '@/lib/context/timeline-writer'
import { linkTaskToContact } from '@/lib/context/relationship-linker'

const ORG_ID = 'org-123'

describe('shared-tools', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Re-establish chain returns
    for (const key of Object.keys(mockSupabase)) {
      if (key !== 'single') {
        mockSupabase[key].mockImplementation(() => mockSupabase)
      }
    }
    mockSupabase.single.mockReset()
  })

  describe('createTask', () => {
    it('inserts with correct org_id and writes timeline event', async () => {
      // resolveColumnId("To Do") -> single returns column
      // count query -> select returns special chain
      // insert -> single returns task
      mockSupabase.single
        .mockResolvedValueOnce({ data: { id: 'col-todo' } })   // column lookup
        .mockResolvedValueOnce({ data: { id: 'task-1', title: 'Test' }, error: null }) // insert

      // Override select once for count query (second call to select)
      const originalSelect = mockSupabase.select.getMockImplementation()
      let selectCallCount = 0
      mockSupabase.select.mockImplementation((...args: unknown[]) => {
        selectCallCount++
        if (selectCallCount === 2) {
          // count query: select('*', { count: 'exact', head: true })
          return { eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ count: 3 }) }) }
        }
        return mockSupabase
      })

      const result = await createTask(mockSupabase as any, ORG_ID, { title: 'Test' })

      expect(result.success).toBe(true)
      expect(mockSupabase.from).toHaveBeenCalledWith('tasks')
      expect(mockSupabase.insert).toHaveBeenCalledWith(expect.objectContaining({
        org_id: ORG_ID,
        title: 'Test',
        position: 3,
      }))
      expect(writeTaskEvent).toHaveBeenCalledWith(mockSupabase, ORG_ID, 'task-1', 'task_created', expect.any(Object))
    })

    it('links contact if contact_id provided', async () => {
      mockSupabase.single
        .mockResolvedValueOnce({ data: { id: 'col-todo' } })
        .mockResolvedValueOnce({ data: { id: 'task-2', title: 'Linked' }, error: null })

      let selectCallCount = 0
      mockSupabase.select.mockImplementation(() => {
        selectCallCount++
        if (selectCallCount === 2) {
          return { eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ count: 0 }) }) }
        }
        return mockSupabase
      })

      await createTask(mockSupabase as any, ORG_ID, { title: 'Linked', contact_id: 'contact-1' })

      expect(linkTaskToContact).toHaveBeenCalledWith(mockSupabase, ORG_ID, 'task-2', 'contact-1')
    })
  })

  describe('updateTask', () => {
    it('updates correct fields and writes timeline event', async () => {
      mockSupabase.single.mockResolvedValueOnce({ data: { id: 'task-1', title: 'Updated' }, error: null })

      const result = await updateTask(mockSupabase as any, ORG_ID, 'task-1', { title: 'Updated' })

      expect(result.success).toBe(true)
      expect(mockSupabase.eq).toHaveBeenCalledWith('id', 'task-1')
      expect(mockSupabase.eq).toHaveBeenCalledWith('org_id', ORG_ID)
      expect(writeTaskEvent).toHaveBeenCalledWith(mockSupabase, ORG_ID, 'task-1', 'task_updated', { title: 'Updated' })
    })

    it('writes task_completed event when status=completed', async () => {
      mockSupabase.single.mockResolvedValueOnce({ data: { id: 'task-1' }, error: null })

      await updateTask(mockSupabase as any, ORG_ID, 'task-1', { status: 'completed' })

      expect(writeTaskEvent).toHaveBeenCalledWith(mockSupabase, ORG_ID, 'task-1', 'task_completed', expect.any(Object))
    })
  })

  describe('searchTasks', () => {
    it('applies query/status/priority filters', async () => {
      mockSupabase.limit.mockResolvedValueOnce({ data: [{ id: 'task-1' }], error: null })

      const result = await searchTasks(mockSupabase as any, ORG_ID, { query: 'test', status: 'pending', priority: 'high' })

      expect(result.success).toBe(true)
      expect(result.data?.results).toHaveLength(1)
      expect(mockSupabase.eq).toHaveBeenCalledWith('org_id', ORG_ID)
      expect(mockSupabase.eq).toHaveBeenCalledWith('status', 'pending')
      expect(mockSupabase.eq).toHaveBeenCalledWith('priority', 'high')
      expect(mockSupabase.or).toHaveBeenCalledWith('title.ilike.%test%,description.ilike.%test%')
    })
  })

  describe('searchContacts', () => {
    it('delegates to resolveEntityRanked and maps results', async () => {
      const mockRanked = [
        { contact: { id: 'c1', name: 'Alice' }, matchConfidence: 0.95, matchStep: 'exact' },
      ]
      vi.mocked(resolveEntityRanked).mockResolvedValue(mockRanked as never)

      const results = await searchContacts(mockSupabase as any, ORG_ID, 'Alice')

      expect(resolveEntityRanked).toHaveBeenCalledWith(mockSupabase, 'Alice', ORG_ID)
      expect(results).toHaveLength(1)
      expect(results[0].matchConfidence).toBe(0.95)
    })
  })

  describe('getContact', () => {
    it('queries by org_id + slug', async () => {
      mockSupabase.single.mockResolvedValueOnce({ data: { id: 'c1', slug: 'alice', name: 'Alice' }, error: null })

      const contact = await getContact(mockSupabase as any, ORG_ID, 'alice')

      expect(contact).not.toBeNull()
      expect(contact!.name).toBe('Alice')
      expect(mockSupabase.eq).toHaveBeenCalledWith('org_id', ORG_ID)
      expect(mockSupabase.eq).toHaveBeenCalledWith('slug', 'alice')
    })

    it('returns null on not found', async () => {
      mockSupabase.single.mockResolvedValueOnce({ data: null, error: { message: 'not found' } })

      const contact = await getContact(mockSupabase as any, ORG_ID, 'nobody')

      expect(contact).toBeNull()
    })
  })

  describe('createInvoice', () => {
    it('calculates subtotal/total from line items and inserts with org_id', async () => {
      const items = [
        { description: 'Web dev', quantity: 10, unit_price: 150, total: 1500 },
        { description: 'Design', quantity: 5, unit_price: 200, total: 1000 },
      ]
      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 'inv-1', invoice_number: 'INV-001', status: 'draft', total: 2750 },
        error: null,
      })

      const result = await createInvoice(mockSupabase as any, ORG_ID, {
        invoice_number: 'INV-001',
        client_contact_id: 'c1',
        items,
        due_date: '2026-03-01',
      })

      expect(result.success).toBe(true)
      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          org_id: ORG_ID,
          subtotal: 2500,
          tax: 250,
          total: 2750,
          currency: 'AUD',
        })
      )
    })
  })

  describe('logActivity', () => {
    it('inserts into activity_feed with all fields', async () => {
      mockSupabase.single.mockResolvedValueOnce({ data: { id: 'act-1' }, error: null })

      const result = await logActivity(mockSupabase as any, ORG_ID, {
        action_type: 'task',
        action: 'Created task',
        reasoning: 'User requested',
        result: 'Success',
      })

      expect(result.success).toBe(true)
      expect(mockSupabase.from).toHaveBeenCalledWith('activity_feed')
      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          org_id: ORG_ID,
          action_type: 'task',
          action: 'Created task',
        })
      )
    })
  })

  describe('updateInvoice', () => {
    it('updates status with org_id scoping', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 'inv-1', status: 'sent' },
        error: null,
      })

      const result = await updateInvoice(mockSupabase as any, ORG_ID, 'inv-1', { status: 'sent' })

      expect(result.success).toBe(true)
      expect(mockSupabase.eq).toHaveBeenCalledWith('id', 'inv-1')
      expect(mockSupabase.eq).toHaveBeenCalledWith('org_id', ORG_ID)
    })
  })

  describe('searchInvoices', () => {
    it('filters by status', async () => {
      mockSupabase.limit.mockResolvedValueOnce({
        data: [{ id: 'inv-1', status: 'overdue' }],
        error: null,
      })

      const result = await searchInvoices(mockSupabase as any, ORG_ID, { status: 'overdue' })

      expect(result.success).toBe(true)
      expect(mockSupabase.eq).toHaveBeenCalledWith('org_id', ORG_ID)
      expect(mockSupabase.eq).toHaveBeenCalledWith('status', 'overdue')
    })
  })

  describe('error handling', () => {
    it('createTask returns error result on Supabase failure', async () => {
      mockSupabase.single
        .mockResolvedValueOnce({ data: { id: 'col-todo' } }) // column lookup
        .mockResolvedValueOnce({ data: null, error: { message: 'insert failed' } })

      let selectCallCount = 0
      mockSupabase.select.mockImplementation(() => {
        selectCallCount++
        if (selectCallCount === 2) {
          return { eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ count: 0 }) }) }
        }
        return mockSupabase
      })

      const result = await createTask(mockSupabase as any, ORG_ID, { title: 'Fail' })

      expect(result.success).toBe(false)
    })

    it('updateTask returns error result on Supabase failure', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'update failed' },
      })

      const result = await updateTask(mockSupabase as any, ORG_ID, 'task-1', { title: 'Fail' })

      expect(result.success).toBe(false)
    })

    it('searchTasks returns error result on Supabase failure', async () => {
      mockSupabase.limit.mockResolvedValueOnce({
        data: null,
        error: { message: 'query failed' },
      })

      const result = await searchTasks(mockSupabase as any, ORG_ID, {})

      expect(result.success).toBe(false)
    })

    it('createInvoice returns error result on Supabase failure', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'insert failed' },
      })

      const result = await createInvoice(mockSupabase as any, ORG_ID, {
        invoice_number: 'INV-FAIL',
        client_contact_id: 'c1',
        items: [{ description: 'x', quantity: 1, unit_price: 100, total: 100 }],
        due_date: '2026-03-01',
      })

      expect(result.success).toBe(false)
    })
  })

  describe('org scoping', () => {
    it('every query function passes org_id', async () => {
      // searchTasks
      mockSupabase.limit.mockResolvedValueOnce({ data: [], error: null })
      await searchTasks(mockSupabase as any, ORG_ID, {})
      expect(mockSupabase.eq).toHaveBeenCalledWith('org_id', ORG_ID)

      vi.clearAllMocks()
      for (const key of Object.keys(mockSupabase)) {
        if (key !== 'single') mockSupabase[key].mockImplementation(() => mockSupabase)
      }

      // getContact
      mockSupabase.single.mockResolvedValueOnce({ data: null, error: { message: 'nf' } })
      await getContact(mockSupabase as any, ORG_ID, 'test')
      expect(mockSupabase.eq).toHaveBeenCalledWith('org_id', ORG_ID)

      vi.clearAllMocks()
      for (const key of Object.keys(mockSupabase)) {
        if (key !== 'single') mockSupabase[key].mockImplementation(() => mockSupabase)
      }

      // logActivity
      mockSupabase.single.mockResolvedValueOnce({ data: { id: 'a1' }, error: null })
      await logActivity(mockSupabase as any, ORG_ID, { action_type: 'system', action: 'test' })
      expect(mockSupabase.insert).toHaveBeenCalledWith(expect.objectContaining({ org_id: ORG_ID }))
    })
  })
})
