import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  createClientMock,
  getActiveOrgIdMock,
  isBaileysAvailableMock,
  getActiveBridgeMock,
} = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  getActiveOrgIdMock: vi.fn(),
  isBaileysAvailableMock: vi.fn(),
  getActiveBridgeMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}))

vi.mock('@/lib/tenancy', () => ({
  getActiveOrgId: getActiveOrgIdMock,
}))

vi.mock('@/lib/channels/baileys-bridge', () => ({
  createBridge: vi.fn(),
  getActiveBridge: getActiveBridgeMock,
  isBaileysAvailable: isBaileysAvailableMock,
}))

vi.mock('@/lib/core/logger', () => ({
  logger: {
    error: vi.fn(),
  },
}))

describe('/api/channels/whatsapp/bridge GET', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    getActiveOrgIdMock.mockResolvedValue('org-123')
    isBaileysAvailableMock.mockResolvedValue(true)
    getActiveBridgeMock.mockReturnValue(null)

    const singleMock = vi.fn().mockResolvedValue({
      data: {
        id: 'session-123',
        status: 'pairing',
        qr_data: 'data:image/png;base64,qr',
        created_at: '2026-03-08T00:00:00.000Z',
      },
    })

    const limitMock = vi.fn(() => ({ single: singleMock }))
    const orderMock = vi.fn(() => ({ limit: limitMock }))
    const eqMock = vi.fn(() => ({ order: orderMock }))
    const selectMock = vi.fn(() => ({ eq: eqMock }))

    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-123' } },
        }),
      },
      from: vi.fn(() => ({ select: selectMock })),
    })
  })

  it('returns the QR code from the qr_data column used by the database schema', async () => {
    const { GET } = await import('./route')

    const response = await GET()
    const payload = await response.json()

    expect(payload.qrCode).toBe('data:image/png;base64,qr')
  })
})
