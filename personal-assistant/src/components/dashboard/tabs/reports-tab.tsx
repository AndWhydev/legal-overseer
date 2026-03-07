'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { FileText, Download, Loader2, RefreshCw } from 'lucide-react'
import { TabShell } from '@/components/ui/tab-shell'
import { logger } from '@/lib/core/logger';

type ReportType = 'monthly' | 'agent-roi' | 'pipeline'

interface GeneratedReport {
  id: string
  report_type: string
  period_from: string | null
  period_to: string | null
  created_at: string
}

const REPORT_LABELS: Record<ReportType, string> = {
  monthly: 'Monthly Summary',
  'agent-roi': 'Agent ROI',
  pipeline: 'Pipeline',
}

function getPeriodOptions() {
  const now = new Date()
  const options: { label: string; value: { month?: string; from?: string; to?: string } }[] = []

  // Last 6 months
  for (let i = 1; i <= 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    options.push({
      label: d.toLocaleDateString('en-AU', { year: 'numeric', month: 'long' }),
      value: { month },
    })
  }

  // Last quarter
  const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 - 3, 1)
  const qEnd = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)
  options.push({
    label: 'Last Quarter',
    value: { from: qStart.toISOString(), to: qEnd.toISOString() },
  })

  return options
}

export default function ReportsTab() {
  const [reportType, setReportType] = useState<ReportType>('monthly')
  const [periodIndex, setPeriodIndex] = useState(0)
  const [generating, setGenerating] = useState(false)
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [reports, setReports] = useState<GeneratedReport[]>([])
  const [loading, setLoading] = useState(true)

  const periods = getPeriodOptions()

  const fetchReports = useCallback(async () => {
    try {
      const res = await fetch('/api/reports')
      const data = await res.json()
      setReports(data.reports ?? [])
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchReports() }, [fetchReports])

  const handleGenerate = async () => {
    setGenerating(true)
    setPreviewHtml(null)
    try {
      const period = periods[periodIndex]?.value ?? {}
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report_type: reportType, period }),
      })
      const data = await res.json()

      if (data.success && data.url) {
        // Fetch HTML for preview
        const htmlRes = await fetch(data.url)
        const html = await htmlRes.text()
        setPreviewHtml(html)
      }

      fetchReports()
    } catch (err) {
      logger.error('Report generation failed:', err)
    } finally {
      setGenerating(false)
    }
  }

  const handleDownload = async (id: string) => {
    try {
      const res = await fetch(`/api/reports?id=${id}`)
      const data = await res.json()
      if (data.download_url) {
        window.open(data.download_url, '_blank')
      }
    } catch {
      // silent
    }
  }

  const handlePrintPreview = () => {
    if (!previewHtml) return
    const win = window.open('', '_blank')
    if (win) {
      win.document.write(previewHtml)
      win.document.close()
      setTimeout(() => win.print(), 500)
    }
  }

  return (
    <TabShell>
      <div style={{ padding: '24px', maxWidth: 960, margin: '0 auto' }}>
        {/* Controls */}
        <div style={{
          display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'end',
          marginBottom: '24px', padding: '20px', background: 'var(--bg-elevated)', borderRadius: '12px',
        }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase' }}>
              Report Type
            </label>
            <select
              value={reportType}
              onChange={e => setReportType(e.target.value as ReportType)}
              style={{
                width: '100%', padding: '8px 12px', borderRadius: '8px',
                background: 'var(--bg-primary)', color: 'var(--text-primary)',
                border: '1px solid var(--border)', fontSize: '14px',
              }}
            >
              {Object.entries(REPORT_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          <div style={{ flex: 1, minWidth: 160 }}>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase' }}>
              Period
            </label>
            <select
              value={periodIndex}
              onChange={e => setPeriodIndex(Number(e.target.value))}
              style={{
                width: '100%', padding: '8px 12px', borderRadius: '8px',
                background: 'var(--bg-primary)', color: 'var(--text-primary)',
                border: '1px solid var(--border)', fontSize: '14px',
              }}
            >
              {periods.map((p, i) => (
                <option key={i} value={i}>{p.label}</option>
              ))}
            </select>
          </div>

          <button
            onClick={handleGenerate}
            disabled={generating}
            style={{
              padding: '8px 20px', borderRadius: '8px', border: 'none',
              background: '#ff6b35', color: '#fff', fontWeight: 600,
              fontSize: '14px', cursor: generating ? 'wait' : 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px',
              opacity: generating ? 0.7 : 1,
            }}
          >
            {generating ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
            {generating ? 'Generating...' : 'Generate Report'}
          </button>
        </div>

        {/* Preview */}
        {previewHtml && (
          <div style={{ marginBottom: '24px' }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: '12px',
            }}>
              <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Report Preview
              </h2>
              <button
                onClick={handlePrintPreview}
                style={{
                  padding: '6px 14px', borderRadius: '6px', border: '1px solid var(--border)',
                  background: 'var(--bg-elevated)', color: 'var(--text-primary)',
                  fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
                }}
              >
                <Download size={14} /> Download PDF
              </button>
            </div>
            <div
              style={{
                border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden',
                background: '#fff', maxHeight: '600px', overflowY: 'auto',
              }}
            >
              <iframe
                srcDoc={previewHtml}
                title="Report Preview"
                style={{ width: '100%', height: '560px', border: 'none' }}
              />
            </div>
          </div>
        )}

        {/* History */}
        <div>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: '12px',
          }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Generated Reports
            </h2>
            <button
              onClick={fetchReports}
              style={{
                padding: '4px', background: 'none', border: 'none',
                color: 'var(--text-secondary)', cursor: 'pointer',
              }}
              aria-label="Refresh"
            >
              <RefreshCw size={16} />
            </button>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
              Loading...
            </div>
          ) : reports.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '40px', color: 'var(--text-secondary)',
              background: 'var(--bg-elevated)', borderRadius: '12px',
            }}>
              No reports generated yet. Select a report type and period above to get started.
            </div>
          ) : (
            <div style={{
              background: 'var(--bg-elevated)', borderRadius: '12px', overflow: 'hidden',
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Type</th>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Period</th>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Generated</th>
                    <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: '12px', color: 'var(--text-secondary)' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map(r => (
                    <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 16px', fontSize: '14px', color: 'var(--text-primary)' }}>
                        {REPORT_LABELS[r.report_type as ReportType] ?? r.report_type}
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: '14px', color: 'var(--text-secondary)' }}>
                        {r.period_from ?? '-'}
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                        {new Date(r.created_at).toLocaleDateString('en-AU')}
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                        <button
                          onClick={() => handleDownload(r.id)}
                          style={{
                            padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--border)',
                            background: 'none', color: 'var(--text-primary)',
                            fontSize: '12px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px',
                          }}
                        >
                          <Download size={12} /> View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </TabShell>
  )
}
