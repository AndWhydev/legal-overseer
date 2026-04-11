import type { BenchmarkReport } from './benchmark'

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

export function generateBenchmarkHtml(report: BenchmarkReport): string {
  const agentRows = report.agents
    .map((a) => {
      const accuracy = a.accuracy !== undefined ? `${(a.accuracy * 100).toFixed(1)}%` : 'N/A'
      const results = Object.entries(a.results)
        .map(([k, v]) => `<span class="tag">${escapeHtml(k)}: ${escapeHtml(String(v))}</span>`)
        .join(' ')

      return `
      <tr>
        <td><strong>${escapeHtml(a.agent)}</strong></td>
        <td>${formatMs(a.durationMs)}</td>
        <td>${a.itemsProcessed}</td>
        <td>${accuracy}</td>
        <td>${results}</td>
      </tr>`
    })
    .join('\n')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BitBit Benchmark Report</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #e5e5e5; padding: 2rem; }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    .meta { color: #888; font-size: 0.85rem; margin-bottom: 1.5rem; }
    .meta span { margin-right: 1.5rem; }
    .card { background: #141414; border: 1px solid #262626; border-radius: 8px; padding: 1.25rem; margin-bottom: 1rem; }
    .card h2 { font-size: 1rem; margin-bottom: 0.75rem; color: #a3a3a3; }
    .seed-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 0.75rem; }
    .seed-item { text-align: center; }
    .seed-item .value { font-size: 1.5rem; font-weight: 700; color: #fff; }
    .seed-item .label { font-size: 0.75rem; color: #737373; text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    th { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid #262626; color: #737373; font-weight: 500; text-transform: uppercase; font-size: 0.75rem; }
    td { padding: 0.5rem 0.75rem; border-bottom: 1px solid #1a1a1a; }
    .tag { display: inline-block; background: #1a1a1a; border: 1px solid #333; border-radius: 4px; padding: 0.1rem 0.4rem; font-size: 0.75rem; margin: 0.1rem; }
    .total { font-size: 1.25rem; font-weight: 700; color: #22c55e; }
  </style>
</head>
<body>
  <h1>BitBit Benchmark Report</h1>
  <div class="meta">
    <span>Run: ${escapeHtml(report.runId.slice(0, 8))}</span>
    <span>Started: ${escapeHtml(report.startedAt)}</span>
    <span>Total: <span class="total">${formatMs(report.totalDurationMs)}</span></span>
  </div>

  <div class="card">
    <h2>Seed Data</h2>
    <div class="seed-grid">
      <div class="seed-item"><div class="value">${report.seedSummary.contacts}</div><div class="label">Contacts</div></div>
      <div class="seed-item"><div class="value">${report.seedSummary.messages}</div><div class="label">Messages</div></div>
      <div class="seed-item"><div class="value">${report.seedSummary.invoices}</div><div class="label">Invoices</div></div>
      <div class="seed-item"><div class="value">${report.seedSummary.proposals}</div><div class="label">Proposals</div></div>
      <div class="seed-item"><div class="value">${report.seedSummary.watches}</div><div class="label">Watches</div></div>
    </div>
  </div>

  <div class="card">
    <h2>Agent Results</h2>
    <table>
      <thead>
        <tr>
          <th>Agent</th>
          <th>Duration</th>
          <th>Processed</th>
          <th>Accuracy</th>
          <th>Details</th>
        </tr>
      </thead>
      <tbody>
        ${agentRows}
      </tbody>
    </table>
  </div>
</body>
</html>`
}
