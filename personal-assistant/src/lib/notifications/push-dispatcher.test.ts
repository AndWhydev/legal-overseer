import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Mock Supabase with explicit chainable query builder
let mockQueryResult: { data: unknown; error: unknown } = { data: null, error: null }

const mockChain = {
  select: vi.fn(),
  eq: vi.fn(),
  delete: vi.fn(),
  in: vi.fn(),
}

// Chain returns itself, terminal methods return the query result
mockChain.select.mockImplementation(() => mockChain)
mockChain.eq.mockImplementation(() => Promise.resolve(mockQueryResult))
mockChain.delete.mockImplementation(() => mockChain)
mockChain.in.mockImplementation(() => Promise.resolve({ error: null }))

const mockFrom = vi.fn(() => mockChain)

const mockSupabase = { from: mockFrom }

vi.mock('@/lib/supabase/service-client', () => ({
  getServiceClient: () => mockSupabase,
}))

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import {
  sendPushNotification,
  sendPushToUser,
  cleanupInvalidTokens,
} from './push-dispatcher'

describe('push-dispatcher', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQueryResult = { data: null, error: null }

    // Reset chain implementations
    mockChain.select.mockImplementation(() => mockChain)
    mockChain.eq.mockImplementation(() => Promise.resolve(mockQueryResult))
    mockChain.delete.mockImplementation(() => mockChain)
    mockChain.in.mockImplementation(() => Promise.resolve({ error: null }))
    mockFrom.mockImplementation(() => mockChain)
  })

  // -------------------------------------------------------------------------
  // Test 1: sendPushNotification sends correctly formatted payload
  // -------------------------------------------------------------------------
  describe('sendPushNotification', () => {
    it('sends correctly formatted payload to Expo Push API', async () => {
      const tokens = ['ExponentPushToken[abc123]', 'ExponentPushToken[def456]']
      const notification = {
        title: 'Approval Needed',
        body: 'New approval requires your attention',
        data: { type: 'approval', id: 'abc' },
        badge: 1,
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            { status: 'ok', id: 'receipt-1' },
            { status: 'ok', id: 'receipt-2' },
          ],
        }),
      })

      const result = await sendPushNotification(tokens, notification)

      expect(result.success).toBe(true)
      expect(result.sent).toBe(2)
      expect(mockFetch).toHaveBeenCalledOnce()

      const [url, options] = mockFetch.mock.calls[0]
      expect(url).toBe('https://exp.host/--/api/v2/push/send')
      expect(options.method).toBe('POST')
      expect(options.headers['Content-Type']).toBe('application/json')

      const body = JSON.parse(options.body)
      expect(body).toHaveLength(2)
      expect(body[0]).toEqual({
        to: 'ExponentPushToken[abc123]',
        title: 'Approval Needed',
        body: 'New approval requires your attention',
        data: { type: 'approval', id: 'abc' },
        badge: 1,
        sound: 'default',
      })
    })

    it('collects DeviceNotRegistered tokens as invalidTokens', async () => {
      const tokens = ['ExponentPushToken[valid]', 'ExponentPushToken[expired]']
      const notification = { title: 'Test', body: 'Test body' }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            { status: 'ok', id: 'receipt-1' },
            {
              status: 'error',
              message: 'DeviceNotRegistered',
              details: { error: 'DeviceNotRegistered' },
            },
          ],
        }),
      })

      const result = await sendPushNotification(tokens, notification)

      expect(result.success).toBe(true)
      expect(result.invalidTokens).toContain('ExponentPushToken[expired]')
      expect(result.invalidTokens).toHaveLength(1)
      expect(result.sent).toBe(1)
    })
  })

  // -------------------------------------------------------------------------
  // Test 2: sendPushToUser looks up tokens and dispatches
  // -------------------------------------------------------------------------
  describe('sendPushToUser', () => {
    it('looks up tokens from push_tokens table and dispatches to all devices', async () => {
      const userId = 'user-123'
      const notification = { title: 'Hello', body: 'World' }

      // Mock: token lookup returns 2 devices
      mockQueryResult = {
        data: [
          { token: 'ExponentPushToken[device1]', platform: 'ios' },
          { token: 'ExponentPushToken[device2]', platform: 'android' },
        ],
        error: null,
      }

      // Mock Expo Push API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            { status: 'ok', id: 'receipt-1' },
            { status: 'ok', id: 'receipt-2' },
          ],
        }),
      })

      const result = await sendPushToUser(userId, notification)

      expect(result.success).toBe(true)
      expect(result.sent).toBe(2)
      expect(mockFrom).toHaveBeenCalledWith('push_tokens')
      expect(mockChain.select).toHaveBeenCalledWith('token, platform')
      expect(mockChain.eq).toHaveBeenCalledWith('user_id', userId)
      expect(mockFetch).toHaveBeenCalledOnce()

      const [, options] = mockFetch.mock.calls[0]
      const body = JSON.parse(options.body)
      expect(body).toHaveLength(2)
    })

    // -----------------------------------------------------------------------
    // Test 3: no registered tokens returns gracefully
    // -----------------------------------------------------------------------
    it('returns gracefully when user has no registered tokens', async () => {
      mockQueryResult = { data: [], error: null }

      const result = await sendPushToUser('user-no-tokens', { title: 'T', body: 'B' })

      expect(result.success).toBe(true)
      expect(result.sent).toBe(0)
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('handles DB error gracefully', async () => {
      mockQueryResult = { data: null, error: { message: 'Connection error' } }

      const result = await sendPushToUser('user-err', { title: 'T', body: 'B' })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Connection error')
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // Test 4: Batch notifications -- single API call for multiple tokens
  // -------------------------------------------------------------------------
  describe('batch sending', () => {
    it('sends multiple tokens in single Expo API call', async () => {
      const tokens = Array.from({ length: 5 }, (_, i) => `ExponentPushToken[tok${i}]`)
      const notification = { title: 'Batch', body: 'Batch body' }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: tokens.map((_, i) => ({ status: 'ok', id: `receipt-${i}` })),
        }),
      })

      await sendPushNotification(tokens, notification)

      // Should be exactly 1 API call
      expect(mockFetch).toHaveBeenCalledOnce()

      const [, options] = mockFetch.mock.calls[0]
      const body = JSON.parse(options.body)
      expect(body).toHaveLength(5)
    })
  })

  // -------------------------------------------------------------------------
  // Test 5: cleanupInvalidTokens
  // -------------------------------------------------------------------------
  describe('cleanupInvalidTokens', () => {
    it('calls delete on push_tokens table for invalid tokens', async () => {
      await cleanupInvalidTokens(['ExponentPushToken[dead1]', 'ExponentPushToken[dead2]'])

      expect(mockFrom).toHaveBeenCalledWith('push_tokens')
      expect(mockChain.delete).toHaveBeenCalled()
      expect(mockChain.in).toHaveBeenCalledWith('token', ['ExponentPushToken[dead1]', 'ExponentPushToken[dead2]'])
    })

    it('does nothing for empty token list', async () => {
      await cleanupInvalidTokens([])

      expect(mockFrom).not.toHaveBeenCalled()
    })
  })
})
