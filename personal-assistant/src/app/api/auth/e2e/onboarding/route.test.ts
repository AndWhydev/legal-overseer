import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { getServiceClientMock } = vi.hoisted(() => ({
  getServiceClientMock: vi.fn(),
}))

vi.mock('@/lib/supabase/service-client', () => ({
  getServiceClient: getServiceClientMock,
}))

describe('/api/auth/e2e/onboarding POST', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('NODE_ENV', 'development')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('resets onboarding state back to a true first-run experience for an existing registered user in development', async () => {
    const listUsersMock = vi.fn().mockResolvedValue({
      data: {
        users: [{ id: 'user-123', email: 'hi@torkay.com' }],
      },
      error: null,
    })

    const maybeSingleMock = vi.fn().mockResolvedValue({
      data: {
        preferences: {
          communicationStyle: 'concise',
          onboarding_completed: true,
          workspace_setup_completed: true,
        },
      },
      error: null,
    })

    const selectAfterUpdateMock = vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: 'user-123' },
        error: null,
      }),
    })

    const eqAfterUpdateMock = vi.fn().mockReturnValue({
      select: selectAfterUpdateMock,
    })

    const updateMock = vi.fn().mockReturnValue({
      eq: eqAfterUpdateMock,
    })

    const eqAfterSelectMock = vi.fn().mockReturnValue({
      maybeSingle: maybeSingleMock,
    })

    const selectMock = vi.fn().mockReturnValue({
      eq: eqAfterSelectMock,
    })

    const fromMock = vi.fn().mockReturnValue({
      select: selectMock,
      update: updateMock,
    })

    getServiceClientMock.mockReturnValue({
      auth: {
        admin: {
          listUsers: listUsersMock,
        },
      },
      from: fromMock,
    })

    const { POST } = await import('./route')

    const response = await POST(
      new Request('http://localhost/api/auth/e2e/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'hi@torkay.com',
        }),
      }),
    )

    expect(response.status).toBe(200)
    expect(listUsersMock).toHaveBeenCalled()
    expect(fromMock).toHaveBeenCalledWith('profiles')
    expect(updateMock).toHaveBeenCalledWith({
      preferences: {
        communicationStyle: 'concise',
        onboarding_completed: false,
        workspace_setup_completed: false,
      },
    })
    await expect(response.json()).resolves.toEqual({
      ok: true,
      email: 'hi@torkay.com',
    })
  })

  it('rejects the endpoint outside development', async () => {
    vi.stubEnv('NODE_ENV', 'production')

    const { POST } = await import('./route')

    const response = await POST(
      new Request('http://localhost/api/auth/e2e/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'hi@torkay.com',
        }),
      }),
    )

    expect(response.status).toBe(404)
  })
})
