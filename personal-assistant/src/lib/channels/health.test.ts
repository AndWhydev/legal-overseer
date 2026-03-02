import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  checkAdapterHealth,
  checkAllChannelHealth,
  storeHealthReports,
  type ChannelHealthReport,
  type HealthStatus,
} from './health'
import type { ChannelAdapter } from './types'
import type { SupabaseClient } from '@supabase/supabase-js'

describe('health', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('checkAdapterHealth', () => {
    it('returns healthy status for available adapter', async () => {
      const mockAdapter: ChannelAdapter = {
        type: 'gmail',
        name: 'Gmail',
        description: 'Test',
        icon: 'Mail',
        pull: vi.fn(),
        isAvailable: vi.fn().mockResolvedValue(true),
      }

      const report = await checkAdapterHealth(mockAdapter)

      expect(report.channel).toBe('gmail')
      expect(report.status).toBe('healthy')
      expect(report.latencyMs).toBeGreaterThanOrEqual(0)
      expect(report.error).toBeUndefined()
      expect(report.checkedAt).toBeTruthy()
    })

    it('returns down status for unavailable adapter', async () => {
      const mockAdapter: ChannelAdapter = {
        type: 'outlook',
        name: 'Outlook',
        description: 'Test',
        icon: 'Mail',
        pull: vi.fn(),
        isAvailable: vi.fn().mockResolvedValue(false),
      }

      const report = await checkAdapterHealth(mockAdapter)

      expect(report.channel).toBe('outlook')
      expect(report.status).toBe('down')
      expect(report.error).toContain('not available')
    })

    it('returns degraded status for slow adapter (> 5s)', { timeout: 10000 }, async () => {
      const mockAdapter: ChannelAdapter = {
        type: 'asana',
        name: 'Asana',
        description: 'Test',
        icon: 'Check',
        pull: vi.fn(),
        isAvailable: vi.fn().mockImplementation(() => {
          return new Promise(resolve => setTimeout(() => resolve(true), 5100))
        }),
      }

      const report = await checkAdapterHealth(mockAdapter)

      expect(report.channel).toBe('asana')
      expect(report.status).toBe('degraded')
      expect(report.latencyMs).toBeGreaterThan(5000)
    })

    it('returns healthy status for fast adapter (< 5s)', async () => {
      const mockAdapter: ChannelAdapter = {
        type: 'calendly',
        name: 'Calendly',
        description: 'Test',
        icon: 'Clock',
        pull: vi.fn(),
        isAvailable: vi.fn().mockImplementation(() => {
          return new Promise(resolve => setTimeout(() => resolve(true), 100))
        }),
      }

      const report = await checkAdapterHealth(mockAdapter)

      expect(report.channel).toBe('calendly')
      expect(report.status).toBe('healthy')
      expect(report.latencyMs).toBeLessThan(5000)
    })

    it('handles timeout for slow adapters', { timeout: 15000 }, async () => {
      const mockAdapter: ChannelAdapter = {
        type: 'stripe',
        name: 'Stripe',
        description: 'Test',
        icon: 'Card',
        pull: vi.fn(),
        isAvailable: vi.fn().mockImplementation(() => {
          return new Promise(resolve => setTimeout(() => resolve(true), 15000))
        }),
      }

      const report = await checkAdapterHealth(mockAdapter)

      expect(report.channel).toBe('stripe')
      expect(report.status).toBe('down')
      expect(report.error).toContain('timed out')
      expect(report.latencyMs).toBeGreaterThanOrEqual(9000)
    })

    it('handles adapter errors gracefully', async () => {
      const mockAdapter: ChannelAdapter = {
        type: 'whatsapp',
        name: 'WhatsApp',
        description: 'Test',
        icon: 'Phone',
        pull: vi.fn(),
        isAvailable: vi.fn().mockRejectedValue(new Error('API error')),
      }

      const report = await checkAdapterHealth(mockAdapter)

      expect(report.channel).toBe('whatsapp')
      expect(report.status).toBe('down')
      expect(report.error).toContain('API error')
    })

    it('includes checkedAt timestamp in ISO format', async () => {
      const mockAdapter: ChannelAdapter = {
        type: 'gsc',
        name: 'Google Search Console',
        description: 'Test',
        icon: 'Search',
        pull: vi.fn(),
        isAvailable: vi.fn().mockResolvedValue(true),
      }

      const report = await checkAdapterHealth(mockAdapter)

      expect(report.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
      const date = new Date(report.checkedAt)
      expect(date.getTime()).toBeLessThanOrEqual(Date.now() + 1000) // Allow 1s margin
    })

    it('measures latency accurately', async () => {
      const mockAdapter: ChannelAdapter = {
        type: 'imessage',
        name: 'iMessage',
        description: 'Test',
        icon: 'Message',
        pull: vi.fn(),
        isAvailable: vi.fn().mockImplementation(() => {
          return new Promise(resolve => setTimeout(() => resolve(true), 250))
        }),
      }

      const report = await checkAdapterHealth(mockAdapter)

      expect(report.latencyMs).toBeGreaterThanOrEqual(250)
      expect(report.latencyMs).toBeLessThan(350)
    })
  })

  describe('checkAllChannelHealth', () => {
    it('checks health of multiple adapters in parallel', async () => {
      const adapters: ChannelAdapter[] = [
        {
          type: 'gmail',
          name: 'Gmail',
          description: 'Test',
          icon: 'Mail',
          pull: vi.fn(),
          isAvailable: vi.fn().mockResolvedValue(true),
        },
        {
          type: 'outlook',
          name: 'Outlook',
          description: 'Test',
          icon: 'Mail',
          pull: vi.fn(),
          isAvailable: vi.fn().mockResolvedValue(false),
        },
        {
          type: 'asana',
          name: 'Asana',
          description: 'Test',
          icon: 'Check',
          pull: vi.fn(),
          isAvailable: vi.fn().mockResolvedValue(true),
        },
      ]

      const reports = await checkAllChannelHealth(adapters)

      expect(reports).toHaveLength(3)
      expect(reports[0].channel).toBe('gmail')
      expect(reports[0].status).toBe('healthy')
      expect(reports[1].channel).toBe('outlook')
      expect(reports[1].status).toBe('down')
      expect(reports[2].channel).toBe('asana')
      expect(reports[2].status).toBe('healthy')
    })

    it('returns empty array for empty adapters', async () => {
      const reports = await checkAllChannelHealth([])
      expect(reports).toEqual([])
    })

    it('handles mixed healthy and failed adapters', async () => {
      const adapters: ChannelAdapter[] = [
        {
          type: 'gmail',
          name: 'Gmail',
          description: 'Test',
          icon: 'Mail',
          pull: vi.fn(),
          isAvailable: vi.fn().mockResolvedValue(true),
        },
        {
          type: 'calendly',
          name: 'Calendly',
          description: 'Test',
          icon: 'Clock',
          pull: vi.fn(),
          isAvailable: vi.fn().mockRejectedValue(new Error('Connection error')),
        },
      ]

      const reports = await checkAllChannelHealth(adapters)

      expect(reports).toHaveLength(2)
      expect(reports[0].status).toBe('healthy')
      expect(reports[1].status).toBe('down')
      expect(reports[1].error).toBeDefined()
    })
  })

  describe('storeHealthReports', () => {
    it('inserts health reports into Supabase', async () => {
      const mockUpsert = vi.fn().mockResolvedValue({ error: null })
      const mockFrom = vi.fn().mockReturnValue({
        upsert: mockUpsert,
      })

      const mockSupabase = {
        from: mockFrom,
      } as unknown as SupabaseClient

      const reports: ChannelHealthReport[] = [
        {
          channel: 'gmail',
          status: 'healthy',
          latencyMs: 150,
          checkedAt: new Date().toISOString(),
        },
        {
          channel: 'outlook',
          status: 'down',
          latencyMs: 500,
          checkedAt: new Date().toISOString(),
          error: 'Not available',
        },
      ]

      await storeHealthReports(mockSupabase, 'org-123', reports)

      expect(mockFrom).toHaveBeenCalledWith('channel_health')
      expect(mockUpsert).toHaveBeenCalledTimes(2)

      // Check first upsert call
      const firstCall = mockUpsert.mock.calls[0]
      expect(firstCall[0]).toEqual({
        org_id: 'org-123',
        channel_type: 'gmail',
        status: 'healthy',
        latency_ms: 150,
        checked_at: expect.any(String),
        error: null,
      })

      // Check second upsert call
      const secondCall = mockUpsert.mock.calls[1]
      expect(secondCall[0]).toEqual({
        org_id: 'org-123',
        channel_type: 'outlook',
        status: 'down',
        latency_ms: 500,
        checked_at: expect.any(String),
        error: 'Not available',
      })
    })

    it('sets error to null for healthy adapters', async () => {
      const mockUpsert = vi.fn().mockResolvedValue({ error: null })
      const mockSupabase = {
        from: vi.fn().mockReturnValue({ upsert: mockUpsert }),
      } as unknown as SupabaseClient

      const reports: ChannelHealthReport[] = [
        {
          channel: 'gmail',
          status: 'healthy',
          latencyMs: 100,
          checkedAt: new Date().toISOString(),
        },
      ]

      await storeHealthReports(mockSupabase, 'org-123', reports)

      const call = mockUpsert.mock.calls[0][0]
      expect(call.error).toBeNull()
    })

    it('includes error message for failed adapters', async () => {
      const mockUpsert = vi.fn().mockResolvedValue({ error: null })
      const mockSupabase = {
        from: vi.fn().mockReturnValue({ upsert: mockUpsert }),
      } as unknown as SupabaseClient

      const reports: ChannelHealthReport[] = [
        {
          channel: 'outlook',
          status: 'down',
          latencyMs: 500,
          checkedAt: new Date().toISOString(),
          error: 'API credentials missing',
        },
      ]

      await storeHealthReports(mockSupabase, 'org-123', reports)

      const call = mockUpsert.mock.calls[0][0]
      expect(call.error).toBe('API credentials missing')
    })

    it('uses correct onConflict strategy', async () => {
      const mockUpsert = vi.fn().mockResolvedValue({ error: null })
      const mockSupabase = {
        from: vi.fn().mockReturnValue({ upsert: mockUpsert }),
      } as unknown as SupabaseClient

      const reports: ChannelHealthReport[] = [
        {
          channel: 'gmail',
          status: 'healthy',
          latencyMs: 150,
          checkedAt: new Date().toISOString(),
        },
      ]

      await storeHealthReports(mockSupabase, 'org-123', reports)

      const options = mockUpsert.mock.calls[0][1]
      expect(options).toEqual({ onConflict: 'org_id,channel_type' })
    })

    it('handles multiple orgs separately', async () => {
      const mockUpsert = vi.fn().mockResolvedValue({ error: null })
      const mockSupabase = {
        from: vi.fn().mockReturnValue({ upsert: mockUpsert }),
      } as unknown as SupabaseClient

      const reports: ChannelHealthReport[] = [
        {
          channel: 'gmail',
          status: 'healthy',
          latencyMs: 150,
          checkedAt: new Date().toISOString(),
        },
      ]

      await storeHealthReports(mockSupabase, 'org-123', reports)
      await storeHealthReports(mockSupabase, 'org-456', reports)

      expect(mockUpsert).toHaveBeenCalledTimes(2)
      const firstOrgCall = mockUpsert.mock.calls[0][0]
      const secondOrgCall = mockUpsert.mock.calls[1][0]

      expect(firstOrgCall.org_id).toBe('org-123')
      expect(secondOrgCall.org_id).toBe('org-456')
    })

    it('handles empty reports list', async () => {
      const mockUpsert = vi.fn().mockResolvedValue({ error: null })
      const mockSupabase = {
        from: vi.fn().mockReturnValue({ upsert: mockUpsert }),
      } as unknown as SupabaseClient

      await storeHealthReports(mockSupabase, 'org-123', [])

      expect(mockUpsert).not.toHaveBeenCalled()
    })
  })

  describe('health status determination', () => {
    it('marks adapter as degraded when latency exceeds 5000ms', { timeout: 10000 }, async () => {
      const mockAdapter: ChannelAdapter = {
        type: 'gmail',
        name: 'Gmail',
        description: 'Test',
        icon: 'Mail',
        pull: vi.fn(),
        isAvailable: vi.fn().mockImplementation(() => {
          return new Promise(resolve => setTimeout(() => resolve(true), 5050))
        }),
      }

      const report = await checkAdapterHealth(mockAdapter)

      // > 5000 should be degraded
      expect(report.status).toBe('degraded')
      expect(report.latencyMs).toBeGreaterThan(5000)
    })

    it('marks adapter as healthy when latency is just under 5000ms', { timeout: 10000 }, async () => {
      const mockAdapter: ChannelAdapter = {
        type: 'gmail',
        name: 'Gmail',
        description: 'Test',
        icon: 'Mail',
        pull: vi.fn(),
        isAvailable: vi.fn().mockImplementation(() => {
          return new Promise(resolve => setTimeout(() => resolve(true), 4999))
        }),
      }

      const report = await checkAdapterHealth(mockAdapter)

      expect(report.status).toBe('healthy')
    })
  })
})
