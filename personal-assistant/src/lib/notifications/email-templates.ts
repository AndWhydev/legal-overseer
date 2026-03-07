import { Resend } from 'resend'
import { getAppUrl } from '@/lib/core/app-url'

function getResend() {
  return new Resend(process.env.RESEND_API_KEY || '')
}

function getFromEmail(): string {
  return process.env.NOTIFICATION_FROM_EMAIL || 'bitbit@allwebbedup.com.au'
}

function getDashboardUrl(): string {
  return `${getAppUrl()}/dashboard`
}

function wrapHtml(content: string): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
      ${content}
      <p style="color: #999; font-size: 12px; margin-top: 30px; border-top: 1px solid #eee; padding-top: 15px;">
        Automated notification from Bitbit. Manage preferences in your dashboard settings.
      </p>
    </div>
  `
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.warn('Email skipped: RESEND_API_KEY not configured')
      return false
    }

    const { error } = await getResend().emails.send({
      from: getFromEmail(),
      to: [to],
      subject,
      html,
    })

    if (error) {
      console.warn('Email send failed:', error)
      return false
    }

    return true
  } catch (err) {
    console.warn('Email send error:', err)
    return false
  }
}

export interface ApprovalEmailDetails {
  approvalId: string
  summary: string
  agentName: string
  confidence: number
  actionType: string
}

export async function sendApprovalNeededEmail(
  to: string,
  details: ApprovalEmailDetails,
): Promise<boolean> {
  const dashboardUrl = getDashboardUrl()
  const html = wrapHtml(`
    <h2 style="color: #1a1a1a; margin-bottom: 20px;">Approval Needed</h2>
    <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
      <p style="margin: 0 0 10px 0;"><strong>Agent:</strong> ${details.agentName}</p>
      <p style="margin: 0 0 10px 0;"><strong>Action:</strong> ${details.actionType}</p>
      <p style="margin: 0 0 10px 0;"><strong>Summary:</strong> ${details.summary}</p>
      <p style="margin: 0;"><strong>Confidence:</strong> ${(details.confidence * 100).toFixed(0)}%</p>
    </div>
    <p style="margin-bottom: 20px;">
      <a href="${dashboardUrl}/approvals/${details.approvalId}" style="display: inline-block; background: #22c55e; color: white; padding: 10px 20px; border-radius: 4px; text-decoration: none; font-weight: 500; margin-right: 10px;">
        Review &amp; Approve
      </a>
      <a href="${dashboardUrl}/approvals/${details.approvalId}?action=reject" style="display: inline-block; background: #ef4444; color: white; padding: 10px 20px; border-radius: 4px; text-decoration: none; font-weight: 500;">
        Reject
      </a>
    </p>
  `)

  return sendEmail(to, `Approval Needed: ${details.summary}`, html)
}

export interface DigestData {
  date: string
  agentRuns: number
  approvalsProcessed: number
  approvalsPending: number
  leadsReceived: number
  invoicesSent: number
  alertsTriggered: number
  topItems: Array<{ label: string; detail: string }>
}

export async function sendDailyDigestEmail(
  to: string,
  data: DigestData,
): Promise<boolean> {
  const dashboardUrl = getDashboardUrl()
  const topItemsHtml = data.topItems.length > 0
    ? data.topItems.map(item => `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.label}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.detail}</td>
        </tr>
      `).join('')
    : '<tr><td style="padding: 8px; color: #999;">No notable items today.</td></tr>'

  const html = wrapHtml(`
    <h2 style="color: #1a1a1a; margin-bottom: 20px;">Daily Digest - ${data.date}</h2>
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
      <tr style="background: #f5f5f5;">
        <td style="padding: 12px; font-weight: 600;">Agent Runs</td>
        <td style="padding: 12px; text-align: right; font-size: 18px; font-weight: bold;">${data.agentRuns}</td>
      </tr>
      <tr>
        <td style="padding: 12px;">Approvals Processed</td>
        <td style="padding: 12px; text-align: right; font-size: 18px;">${data.approvalsProcessed}</td>
      </tr>
      <tr style="background: #f5f5f5;">
        <td style="padding: 12px;">Approvals Pending</td>
        <td style="padding: 12px; text-align: right; font-size: 18px; color: ${data.approvalsPending > 0 ? '#f59e0b' : '#22c55e'};">${data.approvalsPending}</td>
      </tr>
      <tr>
        <td style="padding: 12px;">Leads Received</td>
        <td style="padding: 12px; text-align: right; font-size: 18px;">${data.leadsReceived}</td>
      </tr>
      <tr style="background: #f5f5f5;">
        <td style="padding: 12px;">Invoices Sent</td>
        <td style="padding: 12px; text-align: right; font-size: 18px;">${data.invoicesSent}</td>
      </tr>
      <tr>
        <td style="padding: 12px;">Alerts Triggered</td>
        <td style="padding: 12px; text-align: right; font-size: 18px; color: ${data.alertsTriggered > 0 ? '#ef4444' : '#22c55e'};">${data.alertsTriggered}</td>
      </tr>
    </table>
    ${data.topItems.length > 0 ? `
    <h3 style="margin-bottom: 10px;">Notable Items</h3>
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
      ${topItemsHtml}
    </table>
    ` : ''}
    <p>
      <a href="${dashboardUrl}" style="display: inline-block; background: #007bff; color: white; padding: 10px 20px; border-radius: 4px; text-decoration: none; font-weight: 500;">
        Open Dashboard
      </a>
    </p>
  `)

  return sendEmail(to, `Bitbit Daily Digest - ${data.date}`, html)
}

export interface WeeklyReportData {
  weekStart: string
  weekEnd: string
  totalAgentRuns: number
  previousWeekRuns: number
  topAgents: Array<{ name: string; runs: number; successRate: number }>
  totalCost: number
  previousWeekCost: number
  leadsTotal: number
  previousWeekLeads: number
  pipelineValue: number
  previousWeekPipeline: number
}

export async function sendWeeklyReportEmail(
  to: string,
  data: WeeklyReportData,
): Promise<boolean> {
  const dashboardUrl = getDashboardUrl()

  function delta(current: number, previous: number): string {
    if (previous === 0) return current > 0 ? '+100%' : '0%'
    const pct = ((current - previous) / previous * 100).toFixed(0)
    const sign = Number(pct) >= 0 ? '+' : ''
    return `${sign}${pct}%`
  }

  function deltaColor(current: number, previous: number, invertGood = false): string {
    const diff = current - previous
    if (diff === 0) return '#666'
    const positive = invertGood ? diff < 0 : diff > 0
    return positive ? '#22c55e' : '#ef4444'
  }

  const agentRows = data.topAgents.map(a => `
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #eee;">${a.name}</td>
      <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">${a.runs}</td>
      <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">${(a.successRate * 100).toFixed(0)}%</td>
    </tr>
  `).join('')

  const html = wrapHtml(`
    <h2 style="color: #1a1a1a; margin-bottom: 5px;">Weekly Report</h2>
    <p style="color: #666; margin-bottom: 20px;">${data.weekStart} - ${data.weekEnd}</p>

    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
      <tr style="background: #f5f5f5;">
        <td style="padding: 12px; font-weight: 600;">Metric</td>
        <td style="padding: 12px; text-align: right; font-weight: 600;">This Week</td>
        <td style="padding: 12px; text-align: right; font-weight: 600;">WoW</td>
      </tr>
      <tr>
        <td style="padding: 12px;">Agent Runs</td>
        <td style="padding: 12px; text-align: right;">${data.totalAgentRuns}</td>
        <td style="padding: 12px; text-align: right; color: ${deltaColor(data.totalAgentRuns, data.previousWeekRuns)};">${delta(data.totalAgentRuns, data.previousWeekRuns)}</td>
      </tr>
      <tr style="background: #f5f5f5;">
        <td style="padding: 12px;">AI Cost</td>
        <td style="padding: 12px; text-align: right;">$${data.totalCost.toFixed(2)}</td>
        <td style="padding: 12px; text-align: right; color: ${deltaColor(data.totalCost, data.previousWeekCost, true)};">${delta(data.totalCost, data.previousWeekCost)}</td>
      </tr>
      <tr>
        <td style="padding: 12px;">Leads</td>
        <td style="padding: 12px; text-align: right;">${data.leadsTotal}</td>
        <td style="padding: 12px; text-align: right; color: ${deltaColor(data.leadsTotal, data.previousWeekLeads)};">${delta(data.leadsTotal, data.previousWeekLeads)}</td>
      </tr>
      <tr style="background: #f5f5f5;">
        <td style="padding: 12px;">Pipeline Value</td>
        <td style="padding: 12px; text-align: right;">$${data.pipelineValue.toFixed(0)}</td>
        <td style="padding: 12px; text-align: right; color: ${deltaColor(data.pipelineValue, data.previousWeekPipeline)};">${delta(data.pipelineValue, data.previousWeekPipeline)}</td>
      </tr>
    </table>

    ${data.topAgents.length > 0 ? `
    <h3 style="margin-bottom: 10px;">Top Agents</h3>
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
      <tr style="background: #f5f5f5;">
        <th style="padding: 8px; text-align: left;">Agent</th>
        <th style="padding: 8px; text-align: right;">Runs</th>
        <th style="padding: 8px; text-align: right;">Success</th>
      </tr>
      ${agentRows}
    </table>
    ` : ''}

    <p>
      <a href="${dashboardUrl}/analytics" style="display: inline-block; background: #007bff; color: white; padding: 10px 20px; border-radius: 4px; text-decoration: none; font-weight: 500;">
        View Full Analytics
      </a>
    </p>
  `)

  return sendEmail(to, `Bitbit Weekly Report: ${data.weekStart} - ${data.weekEnd}`, html)
}

export interface AlertEscalationDetails {
  alertId: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  summary: string
  source: string
  timestamp: string
}

export async function sendAlertEscalationEmail(
  to: string,
  details: AlertEscalationDetails,
): Promise<boolean> {
  const dashboardUrl = getDashboardUrl()
  const severityColor = details.severity === 'critical' ? '#dc2626'
    : details.severity === 'high' ? '#ea580c'
    : details.severity === 'medium' ? '#d97706'
    : '#6b7280'

  const html = wrapHtml(`
    <h2 style="color: #1a1a1a; margin-bottom: 20px;">Alert Escalation</h2>
    <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid ${severityColor};">
      <p style="margin: 0 0 10px 0;">
        <strong>Severity:</strong>
        <span style="color: ${severityColor}; font-weight: bold;">${details.severity.toUpperCase()}</span>
      </p>
      <p style="margin: 0 0 10px 0;"><strong>Source:</strong> ${details.source}</p>
      <p style="margin: 0 0 10px 0;"><strong>Alert:</strong> ${details.summary}</p>
      <p style="margin: 0;"><strong>Time:</strong> ${details.timestamp}</p>
    </div>
    <p style="margin-bottom: 20px;">
      <a href="${dashboardUrl}/alerts/${details.alertId}" style="display: inline-block; background: ${severityColor}; color: white; padding: 10px 20px; border-radius: 4px; text-decoration: none; font-weight: 500;">
        View Alert
      </a>
    </p>
  `)

  return sendEmail(
    to,
    `[${details.severity.toUpperCase()}] Alert: ${details.summary}`,
    html,
  )
}
