import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MonthlyReportData } from './generator'
import {
  parseEmailList,
  getMonthlyReportRecipients,
  sendMonthlyRevenueReportEmail,
} from './monthly-revenue-email'

const mockSend = vi.fn().mockResolvedValue({ error: null })

vi.mock('resend', () => ({
  Resend: vi.fn(function Resend() {
    return {
      emails: {
        send: mockSend,
      },
    }
  }),
}))

const sampleMonthlyReport: MonthlyReportData = {
  type: 'monthly',
  orgId: 'org-1',
  month: '2026-02',
  generatedAt: '2026-03-01T00:00:00.000Z',
  revenue: {
    totalPaid: 10000,
    totalOutstanding: 2500,
    invoiceCount: 12,
    paidCount: 9,
  },
  pipeline: [{ stage: 'proposal', count: 2, value: 9000 }],
  agentActivity: {
    totalRuns: 100,
    totalCost: 50,
    successRate: 0.95,
    byAgent: [{ agent: 'invoice-agent', runs: 20, cost: 8, successRate: 1 }],
  },
  channelVolume: [
    { channel: 'gmail', messageCount: 40 },
    { channel: 'whatsapp', messageCount: 24 },
  ],
  topClients: [
    { name: 'Acme Pty Ltd', revenue: 7000, interactions: 4 },
    { name: 'Beta Co', revenue: 3000, interactions: 2 },
  ],
}

describe('monthly-revenue-email', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSend.mockResolvedValue({ error: null })
    process.env.RESEND_API_KEY = 'test-key'
    process.env.NOTIFICATION_TO_EMAIL = 'fallback@example.com'
    process.env.MONTHLY_REPORT_RECIPIENTS = ''
  })

  afterEach(() => {
    delete process.env.RESEND_API_KEY
    delete process.env.NOTIFICATION_TO_EMAIL
    delete process.env.MONTHLY_REPORT_RECIPIENTS
    delete process.env.MONTHLY_REPORT_FROM_EMAIL
    delete process.env.NOTIFICATION_FROM_EMAIL
    delete process.env.RESEND_FROM_EMAIL
    delete process.env.NEXT_PUBLIC_APP_URL
  })

  it('parses comma/semicolon/newline-separated email lists and deduplicates', () => {
    const parsed = parseEmailList('A@EXAMPLE.com; b@example.com,\ninvalid,b@example.com')
    expect(parsed).toEqual(['a@example.com', 'b@example.com'])
  })

  it('uses MONTHLY_REPORT_RECIPIENTS when configured', () => {
    process.env.MONTHLY_REPORT_RECIPIENTS = 'owner@example.com, finance@example.com'
    process.env.NOTIFICATION_TO_EMAIL = 'fallback@example.com'

    expect(getMonthlyReportRecipients()).toEqual(['owner@example.com', 'finance@example.com'])
  })

  it('falls back to NOTIFICATION_TO_EMAIL when monthly recipients are unset', () => {
    process.env.MONTHLY_REPORT_RECIPIENTS = ''
    process.env.NOTIFICATION_TO_EMAIL = 'fallback@example.com'

    expect(getMonthlyReportRecipients()).toEqual(['fallback@example.com'])
  })

  it('returns skipped when RESEND_API_KEY is missing', async () => {
    delete process.env.RESEND_API_KEY
    process.env.MONTHLY_REPORT_RECIPIENTS = 'owner@example.com'

    const result = await sendMonthlyRevenueReportEmail({
      orgName: 'BitBit',
      month: '2026-02',
      report: sampleMonthlyReport,
    })

    expect(result.skipped).toBe(true)
    expect(result.success).toBe(false)
    expect(result.sent).toBe(0)
  })

  it('sends to each configured monthly report recipient', async () => {
    process.env.MONTHLY_REPORT_RECIPIENTS = 'owner@example.com,finance@example.com'
    process.env.MONTHLY_REPORT_FROM_EMAIL = 'reports@example.com'
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com'

    const result = await sendMonthlyRevenueReportEmail({
      orgName: 'BitBit',
      month: '2026-02',
      report: sampleMonthlyReport,
      reportUrl: 'https://signed-url.example.com/report.html',
    })

    expect(result.success).toBe(true)
    expect(result.sent).toBe(2)
    expect(result.failed).toBe(0)
    expect(mockSend).toHaveBeenCalledTimes(2)
    expect(mockSend.mock.calls[0][0].subject).toContain('Monthly Revenue Report')
    expect(mockSend.mock.calls[0][0].from).toBe('reports@example.com')
    expect(mockSend.mock.calls[0][0].html).toContain('https://signed-url.example.com/report.html')
  })

  it('records per-recipient failures and continues sending', async () => {
    process.env.MONTHLY_REPORT_RECIPIENTS = 'owner@example.com,finance@example.com'

    mockSend
      .mockResolvedValueOnce({ error: { message: 'simulated failure' } })
      .mockResolvedValueOnce({ error: null })

    const result = await sendMonthlyRevenueReportEmail({
      orgName: 'BitBit',
      month: '2026-02',
      report: sampleMonthlyReport,
    })

    expect(result.success).toBe(true)
    expect(result.sent).toBe(1)
    expect(result.failed).toBe(1)
    expect(result.errors[0]).toContain('owner@example.com')
  })
})
