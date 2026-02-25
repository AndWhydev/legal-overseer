import type { ReportData, MonthlyReportData, AgentROIReportData, PipelineReportData } from './generator'

// ─── HTML → PDF Report Generation ───────────────────────────────────────────
// Uses inline HTML rendered to a Buffer. In production, pair with a headless
// renderer (puppeteer / @react-pdf) or return HTML for client-side printing.

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function formatCurrency(n: number): string {
  return `$${n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatPercent(n: number): string {
  return `${(n * 100).toFixed(1)}%`
}

// ─── Shared styles ───────────────────────────────────────────────────────────

const STYLES = `
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 40px; color: #1a1a2e; }
  .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #ff6b35; padding-bottom: 16px; margin-bottom: 32px; }
  .header h1 { font-size: 24px; margin: 0; color: #1a1a2e; }
  .header .meta { text-align: right; font-size: 12px; color: #666; }
  .logo { font-size: 28px; font-weight: 800; color: #ff6b35; letter-spacing: -1px; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  th { background: #1a1a2e; color: #fff; padding: 8px 12px; text-align: left; font-size: 12px; text-transform: uppercase; }
  td { padding: 8px 12px; border-bottom: 1px solid #e5e5e5; font-size: 13px; }
  tr:nth-child(even) td { background: #f8f8f8; }
  .section { margin-bottom: 28px; }
  .section h2 { font-size: 16px; color: #1a1a2e; border-bottom: 1px solid #ddd; padding-bottom: 6px; }
  .kpi-row { display: flex; gap: 16px; margin-bottom: 24px; }
  .kpi { flex: 1; background: #f0f0f0; border-radius: 8px; padding: 16px; text-align: center; }
  .kpi .value { font-size: 28px; font-weight: 700; color: #ff6b35; }
  .kpi .label { font-size: 11px; color: #666; text-transform: uppercase; margin-top: 4px; }
  .footer { margin-top: 40px; text-align: center; font-size: 10px; color: #999; border-top: 1px solid #eee; padding-top: 12px; }
`

// ─── Template Renderers ──────────────────────────────────────────────────────

function renderMonthlyReport(data: MonthlyReportData): string {
  const monthLabel = new Date(data.month + '-01').toLocaleDateString('en-AU', { year: 'numeric', month: 'long' })

  return `
    <div class="kpi-row">
      <div class="kpi"><div class="value">${formatCurrency(data.revenue.totalPaid)}</div><div class="label">Revenue Collected</div></div>
      <div class="kpi"><div class="value">${formatCurrency(data.revenue.totalOutstanding)}</div><div class="label">Outstanding</div></div>
      <div class="kpi"><div class="value">${data.agentActivity.totalRuns}</div><div class="label">Agent Runs</div></div>
      <div class="kpi"><div class="value">${formatPercent(data.agentActivity.successRate)}</div><div class="label">Success Rate</div></div>
    </div>

    <div class="section">
      <h2>Pipeline by Stage</h2>
      <table><tr><th>Stage</th><th>Count</th><th>Value</th></tr>
      ${data.pipeline.map(p => `<tr><td>${escapeHtml(p.stage)}</td><td>${p.count}</td><td>${formatCurrency(p.value)}</td></tr>`).join('')}
      </table>
    </div>

    <div class="section">
      <h2>Agent Activity</h2>
      <table><tr><th>Agent</th><th>Runs</th><th>Cost</th><th>Success Rate</th></tr>
      ${data.agentActivity.byAgent.map(a => `<tr><td>${escapeHtml(a.agent)}</td><td>${a.runs}</td><td>${formatCurrency(a.cost)}</td><td>${formatPercent(a.successRate)}</td></tr>`).join('')}
      </table>
    </div>

    <div class="section">
      <h2>Channel Volume</h2>
      <table><tr><th>Channel</th><th>Messages</th></tr>
      ${data.channelVolume.map(c => `<tr><td>${escapeHtml(c.channel)}</td><td>${c.messageCount}</td></tr>`).join('')}
      </table>
    </div>

    <div class="section">
      <h2>Top Clients</h2>
      <table><tr><th>Client</th><th>Revenue</th><th>Interactions</th></tr>
      ${data.topClients.map(c => `<tr><td>${escapeHtml(c.name)}</td><td>${formatCurrency(c.revenue)}</td><td>${c.interactions}</td></tr>`).join('')}
      </table>
    </div>
  `
}

function renderAgentROIReport(data: AgentROIReportData): string {
  return `
    <div class="kpi-row">
      <div class="kpi"><div class="value">${formatCurrency(data.totals.totalCost)}</div><div class="label">Total Agent Cost</div></div>
      <div class="kpi"><div class="value">${Math.round(data.totals.totalTimeSavedMinutes / 60)}h</div><div class="label">Time Saved</div></div>
      <div class="kpi"><div class="value">${formatPercent(data.totals.overallROI)}</div><div class="label">Overall ROI</div></div>
    </div>

    <div class="section">
      <h2>Per-Agent Breakdown</h2>
      <table><tr><th>Agent</th><th>Runs</th><th>Cost</th><th>Actions</th><th>Time Saved</th><th>ROI</th></tr>
      ${data.agents.map(a => `<tr><td>${escapeHtml(a.name)}</td><td>${a.runs}</td><td>${formatCurrency(a.cost)}</td><td>${a.actionsTaken}</td><td>${Math.round(a.estimatedTimeSavedMinutes)}m</td><td>${formatPercent(a.roi)}</td></tr>`).join('')}
      </table>
    </div>
  `
}

function renderPipelineReport(data: PipelineReportData): string {
  return `
    <div class="kpi-row">
      <div class="kpi"><div class="value">${data.proposalConversion.sent}</div><div class="label">Proposals Sent</div></div>
      <div class="kpi"><div class="value">${data.proposalConversion.accepted}</div><div class="label">Accepted</div></div>
      <div class="kpi"><div class="value">${formatPercent(data.proposalConversion.rate)}</div><div class="label">Conversion Rate</div></div>
    </div>

    <div class="section">
      <h2>Lead Funnel</h2>
      <table><tr><th>Stage</th><th>Count</th><th>Value</th><th>% of Total</th></tr>
      ${data.funnel.map(f => `<tr><td>${escapeHtml(f.stage)}</td><td>${f.count}</td><td>${formatCurrency(f.value)}</td><td>${formatPercent(f.conversionRate)}</td></tr>`).join('')}
      </table>
    </div>

    <div class="section">
      <h2>Invoice Aging</h2>
      <table><tr><th>Bucket</th><th>Count</th><th>Total Amount</th></tr>
      ${data.invoiceAging.map(b => `<tr><td>${escapeHtml(b.bucket)}</td><td>${b.count}</td><td>${formatCurrency(b.totalAmount)}</td></tr>`).join('')}
      </table>
    </div>
  `
}

// ─── Main export ─────────────────────────────────────────────────────────────

const TITLES: Record<string, string> = {
  monthly: 'Monthly Summary Report',
  'agent-roi': 'Agent ROI Report',
  pipeline: 'Pipeline Report',
}

export function generateReportHTML(reportData: ReportData, orgName = 'BitBit'): string {
  const title = TITLES[reportData.type] ?? 'Report'
  const dateStr = new Date(reportData.generatedAt).toLocaleDateString('en-AU', {
    year: 'numeric', month: 'long', day: 'numeric',
  })

  let body = ''
  switch (reportData.type) {
    case 'monthly': body = renderMonthlyReport(reportData); break
    case 'agent-roi': body = renderAgentROIReport(reportData); break
    case 'pipeline': body = renderPipelineReport(reportData); break
  }

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${STYLES}</style></head>
<body>
  <div class="header">
    <div><div class="logo">${escapeHtml(orgName)}</div><h1>${escapeHtml(title)}</h1></div>
    <div class="meta">Generated ${escapeHtml(dateStr)}</div>
  </div>
  ${body}
  <div class="footer">Generated by BitBit AI Operations Platform</div>
</body>
</html>`
}

export async function generateReportPDF(
  reportData: ReportData,
  orgName = 'BitBit',
): Promise<Buffer> {
  const html = generateReportHTML(reportData, orgName)
  // Return HTML as a buffer — in production, pipe through puppeteer or wkhtmltopdf
  // For now, the HTML is print-optimized and can be rendered client-side via window.print()
  return Buffer.from(html, 'utf-8')
}
