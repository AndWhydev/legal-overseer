import { describe, expect, it, vi } from 'vitest'
import { getActiveOrgId, getTenancyContext } from './tenancy'
import { resolveOrgFromSession } from './core/resolve-org'

type QueryResult<T> = Promise<{ data: T | null; error: { message: string } | null }>

function result<T>(data: T | null, error: { message: string } | null = null): QueryResult<T> {
  return Promise.resolve({ data, error })
}

function createLegacySchemaSupabase() {
  const legacyOrg = {
    id: 'org-legacy',
    name: 'Legacy Workspace',
    slug: 'legacy-workspace',
    plan: 'free',
    settings: {},
  }

  const supabase = {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
    },
    from(table: string) {
      if (table === 'profiles') {
        return {
          select(selection: string) {
            if (selection === 'personal_org_id, active_org_id') {
              return {
                eq() {
                  return {
                    single: () =>
                      result(
                        null,
                        { message: 'column profiles.personal_org_id does not exist' },
                      ),
                  }
                },
              }
            }

            if (selection === 'org_id') {
              return {
                eq() {
                  return {
                    single: () => result({ org_id: legacyOrg.id }),
                  }
                },
              }
            }

            throw new Error(`Unexpected profiles select: ${selection}`)
          },
        }
      }

      if (table === 'org_members') {
        return {
          select() {
            return {
              eq() {
                return {
                  returns: () =>
                    result(
                      null,
                      { message: "Could not find the table 'public.org_members' in the schema cache" },
                    ),
                }
              },
            }
          },
        }
      }

      if (table === 'organisations') {
        return {
          select(selection: string) {
            if (selection === 'id, name, slug, plan, settings') {
              return {
                eq() {
                  return {
                    maybeSingle: () => result(legacyOrg),
                  }
                },
              }
            }

            throw new Error(`Unexpected organizations select: ${selection}`)
          },
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    },
  }

  return supabase as any
}

describe('legacy tenancy schema compatibility', () => {
  it('falls back to profiles.org_id in getActiveOrgId', async () => {
    const supabase = createLegacySchemaSupabase()

    await expect(getActiveOrgId(supabase, 'user-1')).resolves.toBe('org-legacy')
  })

  it('falls back to profiles.org_id in resolveOrgFromSession', async () => {
    const supabase = createLegacySchemaSupabase()

    await expect(resolveOrgFromSession(supabase)).resolves.toBe('org-legacy')
  })

  it('builds a single-org tenancy context when dual-tier tables are unavailable', async () => {
    const supabase = createLegacySchemaSupabase()

    await expect(getTenancyContext(supabase, 'user-1')).resolves.toEqual({
      userId: 'user-1',
      personalOrgId: 'org-legacy',
      activeOrgId: 'org-legacy',
      accessibleOrgIds: ['org-legacy'],
      activeOrg: {
        id: 'org-legacy',
        name: 'Legacy Workspace',
        slug: 'legacy-workspace',
        plan: 'free',
        tier: 'personal',
        settings: {},
      },
      memberships: [],
    })
  })
})
