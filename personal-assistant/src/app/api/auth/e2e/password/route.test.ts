import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { getServiceClientMock } = vi.hoisted(() => ({
  getServiceClientMock: vi.fn(),
}))

vi.mock('@/lib/supabase/service-client', () => ({
  getServiceClient: getServiceClientMock,
}))

describe('/api/auth/e2e/password POST', () => {
  const originalNodeEnv = process.env.NODE_ENV

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NODE_ENV = 'development'
  })

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv
  })

  it('resets the password for an existing registered user in development', async () => {
    const listUsersMock = vi.fn().mockResolvedValue({
      data: {
        users: [{ id: 'user-123', email: 'hi@torkay.com' }],
      },
      error: null,
    })
    const updateUserByIdMock = vi.fn().mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    })

    getServiceClientMock.mockReturnValue({
      auth: {
        admin: {
          listUsers: listUsersMock,
          updateUserById: updateUserByIdMock,
        },
      },
    })

    const { POST } = await import('./route')

    const response = await POST(
      new Request('http://localhost/api/auth/e2e/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'hi@torkay.com',
          password: 'BitBit-E2E-Reset-01',
        }),
      }),
    )

    expect(response.status).toBe(200)
    expect(listUsersMock).toHaveBeenCalled()
    expect(updateUserByIdMock).toHaveBeenCalledWith('user-123', {
      password: 'BitBit-E2E-Reset-01',
    })
    await expect(response.json()).resolves.toEqual({
      ok: true,
      email: 'hi@torkay.com',
    })
  })

  it('rejects the endpoint outside development', async () => {
    process.env.NODE_ENV = 'production'

    const { POST } = await import('./route')

    const response = await POST(
      new Request('http://localhost/api/auth/e2e/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'hi@torkay.com',
          password: 'BitBit-E2E-Reset-01',
        }),
      }),
    )

    expect(response.status).toBe(404)
  })
})
