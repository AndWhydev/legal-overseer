import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createClientMock, getActiveOrgIdMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  getActiveOrgIdMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }))
vi.mock('@/lib/tenancy', () => ({ getActiveOrgId: getActiveOrgIdMock }))
vi.mock('@/lib/core/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

function buildSupabase(existing: { id: string; status: string } | null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: existing, error: null })
  const update = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ data: null, error: null }),
  })
  const insertSingle = vi.fn().mockResolvedValue({
    data: { id: 'conn-new-1' },
    error: null,
  })
  const insert = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({ single: insertSingle }),
  })

  const from = vi.fn().mockImplementation(() => ({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ maybeSingle }),
      }),
    }),
    update,
    insert,
  }))

  return {
    supabase: {
      from,
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-1', email: 'u@x.com' } },
        }),
      },
    },
    insert,
    update,
  }
}

describe('POST /api/bridges/telegram/pair', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.TELEGRAM_BOT_USERNAME = 'bitbit_test_bot'
    getActiveOrgIdMock.mockResolvedValue('org-abc')
  })

  it('returns 503 when TELEGRAM_BOT_USERNAME is unset', async () => {
    delete process.env.TELEGRAM_BOT_USERNAME
    const { supabase } = buildSupabase(null)
    createClientMock.mockResolvedValue(supabase)

    const mod = await import('./route')
    const res = await mod.POST()

    expect(res.status).toBe(503)
  })

  it('returns 401 when no user session', async () => {
    const { supabase } = buildSupabase(null)
    supabase.auth.getUser = vi.fn().mockResolvedValue({ data: { user: null } })
    createClientMock.mockResolvedValue(supabase)

    const mod = await import('./route')
    const res = await mod.POST()

    expect(res.status).toBe(401)
  })

  it('mints a new connection when none exists and returns bot deep-link', async () => {
    const { supabase, insert } = buildSupabase(null)
    createClientMock.mockResolvedValue(supabase)

    const mod = await import('./route')
    const res = await mod.POST()

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.connection_id).toBe('conn-new-1')
    expect(body.code).toMatch(/^[A-Z0-9]{1,10}$/)
    expect(body.bot_url).toBe(`https://t.me/bitbit_test_bot?start=${body.code}`)
    expect(insert).toHaveBeenCalledOnce()
  })

  it('refreshes an existing provisioning row instead of creating a duplicate', async () => {
    const { supabase, insert, update } = buildSupabase({ id: 'conn-existing', status: 'provisioning' })
    createClientMock.mockResolvedValue(supabase)

    const mod = await import('./route')
    const res = await mod.POST()

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.connection_id).toBe('conn-existing')
    expect(update).toHaveBeenCalled()
    expect(insert).not.toHaveBeenCalled()
  })

  it('returns 409 when telegram is already connected', async () => {
    const { supabase } = buildSupabase({ id: 'conn-live', status: 'connected' })
    createClientMock.mockResolvedValue(supabase)

    const mod = await import('./route')
    const res = await mod.POST()

    expect(res.status).toBe(409)
  })
})
