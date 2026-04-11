import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { createClientMock, isSupabaseConfiguredMock, createOrgMock, loggerErrorMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  isSupabaseConfiguredMock: vi.fn(),
  createOrgMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
  isSupabaseConfigured: isSupabaseConfiguredMock,
}))

vi.mock('@/lib/onboarding/multi-tenant', () => ({
  createOrg: createOrgMock,
  setupChannels: vi.fn(),
}))

vi.mock('@/lib/onboarding/beta-flow', () => ({
  runBetaOnboarding: vi.fn(),
}))

vi.mock('@/lib/core/logger', () => ({
  logger: {
    error: loggerErrorMock,
  },
}))

describe('/api/onboarding POST', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isSupabaseConfiguredMock.mockReturnValue(true)
    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: 'user-123',
              email: 'owner@example.com',
              user_metadata: {},
            },
          },
        }),
      },
      from: vi.fn(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            error: null,
          }),
        }),
      })),
    })
    createOrgMock.mockResolvedValue({
      orgId: 'org-123',
      ownerId: 'user-123',
      rlsConfigured: true,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('accepts first-run workspace setup without a selected plan', async () => {
    const { POST } = await import('./route')

    const response = await POST(
      new Request('http://localhost/api/onboarding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'All Webbed Up',
          ownerName: 'Andy Smith',
          industry: 'digital-agency',
          plan: 'enterprise',
        }),
      }) as any,
    )

    expect(response.status).toBe(201)
    expect(createOrgMock).toHaveBeenCalledWith(
      expect.anything(),
      {
        name: 'All Webbed Up',
        ownerEmail: 'owner@example.com',
        ownerName: 'Andy Smith',
        plan: 'starter',
        industry: 'digital-agency',
      },
    )
    await expect(response.json()).resolves.toEqual({
      orgId: 'org-123',
      ownerId: 'user-123',
      rlsConfigured: true,
    })
  })

  it('confirms an existing workspace instead of creating a second workspace', async () => {
    const profileMaybeSingleMock = vi.fn().mockResolvedValue({
      data: {
        active_org_id: 'org-active',
        org_id: 'org-shared',
        personal_org_id: 'org-personal',
        preferences: {},
      },
      error: null,
    })
    const orgEqMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: { id: 'org-personal' },
          error: null,
        }),
      }),
    })
    const profileEqMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: { id: 'user-123' },
          error: null,
        }),
      }),
    })
    const orgUpdateMock = vi.fn().mockReturnValue({
      eq: orgEqMock,
    })
    const profileUpdateMock = vi.fn().mockReturnValue({
      eq: profileEqMock,
    })

    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: 'user-123',
              email: 'owner@example.com',
              user_metadata: {},
            },
          },
        }),
      },
      from: vi.fn((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: profileMaybeSingleMock,
              }),
            }),
            update: profileUpdateMock,
          }
        }

        if (table === 'organisations') {
          return {
            update: orgUpdateMock,
          }
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
    })

    const { POST } = await import('./route')

    const response = await POST(
      new Request('http://localhost/api/onboarding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Existing Workspace',
          ownerName: 'Owner Name',
          industry: 'consulting',
          plan: 'enterprise',
        }),
      }) as any,
    )

    expect(response.status).toBe(201)
    expect(createOrgMock).not.toHaveBeenCalled()
    expect(orgUpdateMock).toHaveBeenCalledWith({
      name: 'Existing Workspace',
      industry: 'consulting',
    })
    expect(orgEqMock).toHaveBeenCalledWith('id', 'org-personal')
    expect(profileUpdateMock).toHaveBeenCalledWith({
      org_id: 'org-personal',
      personal_org_id: 'org-personal',
      active_org_id: 'org-personal',
      display_name: 'Owner Name',
      preferences: {
        workspace_setup_completed: true,
      },
    })
    expect(profileEqMock).toHaveBeenCalledWith('id', 'user-123')
    expect(await response.json()).toEqual({
      orgId: 'org-personal',
      ownerId: 'user-123',
      rlsConfigured: true,
    })
  })

  it('falls back to the legacy profile schema when personal org columns are unavailable', async () => {
    const profileMaybeSingleMock = vi.fn().mockResolvedValue({
      data: {
        active_org_id: null,
        org_id: 'org-legacy',
        personal_org_id: null,
        preferences: {},
      },
      error: null,
    })
    const orgEqMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: { id: 'org-legacy' },
          error: null,
        }),
      }),
    })
    const profileEqMock = vi
      .fn()
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: null,
            error: {
              message: "Could not find the 'active_org_id' column of 'profiles' in the schema cache",
            },
          }),
        }),
      })
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: 'user-123' },
            error: null,
          }),
        }),
      })
    const profileUpdateMock = vi.fn().mockReturnValue({
      eq: profileEqMock,
    })

    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: 'user-123',
              email: 'owner@example.com',
              user_metadata: {},
            },
          },
        }),
      },
      from: vi.fn((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: profileMaybeSingleMock,
              }),
            }),
            update: profileUpdateMock,
          }
        }

        if (table === 'organisations') {
          return {
            update: vi.fn().mockReturnValue({
              eq: orgEqMock,
            }),
          }
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
    })

    const { POST } = await import('./route')

    const response = await POST(
      new Request('http://localhost/api/onboarding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Legacy Workspace',
          ownerName: 'Owner Name',
        }),
      }) as any,
    )

    expect(response.status).toBe(201)
    expect(profileUpdateMock).toHaveBeenNthCalledWith(1, {
      org_id: 'org-legacy',
      personal_org_id: 'org-legacy',
      active_org_id: 'org-legacy',
      display_name: 'Owner Name',
      preferences: {
        workspace_setup_completed: true,
      },
    })
    expect(profileUpdateMock).toHaveBeenNthCalledWith(2, {
      org_id: 'org-legacy',
      display_name: 'Owner Name',
      preferences: {
        workspace_setup_completed: true,
      },
    })
  })

  it('falls back to updating the workspace name only when the local database lacks the industry column', async () => {
    const profileMaybeSingleMock = vi.fn().mockResolvedValue({
      data: {
        active_org_id: 'org-active',
        org_id: 'org-shared',
        personal_org_id: 'org-personal',
        preferences: {},
      },
      error: null,
    })
    const orgEqMock = vi
      .fn()
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: null,
            error: {
              message: "Could not find the 'industry' column of 'organizations' in the schema cache",
            },
          }),
        }),
      })
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: 'org-personal' },
            error: null,
          }),
        }),
      })
    const profileEqMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: { id: 'user-123' },
          error: null,
        }),
      }),
    })
    const orgUpdateMock = vi.fn().mockReturnValue({
      eq: orgEqMock,
    })
    const profileUpdateMock = vi.fn().mockReturnValue({
      eq: profileEqMock,
    })

    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: 'user-123',
              email: 'owner@example.com',
              user_metadata: {},
            },
          },
        }),
      },
      from: vi.fn((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: profileMaybeSingleMock,
              }),
            }),
            update: profileUpdateMock,
          }
        }

        if (table === 'organisations') {
          return {
            update: orgUpdateMock,
          }
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
    })

    const { POST } = await import('./route')

    const response = await POST(
      new Request('http://localhost/api/onboarding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Legacy Workspace',
          ownerName: 'Owner Name',
          industry: 'consulting',
        }),
      }) as any,
    )

    expect(response.status).toBe(201)
    expect(orgUpdateMock).toHaveBeenNthCalledWith(1, {
      name: 'Legacy Workspace',
      industry: 'consulting',
    })
    expect(orgUpdateMock).toHaveBeenNthCalledWith(2, {
      name: 'Legacy Workspace',
    })
  })

  it('falls back to the american organizations table when the british table name is unavailable', async () => {
    const profileMaybeSingleMock = vi.fn().mockResolvedValue({
      data: {
        active_org_id: 'org-active',
        org_id: 'org-shared',
        personal_org_id: 'org-personal',
        preferences: {},
      },
      error: null,
    })
    const missingTableEqMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: null,
          error: { message: "Could not find the table 'public.organisations' in the schema cache" },
        }),
      }),
    })
    const fallbackTableEqMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: { id: 'org-personal' },
          error: null,
        }),
      }),
    })
    const orgUpdateBritishMock = vi.fn().mockReturnValue({
      eq: missingTableEqMock,
    })
    const orgUpdateAmericanMock = vi.fn().mockReturnValue({
      eq: fallbackTableEqMock,
    })
    const profileEqMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: { id: 'user-123' },
          error: null,
        }),
      }),
    })
    const profileUpdateMock = vi.fn().mockReturnValue({
      eq: profileEqMock,
    })

    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: 'user-123',
              email: 'owner@example.com',
              user_metadata: {},
            },
          },
        }),
      },
      from: vi.fn((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: profileMaybeSingleMock,
              }),
            }),
            update: profileUpdateMock,
          }
        }

        if (table === 'organisations') {
          return {
            update: orgUpdateBritishMock,
          }
        }

        if (table === 'organizations') {
          return {
            update: orgUpdateAmericanMock,
          }
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
    })

    const { POST } = await import('./route')

    const response = await POST(
      new Request('http://localhost/api/onboarding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Legacy Workspace',
          ownerName: 'Owner Name',
          industry: 'consulting',
        }),
      }) as any,
    )

    expect(response.status).toBe(201)
    expect(orgUpdateBritishMock).toHaveBeenCalledWith({
      name: 'Legacy Workspace',
      industry: 'consulting',
    })
    expect(orgUpdateAmericanMock).toHaveBeenCalledWith({
      name: 'Legacy Workspace',
      industry: 'consulting',
    })
  })

  it('fails confirmation when the target workspace update affects no rows', async () => {
    const profileMaybeSingleMock = vi.fn().mockResolvedValue({
      data: {
        active_org_id: 'org-active',
        org_id: null,
        personal_org_id: 'org-personal',
        preferences: {},
      },
      error: null,
    })
    const orgEqMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      }),
    })
    const profileUpdateMock = vi.fn()

    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: 'user-123',
              email: 'owner@example.com',
              user_metadata: {},
            },
          },
        }),
      },
      from: vi.fn((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: profileMaybeSingleMock,
              }),
            }),
            update: profileUpdateMock,
          }
        }

        if (table === 'organisations') {
          return {
            update: vi.fn().mockReturnValue({
              eq: orgEqMock,
            }),
          }
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
    })

    const { POST } = await import('./route')

    const response = await POST(
      new Request('http://localhost/api/onboarding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Existing Workspace',
          ownerName: 'Owner Name',
        }),
      }) as any,
    )

    expect(response.status).toBe(500)
    expect(profileUpdateMock).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toMatchObject({
      error: 'Onboarding failed',
    })
  })

  it('returns correct shape from workspace creation', async () => {
    const { POST } = await import('./route')

    const response = await POST(
      new Request('http://localhost/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Test Workspace',
          ownerName: 'Owner',
          industry: 'consulting',
        }),
      }) as any,
    )

    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body).toHaveProperty('orgId')
    expect(body).toHaveProperty('ownerId')
    expect(body).toHaveProperty('rlsConfigured', true)
  })

  it('returns 400 for missing required name field', async () => {
    const { POST } = await import('./route')

    const response = await POST(
      new Request('http://localhost/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerName: 'Owner',
          industry: 'consulting',
        }),
      }) as any,
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: 'Missing required field: name',
    })
  })

  it('returns 400 for invalid JSON body', async () => {
    const { POST } = await import('./route')

    const response = await POST(
      new Request('http://localhost/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not valid json{',
      }) as any,
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: 'Invalid JSON body',
    })
  })

  it('returns 401 when not authenticated', async () => {
    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
        }),
      },
    })

    const { POST } = await import('./route')

    const response = await POST(
      new Request('http://localhost/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test' }),
      }) as any,
    )

    expect(response.status).toBe(401)
  })
})
