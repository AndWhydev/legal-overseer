import { Resend } from 'resend'
import { getAppUrl } from '@/lib/core/app-url'
import type { MonthlyReportData } from './generator'

export interface MonthlyRevenueReportEmailInput {
  orgName: string
  month: string
  report: MonthlyReportData
  recipients?: string[]
  reportUrl?: string | null
}

export interface MonthlyRevenueReportEmailResult {
  success: boolean
  skipped: boolean
  recipients: string[]
  sent: number
  failed: number
  errors: string[]
}

function getResend() {
  return new Resend(process.env.RESEND_API_KEY || '')
}

function getFromEmail(): string {
  return (
    process.env.MONTHLY_REPORT_FROM_EMAIL
    || process.env.NOTIFICATION_FROM_EMAIL
    || process.env.RESEND_FROM_EMAIL
    || 'bitbit@bitbit.chat'
  )
}

function getDashboardUrl(): string {
  return `${getAppUrl()}/dashboard`
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 2,
  }).format(value)
}

function formatMonthLabel(month: string): string {
  const [year, rawMonth] = month.split('-').map(Number)
  if (!year || !rawMonth || rawMonth < 1 || rawMonth > 12) return month

  return new Date(Date.UTC(year, rawMonth - 1, 1)).toLocaleDateString('en-AU', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function parseEmailList(raw?: string | null): string[] {
  if (!raw) return []

  const seen = new Set<string>()
  const emails = raw
    .split(/[,\n;]+/)
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0)
    .filter((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item))

  for (const email of emails) {
    seen.add(email)
  }

  return Array.from(seen)
}

export function getMonthlyReportRecipients(): string[] {
  const explicit = parseEmailList(process.env.MONTHLY_REPORT_RECIPIENTS)
  if (explicit.length > 0) return explicit

  return parseEmailList(process.env.NOTIFICATION_TO_EMAIL)
}

export function buildMonthlyRevenueEmailHtml(
  input: MonthlyRevenueReportEmailInput,
): string {
  const reportMonth = formatMonthLabel(input.month)
  const dashboardUrl = getDashboardUrl()
  const topClients = input.report.topClients.slice(0, 5)
  const channelVolume = input.report.channelVolume
    .slice()
    .sort((a, b) => b.messageCount - a.messageCount)
    .slice(0, 5)

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 760px; margin: 0 auto; padding: 24px; color: #1f2937;">
      <h2 style="margin: 0 0 8px 0; color: #111827;">Monthly Revenue Report</h2>
      <p style="margin: 0 0 18px 0; color: #4b5563;">${escapeHtml(input.orgName)} · ${escapeHtml(reportMonth)}</p>

      <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-bottom: 20px;">
        <div style="background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px;">
          <div style="font-size: 12px; color: #6b7280;">Revenue Collected</div>
          <div style="font-size: 20px; font-weight: 700; color: #065f46;">${formatCurrency(input.report.revenue.totalPaid)}</div>
        </div>
        <div style="background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px;">
          <div style="font-size: 12px; color: #6b7280;">Outstanding</div>
          <div style="font-size: 20px; font-weight: 700; color: #9a3412;">${formatCurrency(input.report.revenue.totalOutstanding)}</div>
        </div>
        <div style="background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px;">
          <div style="font-size: 12px; color: #6b7280;">Invoices</div>
          <div style="font-size: 20px; font-weight: 700;">${input.report.revenue.invoiceCount}</div>
        </div>
        <div style="background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px;">
          <div style="font-size: 12px; color: #6b7280;">Paid Invoices</div>
          <div style="font-size: 20px; font-weight: 700;">${input.report.revenue.paidCount}</div>
        </div>
      </div>

      ${topClients.length > 0 ? `
      <h3 style="margin: 0 0 10px 0; font-size: 16px;">Top Clients</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <thead>
          <tr style="background: #f9fafb;">
            <th style="text-align: left; border: 1px solid #e5e7eb; padding: 8px;">Client</th>
            <th style="text-align: right; border: 1px solid #e5e7eb; padding: 8px;">Revenue</th>
            <th style="text-align: right; border: 1px solid #e5e7eb; padding: 8px;">Invoices</th>
          </tr>
        </thead>
        <tbody>
          ${topClients.map((client) => `
            <tr>
              <td style="border: 1px solid #e5e7eb; padding: 8px;">${escapeHtml(client.name)}</td>
              <td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right;">${formatCurrency(client.revenue)}</td>
              <td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right;">${client.interactions}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      ` : ''}

      ${channelVolume.length > 0 ? `
      <h3 style="margin: 0 0 10px 0; font-size: 16px;">Top Channels</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <thead>
          <tr style="background: #f9fafb;">
            <th style="text-align: left; border: 1px solid #e5e7eb; padding: 8px;">Channel</th>
            <th style="text-align: right; border: 1px solid #e5e7eb; padding: 8px;">Messages</th>
          </tr>
        </thead>
        <tbody>
          ${channelVolume.map((channel) => `
            <tr>
              <td style="border: 1px solid #e5e7eb; padding: 8px;">${escapeHtml(channel.channel)}</td>
              <td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right;">${channel.messageCount}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      ` : ''}

      <div style="margin-bottom: 16px;">
        <a href="${dashboardUrl}/reports" style="display: inline-block; background: #2563eb; color: #fff; text-decoration: none; font-weight: 600; padding: 10px 14px; border-radius: 8px; margin-right: 8px;">
          Open Reports
        </a>
        <a href="${dashboardUrl}/analytics" style="display: inline-block; background: #111827; color: #fff; text-decoration: none; font-weight: 600; padding: 10px 14px; border-radius: 8px;">
          Open Analytics
        </a>
      </div>

      ${input.reportUrl ? `
        <p style="margin: 0 0 12px 0;">
          <a href="${input.reportUrl}" style="color: #2563eb; text-decoration: none;">Download this report</a>
        </p>
      ` : ''}

      <p style="margin: 20px 0 0 0; color: #6b7280; font-size: 12px;">
        Automated Bitbit monthly revenue report.
      </p>
    </div>
  `
}

export async function sendMonthlyRevenueReportEmail(
  input: MonthlyRevenueReportEmailInput,
): Promise<MonthlyRevenueReportEmailResult> {
  const recipients = input.recipients && input.recipients.length > 0
    ? input.recipients
    : getMonthlyReportRecipients()

  if (recipients.length === 0) {
    return {
      success: false,
      skipped: true,
      recipients: [],
      sent: 0,
      failed: 0,
      errors: ['No monthly report recipients configured'],
    }
  }

  if (!process.env.RESEND_API_KEY) {
    return {
      success: false,
      skipped: true,
      recipients,
      sent: 0,
      failed: recipients.length,
      errors: ['RESEND_API_KEY not configured'],
    }
  }

  const resend = getResend()
  const html = buildMonthlyRevenueEmailHtml(input)
  const subject = `Monthly Revenue Report: ${input.orgName} (${formatMonthLabel(input.month)})`
  const errors: string[] = []
  let sent = 0

  for (const to of recipients) {
    try {
      const { error } = await resend.emails.send({
        from: getFromEmail(),
        to: [to],
        subject,
        html,
        headers: {
          'List-Unsubscribe': '<mailto:unsubscribe@bitbit.chat>, <https://app.bitbit.chat/settings/notifications>',
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      })

      if (error) {
        errors.push(`${to}: ${error.message}`)
      } else {
        sent++
      }
    } catch (err) {
      errors.push(`${to}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return {
    success: sent > 0,
    skipped: false,
    recipients,
    sent,
    failed: recipients.length - sent,
    errors,
  }
}
