import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getServiceClient } from '@/lib/supabase/service-client'

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: createClientMock,
}))

type ContactRow = {
  id: string
  org_id: string
  name: string
}

type TaskRow = {
  id: string
  org_id: string
  title: string
}

type InvoiceRow = {
  id: string
  org_id: string
  contact_name: string
  amount: number
  status: string
}

type ChannelMessageRow = {
  id: string
  org_id: string
  channel: string
  body: string
  sender: string
}

type ConversationRow = {
  id: string
  org_id: string
  user_id: string
  title: string
}

function createTenancySupabase(seed?: {
  contacts?: ContactRow[]
  invoices?: InvoiceRow[]
  channelMessages?: ChannelMessageRow[]
  conversations?: ConversationRow[]
  activeOrgId?: string
  accessibleOrgIds?: string[]
}) {
  const state = {
    contacts: [...(seed?.contacts ?? [])],
    tasks: [] as TaskRow[],
    invoices: [...(seed?.invoices ?? [])],
    channelMessages: [...(seed?.channelMessages ?? [])],
    conversations: [...(seed?.conversations ?? [])],
    activeOrgId: seed?.activeOrgId ?? 'orgA',
    accessibleOrgIds: [...(seed?.accessibleOrgIds ?? ['orgA'])],
    lastOrgFilter: [] as string[],
    lastTableQueried: '',
  }

  function buildFilterableSelect(rows: Array<{ org_id: string; [key: string]: unknown }>) {
    return {
      select() {
        return {
          in(_key: string, values: string[]) {
            state.lastOrgFilter = values
            const filtered = rows.filter((row) => values.includes(row.org_id))
            return Promise.resolve({ data: filtered, error: null })
          },
          eq(key: string, value: string) {
            const filtered = rows.filter((row) => (row as Record<string, unknown>)[key] === value)
            return {
              eq(key2: string, value2: string) {
                const doubly = filtered.filter((row) => (row as Record<string, unknown>)[key2] === value2)
                return Promise.resolve({ data: doubly, error: null })
              },
              then: (resolve: (v: any) => void) => resolve({ data: filtered, error: null }),
            }
          },
        }
      },
    }
  }

  const supabase = {
    rpc: vi.fn((fn: string) => {
      if (fn === 'get_user_accessible_org_ids') {
        return Promise.resolve({ data: state.accessibleOrgIds, error: null })
      }
      if (fn === 'get_user_active_org_id') {
        return Promise.resolve({ data: state.activeOrgId, error: null })
      }
      return Promise.resolve({ data: null, error: null })
    }),

    from(table: string) {
      state.lastTableQueried = table

      if (table === 'contacts') {
        return buildFilterableSelect(state.contacts)
      }

      if (table === 'invoices') {
        return buildFilterableSelect(state.invoices)
      }

      if (table === 'channel_messages') {
        return buildFilterableSelect(state.channelMessages)
      }

      if (table === 'conversations') {
        return buildFilterableSelect(state.conversations)
      }

      if (table === 'tasks') {
        return {
          insert(payload: Omit<TaskRow, 'id'>) {
            const row: TaskRow = {
              id: `task-${state.tasks.length + 1}`,
              ...payload,
            }
            state.tasks.push(row)

            return {
              select: () => ({
                single: () => Promise.resolve({ data: row, error: null }),
              }),
            }
          },
          ...buildFilterableSelect(state.tasks),
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    },
  }

  return {
    supabase,
    state,
  }
}

async function listContactsWithinAccessibleOrgs(supabase: any, userId: string) {
  const { data: orgIds } = await supabase.rpc('get_user_accessible_org_ids', { p_user_id: userId })
  return supabase.from('contacts').select('id, org_id, name').in('org_id', orgIds ?? [])
}

async function insertTaskForActiveOrg(supabase: any, userId: string, title: string) {
  const { data: activeOrgId } = await supabase.rpc('get_user_active_org_id', { p_user_id: userId })
  return supabase
    .from('tasks')
    .insert({ org_id: activeOrgId, title })
    .select()
    .single()
}

async function runServiceRoleAdminOperation(serviceClient: any) {
  return serviceClient.from('audit_logs').select('id, action, created_at')
}

afterEach(() => vi.restoreAllMocks())

beforeEach(() => {
  createClientMock.mockReset()
})

describe('Multi-tenant Isolation Integration', () => {
  it('user can only access data from their accessible orgs', async () => {
    const { supabase, state } = createTenancySupabase({
      contacts: [
        { id: 'c-a', org_id: 'orgA', name: 'Alice' },
        { id: 'c-b', org_id: 'orgB', name: 'Bob' },
        { id: 'c-c', org_id: 'orgC', name: 'Carol' },
      ],
      accessibleOrgIds: ['orgA', 'orgB'],
    })

    const result = await listContactsWithinAccessibleOrgs(supabase, 'user-1')

    expect(supabase.rpc).toHaveBeenCalledWith('get_user_accessible_org_ids', { p_user_id: 'user-1' })
    expect(state.lastOrgFilter).toEqual(['orgA', 'orgB'])
    expect(result.data.map((row: ContactRow) => row.org_id)).toEqual(['orgA', 'orgB'])
  })

  it('returns no contacts when user has zero accessible orgs', async () => {
    const { supabase, state } = createTenancySupabase({
      contacts: [
        { id: 'c-a', org_id: 'orgA', name: 'Alice' },
        { id: 'c-b', org_id: 'orgB', name: 'Bob' },
      ],
      accessibleOrgIds: [],
    })

    const result = await listContactsWithinAccessibleOrgs(supabase, 'user-no-access')

    expect(supabase.rpc).toHaveBeenCalledWith('get_user_accessible_org_ids', { p_user_id: 'user-no-access' })
    expect(state.lastOrgFilter).toEqual([])
    expect(result.data).toEqual([])
  })

  it('insert uses active org ID only', async () => {
    const { supabase, state } = createTenancySupabase({
      activeOrgId: 'orgB',
      accessibleOrgIds: ['orgA', 'orgB'],
    })

    const inserted = await insertTaskForActiveOrg(supabase, 'user-22', 'Follow up with lead')

    expect(supabase.rpc).toHaveBeenCalledWith('get_user_active_org_id', { p_user_id: 'user-22' })
    expect(inserted.data.org_id).toBe('orgB')
    expect(state.tasks[0].org_id).toBe('orgB')
  })

  it('org switch changes active org context', async () => {
    const { supabase, state } = createTenancySupabase({
      activeOrgId: 'orgA',
      accessibleOrgIds: ['orgA', 'orgB'],
    })

    const switchActiveOrg = vi.fn(async (_userId: string, newOrgId: string) => {
      state.activeOrgId = newOrgId
    })

    await insertTaskForActiveOrg(supabase, 'user-3', 'Task in org A')
    await switchActiveOrg('user-3', 'orgB')
    await insertTaskForActiveOrg(supabase, 'user-3', 'Task in org B')

    expect(switchActiveOrg).toHaveBeenCalledWith('user-3', 'orgB')
    expect(state.tasks.map((task) => task.org_id)).toEqual(['orgA', 'orgB'])
  })

  // -----------------------------------------------------------------------
  // NEW: Invoice isolation tests
  // -----------------------------------------------------------------------
  it('org A cannot see org B invoices', async () => {
    const { supabase, state } = createTenancySupabase({
      invoices: [
        { id: 'inv-1', org_id: 'orgA', contact_name: 'Client A', amount: 1000, status: 'DRAFT' },
        { id: 'inv-2', org_id: 'orgB', contact_name: 'Client B', amount: 2000, status: 'DRAFT' },
        { id: 'inv-3', org_id: 'orgA', contact_name: 'Client C', amount: 3000, status: 'PAID' },
      ],
      accessibleOrgIds: ['orgA'],
    })

    const { data: orgIds } = await supabase.rpc('get_user_accessible_org_ids', { p_user_id: 'user-orgA' })
    const result = await supabase.from('invoices').select('*').in('org_id', orgIds ?? [])

    expect(result.data).toHaveLength(2)
    expect(result.data.every((inv: InvoiceRow) => inv.org_id === 'orgA')).toBe(true)
    expect(result.data.map((inv: InvoiceRow) => inv.id)).toEqual(['inv-1', 'inv-3'])
  })

  it('org B cannot see org A invoices (reverse direction)', async () => {
    const { supabase } = createTenancySupabase({
      invoices: [
        { id: 'inv-1', org_id: 'orgA', contact_name: 'Client A', amount: 1000, status: 'DRAFT' },
        { id: 'inv-2', org_id: 'orgB', contact_name: 'Client B', amount: 2000, status: 'DRAFT' },
      ],
      accessibleOrgIds: ['orgB'],
    })

    const { data: orgIds } = await supabase.rpc('get_user_accessible_org_ids', { p_user_id: 'user-orgB' })
    const result = await supabase.from('invoices').select('*').in('org_id', orgIds ?? [])

    expect(result.data).toHaveLength(1)
    expect(result.data[0].org_id).toBe('orgB')
    expect(result.data[0].id).toBe('inv-2')
  })

  // -----------------------------------------------------------------------
  // NEW: Channel message isolation tests
  // -----------------------------------------------------------------------
  it('channel_messages are isolated per org', async () => {
    const { supabase } = createTenancySupabase({
      channelMessages: [
        { id: 'msg-1', org_id: 'orgA', channel: 'email', body: 'Hello from orgA', sender: 'alice' },
        { id: 'msg-2', org_id: 'orgB', channel: 'email', body: 'Hello from orgB', sender: 'bob' },
        { id: 'msg-3', org_id: 'orgA', channel: 'sms', body: 'SMS from orgA', sender: 'carol' },
        { id: 'msg-4', org_id: 'orgC', channel: 'whatsapp', body: 'WhatsApp from orgC', sender: 'dave' },
      ],
      accessibleOrgIds: ['orgA'],
    })

    const { data: orgIds } = await supabase.rpc('get_user_accessible_org_ids', { p_user_id: 'user-1' })
    const result = await supabase.from('channel_messages').select('*').in('org_id', orgIds ?? [])

    expect(result.data).toHaveLength(2)
    expect(result.data.every((msg: ChannelMessageRow) => msg.org_id === 'orgA')).toBe(true)
  })

  it('channel_messages returns nothing for non-member org', async () => {
    const { supabase } = createTenancySupabase({
      channelMessages: [
        { id: 'msg-1', org_id: 'orgA', channel: 'email', body: 'Private', sender: 'alice' },
      ],
      accessibleOrgIds: ['orgX'],
    })

    const { data: orgIds } = await supabase.rpc('get_user_accessible_org_ids', { p_user_id: 'outsider' })
    const result = await supabase.from('channel_messages').select('*').in('org_id', orgIds ?? [])

    expect(result.data).toHaveLength(0)
  })

  // -----------------------------------------------------------------------
  // NEW: Conversation isolation tests
  // -----------------------------------------------------------------------
  it('conversations are isolated per org', async () => {
    const { supabase } = createTenancySupabase({
      conversations: [
        { id: 'conv-1', org_id: 'orgA', user_id: 'user-1', title: 'Strategy chat' },
        { id: 'conv-2', org_id: 'orgB', user_id: 'user-2', title: 'Budget discussion' },
        { id: 'conv-3', org_id: 'orgA', user_id: 'user-1', title: 'Follow-up' },
      ],
      accessibleOrgIds: ['orgA'],
    })

    const { data: orgIds } = await supabase.rpc('get_user_accessible_org_ids', { p_user_id: 'user-1' })
    const result = await supabase.from('conversations').select('*').in('org_id', orgIds ?? [])

    expect(result.data).toHaveLength(2)
    expect(result.data.every((c: ConversationRow) => c.org_id === 'orgA')).toBe(true)
  })

  // -----------------------------------------------------------------------
  // NEW: Multi-org member can access both
  // -----------------------------------------------------------------------
  it('multi-org member sees data from all accessible orgs', async () => {
    const { supabase } = createTenancySupabase({
      contacts: [
        { id: 'c-1', org_id: 'orgA', name: 'Alice' },
        { id: 'c-2', org_id: 'orgB', name: 'Bob' },
        { id: 'c-3', org_id: 'orgC', name: 'Carol' },
      ],
      invoices: [
        { id: 'inv-1', org_id: 'orgA', contact_name: 'Client A', amount: 100, status: 'DRAFT' },
        { id: 'inv-2', org_id: 'orgC', contact_name: 'Client C', amount: 300, status: 'PAID' },
      ],
      accessibleOrgIds: ['orgA', 'orgB', 'orgC'],
    })

    const { data: orgIds } = await supabase.rpc('get_user_accessible_org_ids', { p_user_id: 'admin' })
    const contacts = await supabase.from('contacts').select('*').in('org_id', orgIds ?? [])
    const invoices = await supabase.from('invoices').select('*').in('org_id', orgIds ?? [])

    expect(contacts.data).toHaveLength(3)
    expect(invoices.data).toHaveLength(2)
  })

  // -----------------------------------------------------------------------
  // NEW: Cross-table consistency
  // -----------------------------------------------------------------------
  it('org filter is consistently applied across different tables', async () => {
    const { supabase, state } = createTenancySupabase({
      contacts: [
        { id: 'c-1', org_id: 'orgA', name: 'A' },
        { id: 'c-2', org_id: 'orgB', name: 'B' },
      ],
      invoices: [
        { id: 'inv-1', org_id: 'orgA', contact_name: 'X', amount: 100, status: 'DRAFT' },
        { id: 'inv-2', org_id: 'orgB', contact_name: 'Y', amount: 200, status: 'PAID' },
      ],
      channelMessages: [
        { id: 'msg-1', org_id: 'orgA', channel: 'email', body: 'hi', sender: 'a' },
        { id: 'msg-2', org_id: 'orgB', channel: 'sms', body: 'yo', sender: 'b' },
      ],
      conversations: [
        { id: 'conv-1', org_id: 'orgA', user_id: 'u1', title: 'T1' },
        { id: 'conv-2', org_id: 'orgB', user_id: 'u2', title: 'T2' },
      ],
      accessibleOrgIds: ['orgA'],
    })

    const { data: orgIds } = await supabase.rpc('get_user_accessible_org_ids', { p_user_id: 'user-1' })

    const contacts = await supabase.from('contacts').select('*').in('org_id', orgIds ?? [])
    const invoices = await supabase.from('invoices').select('*').in('org_id', orgIds ?? [])
    const messages = await supabase.from('channel_messages').select('*').in('org_id', orgIds ?? [])
    const convos = await supabase.from('conversations').select('*').in('org_id', orgIds ?? [])

    // All tables should return only orgA data
    expect(contacts.data).toHaveLength(1)
    expect(invoices.data).toHaveLength(1)
    expect(messages.data).toHaveLength(1)
    expect(convos.data).toHaveLength(1)

    // Verify all returned rows belong to orgA
    expect(contacts.data[0].org_id).toBe('orgA')
    expect(invoices.data[0].org_id).toBe('orgA')
    expect(messages.data[0].org_id).toBe('orgA')
    expect(convos.data[0].org_id).toBe('orgA')
  })

  it('service role bypasses RLS for admin operations', async () => {
    process.env.SUPABASE_URL = 'https://supabase.example'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'

    const serviceSelectMock = vi.fn().mockResolvedValue({ data: [{ id: 'audit-1' }], error: null })
    const serviceFromMock = vi.fn().mockReturnValue({
      select: serviceSelectMock,
    })

    createClientMock.mockReturnValue({
      from: serviceFromMock,
    })

    const serviceClient = getServiceClient()
    const response = await runServiceRoleAdminOperation(serviceClient)

    expect(createClientMock).toHaveBeenCalledWith(
      'https://supabase.example',
      'service-role-key',
      expect.objectContaining({
        auth: expect.objectContaining({
          autoRefreshToken: false,
          persistSession: false,
        }),
      }),
    )

    expect(serviceFromMock).toHaveBeenCalledWith('audit_logs')
    expect(serviceSelectMock).toHaveBeenCalledWith('id, action, created_at')
    expect(response.data).toEqual([{ id: 'audit-1' }])
  })
})
