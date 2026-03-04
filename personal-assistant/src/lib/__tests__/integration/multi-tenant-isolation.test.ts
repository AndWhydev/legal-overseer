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

function createTenancySupabase(seed?: {
  contacts?: ContactRow[]
  activeOrgId?: string
  accessibleOrgIds?: string[]
}) {
  const state = {
    contacts: [...(seed?.contacts ?? [])],
    tasks: [] as TaskRow[],
    activeOrgId: seed?.activeOrgId ?? 'orgA',
    accessibleOrgIds: [...(seed?.accessibleOrgIds ?? ['orgA'])],
    lastOrgFilter: [] as string[],
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
      if (table === 'contacts') {
        return {
          select() {
            return {
              in(_key: string, values: string[]) {
                state.lastOrgFilter = values
                const rows = state.contacts.filter((contact) => values.includes(contact.org_id))
                return Promise.resolve({ data: rows, error: null })
              },
            }
          },
        }
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
