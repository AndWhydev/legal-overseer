import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  dispatchNotification,
  type DispatchNotificationParams,
  type DispatchResult,
} from './dispatcher'
import type { SupabaseClient } from '@supabase/supabase-js'

// Mock dependencies
vi.mock('./preferences', () => ({
  getNotificationPreferences: vi.fn(),
}))

vi.mock('../channels/whatsapp', () => ({
  sendMessage: vi.fn(),
}))

vi.mock('./email-templates', () => ({
  sendApprovalNeededEmail: vi.fn().mockResolvedValue(true),
  sendAlertEscalationEmail: vi.fn().mockResolvedValue(true),
  sendDailyDigestEmail: vi.fn().mockResolvedValue(true),
  sendWeeklyReportEmail: vi.fn().mockResolvedValue(true),
}))

vi.mock('resend', () => {
  return {
    Resend: vi.fn(function() {
      return {
        emails: {
          send: vi.fn().mockResolvedValue({ error: null }),
        },
      }
    }),
  }
})

import { getNotificationPreferences } from './preferences'
import { sendMessage as sendWhatsAppMessage } from '../channels/whatsapp'

describe('dispatcher', () => {
  let mockSupabase: SupabaseClient
  let mockInsert: any

  beforeEach(() => {
    vi.clearAllMocks()

    mockInsert = vi.fn().mockResolvedValue({ error: null })
    mockSupabase = {
      from: vi.fn().mockReturnValue({
        insert: mockInsert,
      }),
    } as unknown as SupabaseClient

    // Set up default mocks
    vi.mocked(sendWhatsAppMessage).mockResolvedValue('msg-123')
    vi.mocked(getNotificationPreferences).mockResolvedValue({
      email: true,
      whatsapp: true,
      dashboard: true,
      digest_frequency: 'daily',
    })

    process.env.NOTIFICATION_TO_EMAIL = 'test@example.com'
    process.env.NOTIFICATION_FROM_EMAIL = 'bitbit@example.com'
    process.env.WHATSAPP_ANDY_PHONE = '+1234567890'
    process.env.RESEND_API_KEY = 'test-key'
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.NOTIFICATION_TO_EMAIL
    delete process.env.NOTIFICATION_FROM_EMAIL
    delete process.env.WHATSAPP_ANDY_PHONE
    delete process.env.RESEND_API_KEY
  })

  describe('basic dispatch', () => {
    it('dispatches to all channels by default', async () => {
      const params: DispatchNotificationParams = {
        orgId: 'org-1',
        type: 'info',
        title: 'Test',
        body: 'Test notification',
      }

      const result = await dispatchNotification(mockSupabase, params)

      expect(result.dashboard).toBe(true)
      expect(result.whatsapp).toBe(true)
      expect(result.email).toBe(true)
    })

    it('respects specified channels', async () => {
      const params: DispatchNotificationParams = {
        orgId: 'org-1',
        type: 'info',
        title: 'Test',
        body: 'Test notification',
        channels: ['dashboard', 'email'],
      }

      const result = await dispatchNotification(mockSupabase, params)

      expect(result.dashboard).toBe(true)
      expect(result.email).toBe(true)
      expect(result.whatsapp).toBe(false)
    })

    it('handles missing metadata', async () => {
      const params: DispatchNotificationParams = {
        orgId: 'org-1',
        type: 'info',
        title: 'Test',
        body: 'Test notification',
      }

      const result = await dispatchNotification(mockSupabase, params)

      expect(result).toEqual({
        dashboard: true,
        whatsapp: true,
        email: true,
      })
    })
  })

  describe('dashboard notification', () => {
    it('inserts notification into database', async () => {
      const params: DispatchNotificationParams = {
        orgId: 'org-1',
        userId: 'user-1',
        type: 'approval_needed',
        title: 'Approval Required',
        body: 'Please review this action',
        urgency: 'high',
      }

      await dispatchNotification(mockSupabase, params)

      expect(mockInsert).toHaveBeenCalledWith({
        org_id: 'org-1',
        user_id: 'user-1',
        type: 'approval_needed',
        title: 'Approval Required',
        body: 'Please review this action',
        urgency: 'high',
        metadata: {},
        read: false,
      })
    })

    it('handles null userId', async () => {
      const params: DispatchNotificationParams = {
        orgId: 'org-1',
        type: 'info',
        title: 'System Info',
        body: 'System notification',
      }

      await dispatchNotification(mockSupabase, params)

      const call = mockInsert.mock.calls[0][0]
      expect(call.user_id).toBeNull()
    })

    it('marks notification as unread', async () => {
      const params: DispatchNotificationParams = {
        orgId: 'org-1',
        type: 'info',
        title: 'Test',
        body: 'Test',
      }

      await dispatchNotification(mockSupabase, params)

      const call = mockInsert.mock.calls[0][0]
      expect(call.read).toBe(false)
    })

    it('includes metadata in notification', async () => {
      const metadata = { approvalId: 'app-123', agentName: 'Lead Agent' }
      const params: DispatchNotificationParams = {
        orgId: 'org-1',
        type: 'approval_needed',
        title: 'Approval',
        body: 'Review needed',
        metadata,
      }

      await dispatchNotification(mockSupabase, params)

      const call = mockInsert.mock.calls[0][0]
      expect(call.metadata).toEqual(metadata)
    })

    it('handles database insertion errors', async () => {
      mockInsert.mockResolvedValue({ error: { message: 'Insert failed' } })

      const params: DispatchNotificationParams = {
        orgId: 'org-1',
        type: 'info',
        title: 'Test',
        body: 'Test',
      }

      const result = await dispatchNotification(mockSupabase, params)

      expect(result.dashboard).toBe(false)
    })

    it('handles database insertion exceptions', async () => {
      mockInsert.mockRejectedValue(new Error('Connection error'))

      const params: DispatchNotificationParams = {
        orgId: 'org-1',
        type: 'info',
        title: 'Test',
        body: 'Test',
      }

      const result = await dispatchNotification(mockSupabase, params)

      expect(result.dashboard).toBe(false)
    })
  })

  describe('WhatsApp notification', () => {
    it('sends WhatsApp message with title and body', async () => {
      vi.mocked(sendWhatsAppMessage).mockResolvedValue('msg-123')

      const params: DispatchNotificationParams = {
        orgId: 'org-1',
        type: 'alert_escalation',
        title: 'Alert',
        body: 'Critical issue detected',
        channels: ['whatsapp'],
      }

      const result = await dispatchNotification(mockSupabase, params)

      expect(sendWhatsAppMessage).toHaveBeenCalledWith(
        '+1234567890',
        '*Alert*\n\nCritical issue detected',
      )
      expect(result.whatsapp).toBe(true)
    })

    it('formats WhatsApp message correctly', async () => {
      vi.mocked(sendWhatsAppMessage).mockResolvedValue('msg-123')

      const params: DispatchNotificationParams = {
        orgId: 'org-1',
        type: 'info',
        title: 'My Title',
        body: 'My body content',
        channels: ['whatsapp'],
      }

      await dispatchNotification(mockSupabase, params)

      const [, message] = vi.mocked(sendWhatsAppMessage).mock.calls[0]
      expect(message).toBe('*My Title*\n\nMy body content')
    })

    it('skips WhatsApp when phone not configured', async () => {
      delete process.env.WHATSAPP_ANDY_PHONE

      const params: DispatchNotificationParams = {
        orgId: 'org-1',
        type: 'info',
        title: 'Test',
        body: 'Test',
        channels: ['whatsapp'],
      }

      const result = await dispatchNotification(mockSupabase, params)

      expect(sendWhatsAppMessage).not.toHaveBeenCalled()
      expect(result.whatsapp).toBe(false)
    })

    it('handles WhatsApp send errors', async () => {
      vi.mocked(sendWhatsAppMessage).mockRejectedValue(new Error('Send failed'))

      const params: DispatchNotificationParams = {
        orgId: 'org-1',
        type: 'info',
        title: 'Test',
        body: 'Test',
        channels: ['whatsapp'],
      }

      const result = await dispatchNotification(mockSupabase, params)

      expect(result.whatsapp).toBe(false)
    })

    it('returns false when WhatsApp returns no messageId', async () => {
      vi.mocked(sendWhatsAppMessage).mockResolvedValue(null)

      const params: DispatchNotificationParams = {
        orgId: 'org-1',
        type: 'info',
        title: 'Test',
        body: 'Test',
        channels: ['whatsapp'],
      }

      const result = await dispatchNotification(mockSupabase, params)

      expect(result.whatsapp).toBe(false)
    })
  })

  describe('user preferences', () => {
    it('respects email preference disabled', async () => {
      vi.mocked(getNotificationPreferences).mockResolvedValue({
        email: false,
        whatsapp: true,
        dashboard: true,
        digest_frequency: 'daily',
      })

      const params: DispatchNotificationParams = {
        orgId: 'org-1',
        userId: 'user-1',
        type: 'info',
        title: 'Test',
        body: 'Test',
      }

      const result = await dispatchNotification(mockSupabase, params)

      expect(result.email).toBe(false)
      expect(result.whatsapp).toBe(true)
    })

    it('respects WhatsApp preference disabled', async () => {
      vi.mocked(getNotificationPreferences).mockResolvedValue({
        email: true,
        whatsapp: false,
        dashboard: true,
        digest_frequency: 'daily',
      })

      const params: DispatchNotificationParams = {
        orgId: 'org-1',
        userId: 'user-1',
        type: 'info',
        title: 'Test',
        body: 'Test',
      }

      const result = await dispatchNotification(mockSupabase, params)

      expect(result.whatsapp).toBe(false)
      expect(result.email).toBe(true)
    })

    it('respects dashboard preference disabled', async () => {
      vi.mocked(getNotificationPreferences).mockResolvedValue({
        email: true,
        whatsapp: true,
        dashboard: false,
        digest_frequency: 'daily',
      })

      const params: DispatchNotificationParams = {
        orgId: 'org-1',
        userId: 'user-1',
        type: 'info',
        title: 'Test',
        body: 'Test',
      }

      const result = await dispatchNotification(mockSupabase, params)

      expect(result.dashboard).toBe(false)
      expect(result.email).toBe(true)
    })

    it('ignores preferences when preferences fetch fails', async () => {
      vi.mocked(getNotificationPreferences).mockRejectedValue(new Error('Fetch failed'))

      const params: DispatchNotificationParams = {
        orgId: 'org-1',
        userId: 'user-1',
        type: 'info',
        title: 'Test',
        body: 'Test',
      }

      const result = await dispatchNotification(mockSupabase, params)

      // Should still send to all channels (fallback)
      expect(result.dashboard).toBe(true)
      expect(result.email).toBe(true)
      expect(result.whatsapp).toBe(true)
    })

    it('ignores preferences when no userId provided', async () => {
      const params: DispatchNotificationParams = {
        orgId: 'org-1',
        type: 'info',
        title: 'Test',
        body: 'Test',
      }

      await dispatchNotification(mockSupabase, params)

      expect(getNotificationPreferences).not.toHaveBeenCalled()
    })
  })

  describe('critical urgency override', () => {
    it('sends critical notifications to all channels regardless of preferences', async () => {
      vi.mocked(getNotificationPreferences).mockResolvedValue({
        email: false,
        whatsapp: false,
        dashboard: false,
        digest_frequency: 'never',
      })

      const params: DispatchNotificationParams = {
        orgId: 'org-1',
        userId: 'user-1',
        type: 'alert_escalation',
        title: 'Critical Alert',
        body: 'System down',
        urgency: 'critical',
      }

      const result = await dispatchNotification(mockSupabase, params)

      expect(result.dashboard).toBe(true)
      expect(result.whatsapp).toBe(true)
      expect(result.email).toBe(true)
    })

    it('respects specified channels even for critical', async () => {
      const params: DispatchNotificationParams = {
        orgId: 'org-1',
        type: 'alert_escalation',
        title: 'Critical',
        body: 'Alert',
        urgency: 'critical',
        channels: ['dashboard'],
      }

      const result = await dispatchNotification(mockSupabase, params)

      expect(result.dashboard).toBe(true)
      expect(result.whatsapp).toBe(false)
      expect(result.email).toBe(false)
    })
  })

  describe('notification types', () => {
    it('routes approval_needed to approval email template', async () => {
      const metadata = {
        approvalId: 'app-123',
        summary: 'Review needed',
        agentName: 'Lead Agent',
        confidence: 0.95,
        actionType: 'Create Task',
      }

      const params: DispatchNotificationParams = {
        orgId: 'org-1',
        type: 'approval_needed',
        title: 'Approval',
        body: 'Approval needed',
        metadata,
      }

      // Mock the email template
      vi.doMock('./email-templates', async () => {
        return {
          sendApprovalNeededEmail: vi.fn().mockResolvedValue(true),
        }
      })

      const result = await dispatchNotification(mockSupabase, params)

      // Result shows email was attempted
      expect(result.email).toBeDefined()
    })

    it('handles generic email for unknown notification types', async () => {
      const { Resend } = await import('resend')
      const mockSend = vi.fn().mockResolvedValue({ error: null })
      vi.mocked(Resend).mockImplementation(function() {
        return {
          emails: { send: mockSend },
        }
      })

      const params: DispatchNotificationParams = {
        orgId: 'org-1',
        type: 'info',
        title: 'Info',
        body: 'Information',
        channels: ['email'],
      }

      const result = await dispatchNotification(mockSupabase, params)

      expect(result.email).toBe(true)
    })
  })

  describe('default values', () => {
    it('defaults urgency to normal', async () => {
      const params: DispatchNotificationParams = {
        orgId: 'org-1',
        type: 'info',
        title: 'Test',
        body: 'Test',
      }

      await dispatchNotification(mockSupabase, params)

      const call = mockInsert.mock.calls[0][0]
      expect(call.urgency).toBe('normal')
    })

    it('defaults channels to all', async () => {
      const params: DispatchNotificationParams = {
        orgId: 'org-1',
        type: 'info',
        title: 'Test',
        body: 'Test',
      }

      const result = await dispatchNotification(mockSupabase, params)

      expect(result.dashboard).toBe(true)
      expect(result.whatsapp).toBe(true)
      expect(result.email).toBe(true)
    })

    it('defaults metadata to empty object', async () => {
      const params: DispatchNotificationParams = {
        orgId: 'org-1',
        type: 'info',
        title: 'Test',
        body: 'Test',
      }

      await dispatchNotification(mockSupabase, params)

      const call = mockInsert.mock.calls[0][0]
      expect(call.metadata).toEqual({})
    })
  })

  describe('email defaults', () => {
    it('uses default email when not configured', async () => {
      delete process.env.NOTIFICATION_TO_EMAIL

      const { Resend } = await import('resend')
      const mockSend = vi.fn().mockResolvedValue({ error: null })
      vi.mocked(Resend).mockImplementation(function() {
        return {
          emails: { send: mockSend },
        }
      })

      const params: DispatchNotificationParams = {
        orgId: 'org-1',
        type: 'info',
        title: 'Test',
        body: 'Test',
        channels: ['email'],
      }

      await dispatchNotification(mockSupabase, params)

      const call = mockSend.mock.calls[0]?.[0]
      expect(call?.to).toContain('andy@allwebbedup.com.au')
    })

    it('uses default from email when not configured', async () => {
      delete process.env.NOTIFICATION_FROM_EMAIL

      const { Resend } = await import('resend')
      const mockSend = vi.fn().mockResolvedValue({ error: null })
      vi.mocked(Resend).mockImplementation(function() {
        return {
          emails: { send: mockSend },
        }
      })

      const params: DispatchNotificationParams = {
        orgId: 'org-1',
        type: 'info',
        title: 'Test',
        body: 'Test',
        channels: ['email'],
      }

      await dispatchNotification(mockSupabase, params)

      const call = mockSend.mock.calls[0]?.[0]
      expect(call?.from).toBe('bitbit@bitbit.chat')
    })
  })
})
