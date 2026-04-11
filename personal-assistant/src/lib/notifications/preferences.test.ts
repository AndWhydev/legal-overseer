import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  type NotificationPreferences,
} from './preferences'
import type { SupabaseClient } from '@supabase/supabase-js'

describe('preferences', () => {
  let mockSupabase: SupabaseClient
  let mockSelect: any
  let mockUpdate: any
  let mockEq: any

  beforeEach(() => {
    vi.clearAllMocks()

    // Setup mock chain for SELECT
    mockEq = vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: null,
        error: null,
      }),
    })

    mockSelect = vi.fn().mockReturnValue({
      eq: mockEq,
    })

    // Setup mock for UPDATE
    mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    })

    mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: mockSelect,
        update: mockUpdate,
      }),
    } as unknown as SupabaseClient
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('getNotificationPreferences', () => {
    it('returns default preferences when user not found', async () => {
      const prefs = await getNotificationPreferences(mockSupabase, 'user-1')

      expect(prefs).toEqual({
        email: true,
        whatsapp: true,
        dashboard: true,
        digest_frequency: 'daily',
      })
    })

    it('returns stored preferences when found', async () => {
      const storedPrefs: NotificationPreferences = {
        email: false,
        whatsapp: true,
        dashboard: true,
        digest_frequency: 'weekly',
      }

      mockEq.mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: {
            notification_preferences: storedPrefs,
          },
          error: null,
        }),
      })

      const prefs = await getNotificationPreferences(mockSupabase, 'user-1')

      expect(prefs).toEqual(storedPrefs)
    })

    it('merges stored preferences with defaults', async () => {
      const partialPrefs = {
        email: false,
        // whatsapp not set
        // dashboard not set
        digest_frequency: 'never' as const,
      }

      mockEq.mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: {
            notification_preferences: partialPrefs,
          },
          error: null,
        }),
      })

      const prefs = await getNotificationPreferences(mockSupabase, 'user-1')

      expect(prefs.email).toBe(false)
      expect(prefs.whatsapp).toBe(true) // Default
      expect(prefs.dashboard).toBe(true) // Default
      expect(prefs.digest_frequency).toBe('never')
    })

    it('queries the correct table and user', async () => {
      await getNotificationPreferences(mockSupabase, 'user-123')

      expect(mockSupabase.from).toHaveBeenCalledWith('profiles')
      expect(mockSelect).toHaveBeenCalledWith('notification_preferences')
      expect(mockEq).toHaveBeenCalledWith('id', 'user-123')
    })

    it('handles database errors gracefully', async () => {
      mockEq.mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Database error' },
        }),
      })

      const prefs = await getNotificationPreferences(mockSupabase, 'user-1')

      // Should return defaults on error
      expect(prefs).toEqual({
        email: true,
        whatsapp: true,
        dashboard: true,
        digest_frequency: 'daily',
      })
    })

    it('handles null notification_preferences', async () => {
      mockEq.mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: {
            notification_preferences: null,
          },
          error: null,
        }),
      })

      const prefs = await getNotificationPreferences(mockSupabase, 'user-1')

      expect(prefs).toEqual({
        email: true,
        whatsapp: true,
        dashboard: true,
        digest_frequency: 'daily',
      })
    })

    it('handles missing data object', async () => {
      mockEq.mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      })

      const prefs = await getNotificationPreferences(mockSupabase, 'user-1')

      expect(prefs).toEqual({
        email: true,
        whatsapp: true,
        dashboard: true,
        digest_frequency: 'daily',
      })
    })
  })

  describe('updateNotificationPreferences', () => {
    it('updates all preferences', async () => {
      const updateEq = vi.fn().mockResolvedValue({ error: null })
      mockUpdate.mockReturnValue({
        eq: updateEq,
      })

      const newPrefs: NotificationPreferences = {
        email: false,
        whatsapp: false,
        dashboard: true,
        digest_frequency: 'weekly',
      }

      const result = await updateNotificationPreferences(mockSupabase, 'user-1', newPrefs)

      expect(result).toEqual(newPrefs)
      expect(updateEq).toHaveBeenCalledWith('id', 'user-1')
    })

    it('merges partial updates with existing preferences', async () => {
      const existingPrefs: NotificationPreferences = {
        email: true,
        whatsapp: true,
        dashboard: true,
        digest_frequency: 'daily',
      }

      mockEq.mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: {
            notification_preferences: existingPrefs,
          },
          error: null,
        }),
      })

      const updateEq = vi.fn().mockResolvedValue({ error: null })
      mockUpdate.mockReturnValue({
        eq: updateEq,
      })

      const partialUpdate = {
        email: false,
        digest_frequency: 'never' as const,
      }

      const result = await updateNotificationPreferences(mockSupabase, 'user-1', partialUpdate)

      expect(result).toEqual({
        email: false,
        whatsapp: true,
        dashboard: true,
        digest_frequency: 'never',
      })
    })

    it('sends correct update payload', async () => {
      const updateEq = vi.fn().mockResolvedValue({ error: null })
      mockUpdate.mockReturnValue({
        eq: updateEq,
      })

      const updates: Partial<NotificationPreferences> = {
        email: false,
        whatsapp: true,
      }

      await updateNotificationPreferences(mockSupabase, 'user-1', updates)

      const updateCall = mockUpdate.mock.calls[0]
      expect(updateCall[0]).toEqual({
        notification_preferences: expect.objectContaining({
          email: false,
          whatsapp: true,
        }),
      })
    })

    it('throws error on update failure', async () => {
      const updateEq = vi.fn().mockResolvedValue({
        error: { message: 'Update failed' },
      })
      mockUpdate.mockReturnValue({
        eq: updateEq,
      })

      const updates: Partial<NotificationPreferences> = {
        email: false,
      }

      await expect(
        updateNotificationPreferences(mockSupabase, 'user-1', updates)
      ).rejects.toThrow('Failed to update notification preferences')
    })

    it('throws error with descriptive message', async () => {
      const updateEq = vi.fn().mockResolvedValue({
        error: { message: 'Unique constraint violation' },
      })
      mockUpdate.mockReturnValue({
        eq: updateEq,
      })

      const updates: Partial<NotificationPreferences> = {
        whatsapp: false,
      }

      await expect(
        updateNotificationPreferences(mockSupabase, 'user-1', updates)
      ).rejects.toThrow('Unique constraint violation')
    })

    it('fetches current preferences before updating', async () => {
      const updateEq = vi.fn().mockResolvedValue({ error: null })
      mockUpdate.mockReturnValue({
        eq: updateEq,
      })

      mockEq.mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: {
            notification_preferences: {
              email: true,
              whatsapp: true,
              dashboard: true,
              digest_frequency: 'daily',
            },
          },
          error: null,
        }),
      })

      await updateNotificationPreferences(mockSupabase, 'user-1', {
        email: false,
      })

      // Should have called select to get current prefs
      expect(mockSelect).toHaveBeenCalled()
    })

    it('handles network errors', async () => {
      const updateEq = vi.fn().mockRejectedValue(new Error('Network error'))
      mockUpdate.mockReturnValue({
        eq: updateEq,
      })

      const updates: Partial<NotificationPreferences> = {
        email: false,
      }

      await expect(
        updateNotificationPreferences(mockSupabase, 'user-1', updates)
      ).rejects.toThrow()
    })

    it('updates single preference', async () => {
      const updateEq = vi.fn().mockResolvedValue({ error: null })
      mockUpdate.mockReturnValue({
        eq: updateEq,
      })

      const result = await updateNotificationPreferences(mockSupabase, 'user-1', {
        email: false,
      })

      expect(result.email).toBe(false)
      expect(result.whatsapp).toBe(true)
      expect(result.dashboard).toBe(true)
    })

    it('updates digest frequency only', async () => {
      const updateEq = vi.fn().mockResolvedValue({ error: null })
      mockUpdate.mockReturnValue({
        eq: updateEq,
      })

      const result = await updateNotificationPreferences(mockSupabase, 'user-1', {
        digest_frequency: 'weekly',
      })

      expect(result.digest_frequency).toBe('weekly')
      expect(result.email).toBe(true)
      expect(result.whatsapp).toBe(true)
    })

    it('disables all channels', async () => {
      const updateEq = vi.fn().mockResolvedValue({ error: null })
      mockUpdate.mockReturnValue({
        eq: updateEq,
      })

      const result = await updateNotificationPreferences(mockSupabase, 'user-1', {
        email: false,
        whatsapp: false,
        dashboard: false,
      })

      expect(result.email).toBe(false)
      expect(result.whatsapp).toBe(false)
      expect(result.dashboard).toBe(false)
    })

    it('enables all channels', async () => {
      const updateEq = vi.fn().mockResolvedValue({ error: null })
      mockUpdate.mockReturnValue({
        eq: updateEq,
      })

      mockEq.mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: {
            notification_preferences: {
              email: false,
              whatsapp: false,
              dashboard: false,
              digest_frequency: 'never',
            },
          },
          error: null,
        }),
      })

      const result = await updateNotificationPreferences(mockSupabase, 'user-1', {
        email: true,
        whatsapp: true,
        dashboard: true,
        digest_frequency: 'daily',
      })

      expect(result.email).toBe(true)
      expect(result.whatsapp).toBe(true)
      expect(result.dashboard).toBe(true)
    })

    it('respects digest frequency options', async () => {
      const updateEq = vi.fn().mockResolvedValue({ error: null })
      mockUpdate.mockReturnValue({
        eq: updateEq,
      })

      const frequencies: Array<'daily' | 'weekly' | 'never'> = ['daily', 'weekly', 'never']

      for (const freq of frequencies) {
        mockEq.mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              notification_preferences: {
                email: true,
                whatsapp: true,
                dashboard: true,
                digest_frequency: 'daily',
              },
            },
            error: null,
          }),
        })

        const result = await updateNotificationPreferences(mockSupabase, 'user-1', {
          digest_frequency: freq,
        })

        expect(result.digest_frequency).toBe(freq)
      }
    })
  })

  describe('preference types', () => {
    it('validates email preference is boolean', async () => {
      const prefs = await getNotificationPreferences(mockSupabase, 'user-1')
      expect(typeof prefs.email).toBe('boolean')
    })

    it('validates whatsapp preference is boolean', async () => {
      const prefs = await getNotificationPreferences(mockSupabase, 'user-1')
      expect(typeof prefs.whatsapp).toBe('boolean')
    })

    it('validates dashboard preference is boolean', async () => {
      const prefs = await getNotificationPreferences(mockSupabase, 'user-1')
      expect(typeof prefs.dashboard).toBe('boolean')
    })

    it('validates digest_frequency is valid option', async () => {
      const prefs = await getNotificationPreferences(mockSupabase, 'user-1')
      expect(['daily', 'weekly', 'never']).toContain(prefs.digest_frequency)
    })
  })

  describe('default preferences constant', () => {
    it('has all required fields', async () => {
      const prefs = await getNotificationPreferences(mockSupabase, 'user-not-found')

      expect(prefs).toHaveProperty('email')
      expect(prefs).toHaveProperty('whatsapp')
      expect(prefs).toHaveProperty('dashboard')
      expect(prefs).toHaveProperty('digest_frequency')
    })

    it('defaults are sensible', async () => {
      const prefs = await getNotificationPreferences(mockSupabase, 'user-not-found')

      // All notifications enabled by default
      expect(prefs.email).toBe(true)
      expect(prefs.whatsapp).toBe(true)
      expect(prefs.dashboard).toBe(true)
      // Daily digests by default
      expect(prefs.digest_frequency).toBe('daily')
    })
  })

  describe('edge cases', () => {
    it('handles user ID with special characters', async () => {
      mockEq.mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      })

      const prefs = await getNotificationPreferences(mockSupabase, 'user-id-with-special-chars_123')

      expect(prefs).toEqual({
        email: true,
        whatsapp: true,
        dashboard: true,
        digest_frequency: 'daily',
      })
    })

    it('handles very long user ID', async () => {
      const longUserId = 'a'.repeat(256)
      mockEq.mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      })

      const prefs = await getNotificationPreferences(mockSupabase, longUserId)

      expect(prefs).toBeDefined()
    })

    it('handles concurrent updates', async () => {
      const updateEq = vi.fn().mockResolvedValue({ error: null })
      mockUpdate.mockReturnValue({
        eq: updateEq,
      })

      const updates = [
        { email: false },
        { whatsapp: false },
        { dashboard: false },
      ]

      const results = await Promise.all(
        updates.map(update => updateNotificationPreferences(mockSupabase, 'user-1', update))
      )

      expect(results).toHaveLength(3)
      results.forEach(result => {
        expect(result).toHaveProperty('email')
        expect(result).toHaveProperty('whatsapp')
      })
    })
  })
})
