import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  sendApprovalNeededEmail,
  sendDailyDigestEmail,
  sendWeeklyReportEmail,
  sendAlertEscalationEmail,
  type ApprovalEmailDetails,
  type DigestData,
  type WeeklyReportData,
  type AlertEscalationDetails,
} from './email-templates'

// Mock Resend with a proper spy setup
const mockSend = vi.fn().mockResolvedValue({ error: null })
vi.mock('resend', () => ({
  Resend: vi.fn(function() {
    return {
      emails: {
        send: mockSend,
      },
    }
  }),
}))

describe('email-templates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSend.mockResolvedValue({ error: null })

    process.env.RESEND_API_KEY = 'test-key'
    process.env.NOTIFICATION_FROM_EMAIL = 'noreply@example.com'
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.RESEND_API_KEY
    delete process.env.NOTIFICATION_FROM_EMAIL
    delete process.env.NEXT_PUBLIC_APP_URL
  })

  describe('sendApprovalNeededEmail', () => {
    it('sends email with approval details', async () => {
      const details: ApprovalEmailDetails = {
        approvalId: 'app-123',
        summary: 'Create new lead task',
        agentName: 'Lead Agent',
        confidence: 0.95,
        actionType: 'Create Task',
      }

      const result = await sendApprovalNeededEmail('user@example.com', details)

      expect(result).toBe(true)
      expect(mockSend).toHaveBeenCalled()

      const call = mockSend.mock.calls[0][0]
      expect(call.to).toContain('user@example.com')
      expect(call.subject).toContain('Approval Needed')
      expect(call.subject).toContain('Create new lead task')
      expect(call.html).toContain('Lead Agent')
      expect(call.html).toContain('Create Task')
      expect(call.html).toContain('95%')
    })

    it('includes review and reject buttons', async () => {
      const details: ApprovalEmailDetails = {
        approvalId: 'app-456',
        summary: 'Test',
        agentName: 'Test Agent',
        confidence: 0.8,
        actionType: 'Send Email',
      }

      await sendApprovalNeededEmail('user@example.com', details)

      const call = mockSend.mock.calls[0][0]
      expect(call.html).toContain('Review &amp; Approve')
      expect(call.html).toContain('Reject')
      expect(call.html).toContain('/approvals/app-456')
    })

    it('includes dashboard URL in approval link', async () => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com'

      const details: ApprovalEmailDetails = {
        approvalId: 'app-789',
        summary: 'Test',
        agentName: 'Agent',
        confidence: 0.9,
        actionType: 'Action',
      }

      await sendApprovalNeededEmail('user@example.com', details)

      const call = mockSend.mock.calls[0][0]
      expect(call.html).toContain('https://app.example.com/dashboard/approvals/app-789')
    })

    it('skips sending when RESEND_API_KEY not set', async () => {
      delete process.env.RESEND_API_KEY
      mockSend.mockClear()

      const details: ApprovalEmailDetails = {
        approvalId: 'app-123',
        summary: 'Test',
        agentName: 'Agent',
        confidence: 0.8,
        actionType: 'Action',
      }

      const result = await sendApprovalNeededEmail('user@example.com', details)

      expect(result).toBe(false)
    })

    it('handles email send errors', async () => {
      mockSend.mockResolvedValue({ error: { message: 'Send failed' } })

      const details: ApprovalEmailDetails = {
        approvalId: 'app-123',
        summary: 'Test',
        agentName: 'Agent',
        confidence: 0.8,
        actionType: 'Action',
      }

      const result = await sendApprovalNeededEmail('user@example.com', details)

      expect(result).toBe(false)
    })

    it('handles exceptions during send', async () => {
      mockSend.mockRejectedValue(new Error('Network error'))

      const details: ApprovalEmailDetails = {
        approvalId: 'app-123',
        summary: 'Test',
        agentName: 'Agent',
        confidence: 0.8,
        actionType: 'Action',
      }

      const result = await sendApprovalNeededEmail('user@example.com', details)

      expect(result).toBe(false)
    })

    it('formats confidence as percentage', async () => {
      const testCases = [
        { confidence: 1.0, expected: '100%' },
        { confidence: 0.95, expected: '95%' },
        { confidence: 0.5, expected: '50%' },
        { confidence: 0.1, expected: '10%' },
      ]

      for (const { confidence, expected } of testCases) {
        mockSend.mockClear()
        const details: ApprovalEmailDetails = {
          approvalId: 'app-123',
          summary: 'Test',
          agentName: 'Agent',
          confidence,
          actionType: 'Action',
        }

        await sendApprovalNeededEmail('user@example.com', details)

        const call = mockSend.mock.calls[0][0]
        expect(call.html).toContain(expected)
      }
    })
  })

  describe('sendDailyDigestEmail', () => {
    it('sends daily digest with metrics', async () => {
      const data: DigestData = {
        date: '2025-02-28',
        agentRuns: 42,
        approvalsProcessed: 5,
        approvalsPending: 2,
        leadsReceived: 12,
        invoicesSent: 3,
        alertsTriggered: 1,
        topItems: [
          { label: 'Top Lead', detail: 'Acme Corp - $50k' },
        ],
      }

      const result = await sendDailyDigestEmail('user@example.com', data)

      expect(result).toBe(true)
      expect(mockSend).toHaveBeenCalled()

      const call = mockSend.mock.calls[0][0]
      expect(call.to).toContain('user@example.com')
      expect(call.subject).toContain('Daily Digest')
      expect(call.subject).toContain('2025-02-28')
      expect(call.html).toContain('42')
      expect(call.html).toContain('5')
      expect(call.html).toContain('12')
    })

    it('includes notable items in digest', async () => {
      const data: DigestData = {
        date: '2025-02-28',
        agentRuns: 10,
        approvalsProcessed: 2,
        approvalsPending: 0,
        leadsReceived: 5,
        invoicesSent: 1,
        alertsTriggered: 0,
        topItems: [
          { label: 'Item 1', detail: 'Detail 1' },
          { label: 'Item 2', detail: 'Detail 2' },
        ],
      }

      await sendDailyDigestEmail('user@example.com', data)

      const call = mockSend.mock.calls[0][0]
      expect(call.html).toContain('Notable Items')
      expect(call.html).toContain('Item 1')
      expect(call.html).toContain('Item 2')
    })

    it('shows "no notable items" when empty', async () => {
      const data: DigestData = {
        date: '2025-02-28',
        agentRuns: 0,
        approvalsProcessed: 0,
        approvalsPending: 0,
        leadsReceived: 0,
        invoicesSent: 0,
        alertsTriggered: 0,
        topItems: [],
      }

      await sendDailyDigestEmail('user@example.com', data)

      const call = mockSend.mock.calls[0][0]
      // When topItems is empty, the Notable Items section is not included at all
      expect(call.html).not.toContain('Notable Items')
    })

    it('highlights pending approvals in orange', async () => {
      const data: DigestData = {
        date: '2025-02-28',
        agentRuns: 1,
        approvalsProcessed: 0,
        approvalsPending: 3,
        leadsReceived: 0,
        invoicesSent: 0,
        alertsTriggered: 0,
        topItems: [],
      }

      await sendDailyDigestEmail('user@example.com', data)

      const call = mockSend.mock.calls[0][0]
      expect(call.html).toContain('#f59e0b')
    })

    it('includes dashboard link', async () => {
      const data: DigestData = {
        date: '2025-02-28',
        agentRuns: 1,
        approvalsProcessed: 0,
        approvalsPending: 0,
        leadsReceived: 0,
        invoicesSent: 0,
        alertsTriggered: 0,
        topItems: [],
      }

      await sendDailyDigestEmail('user@example.com', data)

      const call = mockSend.mock.calls[0][0]
      expect(call.html).toContain('/dashboard')
    })
  })

  describe('sendWeeklyReportEmail', () => {
    it('sends weekly report with metrics', async () => {
      const data: WeeklyReportData = {
        weekStart: '2025-02-24',
        weekEnd: '2025-03-02',
        totalAgentRuns: 150,
        previousWeekRuns: 100,
        topAgents: [
          { name: 'Lead Agent', runs: 80, successRate: 0.95 },
          { name: 'Invoice Agent', runs: 40, successRate: 0.9 },
        ],
        totalCost: 12.50,
        previousWeekCost: 10.00,
        leadsTotal: 50,
        previousWeekLeads: 35,
        pipelineValue: 100000,
        previousWeekPipeline: 80000,
      }

      const result = await sendWeeklyReportEmail('user@example.com', data)

      expect(result).toBe(true)
      expect(mockSend).toHaveBeenCalled()

      const call = mockSend.mock.calls[0][0]
      expect(call.subject).toContain('Weekly Report')
      expect(call.html).toContain('150')
      expect(call.html).toContain('Lead Agent')
      expect(call.html).toContain('95%')
    })

    it('calculates week-over-week deltas', async () => {
      const data: WeeklyReportData = {
        weekStart: '2025-02-24',
        weekEnd: '2025-03-02',
        totalAgentRuns: 150,
        previousWeekRuns: 100,
        topAgents: [],
        totalCost: 12.50,
        previousWeekCost: 10.00,
        leadsTotal: 50,
        previousWeekLeads: 40,
        pipelineValue: 100000,
        previousWeekPipeline: 80000,
      }

      await sendWeeklyReportEmail('user@example.com', data)

      const call = mockSend.mock.calls[0][0]
      expect(call.html).toContain('+50%') // 150/100 = +50%
      expect(call.html).toContain('+25%') // 12.5/10 = +25%
    })

    it('shows cost delta in red when increased', async () => {
      const data: WeeklyReportData = {
        weekStart: '2025-02-24',
        weekEnd: '2025-03-02',
        totalAgentRuns: 100,
        previousWeekRuns: 100,
        topAgents: [],
        totalCost: 15.00,
        previousWeekCost: 10.00,
        leadsTotal: 40,
        previousWeekLeads: 40,
        pipelineValue: 100000,
        previousWeekPipeline: 100000,
      }

      await sendWeeklyReportEmail('user@example.com', data)

      const call = mockSend.mock.calls[0][0]
      // Cost increase should be red (#ef4444)
      expect(call.html).toContain('#ef4444')
    })

    it('includes top agents table', async () => {
      const data: WeeklyReportData = {
        weekStart: '2025-02-24',
        weekEnd: '2025-03-02',
        totalAgentRuns: 120,
        previousWeekRuns: 100,
        topAgents: [
          { name: 'Agent A', runs: 80, successRate: 0.95 },
          { name: 'Agent B', runs: 40, successRate: 0.85 },
        ],
        totalCost: 12.00,
        previousWeekCost: 10.00,
        leadsTotal: 50,
        previousWeekLeads: 40,
        pipelineValue: 100000,
        previousWeekPipeline: 80000,
      }

      await sendWeeklyReportEmail('user@example.com', data)

      const call = mockSend.mock.calls[0][0]
      expect(call.html).toContain('Top Operations')
      expect(call.html).toContain('Agent A')
      expect(call.html).toContain('Agent B')
      expect(call.html).toContain('95%')
    })

    it('omits top agents section when empty', async () => {
      const data: WeeklyReportData = {
        weekStart: '2025-02-24',
        weekEnd: '2025-03-02',
        totalAgentRuns: 0,
        previousWeekRuns: 0,
        topAgents: [],
        totalCost: 0,
        previousWeekCost: 0,
        leadsTotal: 0,
        previousWeekLeads: 0,
        pipelineValue: 0,
        previousWeekPipeline: 0,
      }

      await sendWeeklyReportEmail('user@example.com', data)

      const call = mockSend.mock.calls[0][0]
      expect(call.html).not.toContain('Top Agents')
    })

    it('includes analytics dashboard link', async () => {
      const data: WeeklyReportData = {
        weekStart: '2025-02-24',
        weekEnd: '2025-03-02',
        totalAgentRuns: 100,
        previousWeekRuns: 100,
        topAgents: [],
        totalCost: 10.00,
        previousWeekCost: 10.00,
        leadsTotal: 40,
        previousWeekLeads: 40,
        pipelineValue: 100000,
        previousWeekPipeline: 100000,
      }

      await sendWeeklyReportEmail('user@example.com', data)

      const call = mockSend.mock.calls[0][0]
      expect(call.html).toContain('/analytics')
    })

    it('handles zero previous week values', async () => {
      const data: WeeklyReportData = {
        weekStart: '2025-02-24',
        weekEnd: '2025-03-02',
        totalAgentRuns: 50,
        previousWeekRuns: 0,
        topAgents: [],
        totalCost: 5.00,
        previousWeekCost: 0,
        leadsTotal: 20,
        previousWeekLeads: 0,
        pipelineValue: 50000,
        previousWeekPipeline: 0,
      }

      await sendWeeklyReportEmail('user@example.com', data)

      const call = mockSend.mock.calls[0][0]
      expect(call.html).toContain('+100%')
    })
  })

  describe('sendAlertEscalationEmail', () => {
    it('sends alert escalation email', async () => {
      const details: AlertEscalationDetails = {
        alertId: 'alert-123',
        severity: 'critical',
        summary: 'API response time exceeded threshold',
        source: 'Health Check',
        timestamp: '2025-02-28 10:30:00',
      }

      const result = await sendAlertEscalationEmail('user@example.com', details)

      expect(result).toBe(true)
      expect(mockSend).toHaveBeenCalled()

      const call = mockSend.mock.calls[0][0]
      expect(call.subject).toContain('[CRITICAL]')
      expect(call.html).toContain('API response time exceeded')
      expect(call.html).toContain('Health Check')
    })

    it('uses correct severity colors', async () => {
      const severities: Array<AlertEscalationDetails['severity']> = ['critical', 'high', 'medium', 'low']
      const expectedColors = ['#dc2626', '#ea580c', '#d97706', '#6b7280']

      for (let i = 0; i < severities.length; i++) {
        mockSend.mockClear()
        const details: AlertEscalationDetails = {
          alertId: `alert-${i}`,
          severity: severities[i],
          summary: 'Test',
          source: 'Test',
          timestamp: '2025-02-28',
        }

        await sendAlertEscalationEmail('user@example.com', details)

        const call = mockSend.mock.calls[0][0]
        expect(call.html).toContain(expectedColors[i])
      }
    })

    it('includes alert link with severity in subject', async () => {
      const details: AlertEscalationDetails = {
        alertId: 'alert-456',
        severity: 'high',
        summary: 'Memory usage critical',
        source: 'Server Monitor',
        timestamp: '2025-02-28 14:20:00',
      }

      await sendAlertEscalationEmail('user@example.com', details)

      const call = mockSend.mock.calls[0][0]
      expect(call.subject).toContain('HIGH')
      expect(call.subject).toContain('Memory usage critical')
      expect(call.html).toContain('/alerts/alert-456')
    })

    it('formats timestamp correctly', async () => {
      const details: AlertEscalationDetails = {
        alertId: 'alert-789',
        severity: 'medium',
        summary: 'Test alert',
        source: 'Test',
        timestamp: '2025-02-28 09:15:30',
      }

      await sendAlertEscalationEmail('user@example.com', details)

      const call = mockSend.mock.calls[0][0]
      expect(call.html).toContain('2025-02-28 09:15:30')
    })
  })

  describe('HTML wrapping', () => {
    it('wraps all email content with styling', async () => {
      const details: ApprovalEmailDetails = {
        approvalId: 'app-123',
        summary: 'Test',
        agentName: 'Agent',
        confidence: 0.8,
        actionType: 'Action',
      }

      await sendApprovalNeededEmail('user@example.com', details)

      const call = mockSend.mock.calls[0][0]
      expect(call.html).toContain('font-family:')
      expect(call.html).toContain('max-width: 600px')
      expect(call.html).toContain('Automated notification from Bitbit')
    })

    it('includes footer in all templates', async () => {
      const appDetails: ApprovalEmailDetails = {
        approvalId: 'app-123',
        summary: 'Test',
        agentName: 'Agent',
        confidence: 0.8,
        actionType: 'Action',
      }

      await sendApprovalNeededEmail('user@example.com', appDetails)

      const call = mockSend.mock.calls[0][0]
      expect(call.html).toContain('Manage preferences in your dashboard settings')
    })
  })

  describe('error handling', () => {
    it('returns false when send fails', async () => {
      mockSend.mockResolvedValue({ error: { message: 'Failed' } })

      const details: ApprovalEmailDetails = {
        approvalId: 'app-123',
        summary: 'Test',
        agentName: 'Agent',
        confidence: 0.8,
        actionType: 'Action',
      }

      const result = await sendApprovalNeededEmail('user@example.com', details)

      expect(result).toBe(false)
    })

    it('returns false on exception', async () => {
      mockSend.mockRejectedValue(new Error('Network error'))

      const details: ApprovalEmailDetails = {
        approvalId: 'app-123',
        summary: 'Test',
        agentName: 'Agent',
        confidence: 0.8,
        actionType: 'Action',
      }

      const result = await sendApprovalNeededEmail('user@example.com', details)

      expect(result).toBe(false)
    })
  })
})
