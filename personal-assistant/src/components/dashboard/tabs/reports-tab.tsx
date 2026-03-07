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
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null)

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

  const glassCard: React.CSSProperties = {
    padding: '20px',
    borderRadius: 16,
    background: 'rgba(15, 20, 30, 0.6)',
    backdropFilter: 'blur(20px) saturate(1.2)',
    WebkitBackdropFilter: 'blur(20px) saturate(1.2)',
    border: '1px solid rgba(255, 255, 255, 0.03)',
    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
  }

  const glassSelect: React.CSSProperties = {
    padding: '10px 14px',
    borderRadius: 10,
    background: 'rgba(13, 17, 23, 0.6)',
    border: '1px solid rgba(255, 255, 255, 0.05)',
    color: 'var(--text-primary, #F1F5F9)',
    fontSize: 14,
    outline: 'none' as const,
    appearance: 'none' as const,
    cursor: 'pointer',
    transition: 'border-color 200ms, box-shadow 200ms',
  }

  const accentBtn: React.CSSProperties = {
    padding: '8px 16px',
    borderRadius: 10,
    background: '#FF5A1F',
    border: 'none',
    color: '#000',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 200ms',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  }

  const ghostBtn: React.CSSProperties = {
    padding: '8px 16px',
    borderRadius: 10,
    background: 'transparent',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    color: 'var(--text-primary, #F1F5F9)',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 200ms',
  }

  const sectionHeader: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    color: 'var(--text-dim, #475569)',
    marginBottom: 12,
  }

  const listRow: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    padding: '12px 18px',
    borderRadius: 12,
    background: 'rgba(10, 14, 23, 0.5)',
    backdropFilter: 'blur(26px) saturate(1.15)',
    WebkitBackdropFilter: 'blur(26px) saturate(1.15)',
    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
    border: 'none',
    transition: 'background 200ms',
  }

  return (
    <TabShell>
      <div style={{ padding: '24px', maxWidth: 960, margin: '0 auto' }}>
        {/* Controls Section */}
        <div style={{ marginBottom: '28px' }}>
          <div style={sectionHeader}>Report Configuration</div>
          <div style={{
            ...glassCard,
            display: 'flex',
            gap: '16px',
            flexWrap: 'wrap',
            alignItems: 'flex-end',
          }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <label style={sectionHeader}>
                Report Type
              </label>
              <select
                value={reportType}
                onChange={e => setReportType(e.target.value as ReportType)}
                style={glassSelect}
              >
                {Object.entries(REPORT_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>

            <div style={{ flex: 1, minWidth: 160 }}>
              <label style={sectionHeader}>
                Period
              </label>
              <select
                value={periodIndex}
                onChange={e => setPeriodIndex(Number(e.target.value))}
                style={glassSelect}
              >
                {periods.map((p, i) => (
                  <option key={i} value={i}>{p.label}</option>
                ))}
              </select>
            </div>

            <button
              onClick={handleGenerate}
              disabled={generating}
              onMouseEnter={(e) => {
                if (!generating) {
                  (e.target as HTMLButtonElement).style.background = '#FF7A45'
                  ;(e.target as HTMLButtonElement).style.transform = 'translateY(-1px)'
                }
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLButtonElement).style.background = '#FF5A1F'
                ;(e.target as HTMLButtonElement).style.transform = 'translateY(0)'
              }}
              style={{
                ...accentBtn,
                opacity: generating ? 0.7 : 1,
                cursor: generating ? 'wait' : 'pointer',
              }}
            >
              {generating ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
              {generating ? 'Generating...' : 'Generate Report'}
            </button>
          </div>
        </div>

        {/* Preview Section */}
        {previewHtml && (
          <div style={{ marginBottom: '28px' }}>
            <div style={sectionHeader}>Report Preview</div>
            <div style={{ marginBottom: '12px' }}>
              <button
                onClick={handlePrintPreview}
                onMouseEnter={(e) => {
                  (e.target as HTMLButtonElement).style.background = 'rgba(255, 255, 255, 0.04)'
                  ;(e.target as HTMLButtonElement).style.borderColor = 'rgba(255, 255, 255, 0.1)'
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLButtonElement).style.background = 'transparent'
                  ;(e.target as HTMLButtonElement).style.borderColor = 'rgba(255, 255, 255, 0.06)'
                }}
                style={{
                  ...ghostBtn,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <Download size={14} /> Download PDF
              </button>
            </div>
            <div
              style={{
                ...glassCard,
                overflow: 'hidden',
                maxHeight: '600px',
                overflowY: 'auto',
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

        {/* History Section */}
        <div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
          }}>
            <div style={{ ...sectionHeader, marginBottom: 0 }}>
              Generated Reports
            </div>
            <button
              onClick={fetchReports}
              onMouseEnter={(e) => {
                (e.target as HTMLButtonElement).style.color = 'var(--text-primary, #F1F5F9)'
                ;(e.target as HTMLButtonElement).style.opacity = '0.7'
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLButtonElement).style.color = 'var(--text-secondary, #94A3B8)'
                ;(e.target as HTMLButtonElement).style.opacity = '1'
              }}
              style={{
                padding: '6px',
                background: 'none',
                border: 'none',
                color: 'var(--text-secondary, #94A3B8)',
                cursor: 'pointer',
                transition: 'color 200ms, opacity 200ms',
              }}
              aria-label="Refresh"
            >
              <RefreshCw size={16} />
            </button>
          </div>

          {loading ? (
            <div style={{
              ...glassCard,
              display: 'flex',
              flexDirection: 'column' as const,
              alignItems: 'center',
              justifyContent: 'center',
              padding: '60px 20px',
              gap: 12,
            }}>
              <Loader2 size={32} style={{ color: 'var(--text-dim)' }} className="animate-spin" />
              <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Loading reports...</span>
            </div>
          ) : reports.length === 0 ? (
            <div style={{
              ...glassCard,
              display: 'flex',
              flexDirection: 'column' as const,
              alignItems: 'center',
              justifyContent: 'center',
              padding: '60px 20px',
              gap: 12,
            }}>
              <FileText size={32} style={{ color: 'var(--text-dim)' }} />
              <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                No reports generated yet. Select a report type and period above to get started.
              </span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {reports.map(r => (
                <div
                  key={r.id}
                  onMouseEnter={() => setHoveredRowId(r.id)}
                  onMouseLeave={() => setHoveredRowId(null)}
                  style={{
                    ...listRow,
                    background: hoveredRowId === r.id ? 'rgba(20, 28, 40, 0.7)' : 'rgba(10, 14, 23, 0.5)',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontSize: 14,
                      fontWeight: 500,
                      color: 'var(--text-primary, #F1F5F9)',
                      marginBottom: '4px',
                    }}>
                      {REPORT_LABELS[r.report_type as ReportType] ?? r.report_type}
                    </div>
                    <div style={{
                      fontSize: 12,
                      color: 'var(--text-secondary, #94A3B8)',
                    }}>
                      Period: {r.period_from ?? '-'} • Generated: {new Date(r.created_at).toLocaleDateString('en-AU')}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDownload(r.id)}
                    onMouseEnter={(e) => {
                      (e.target as HTMLButtonElement).style.background = 'rgba(255, 255, 255, 0.04)'
                      ;(e.target as HTMLButtonElement).style.borderColor = 'rgba(255, 255, 255, 0.1)'
                    }}
                    onMouseLeave={(e) => {
                      (e.target as HTMLButtonElement).style.background = 'transparent'
                      ;(e.target as HTMLButtonElement).style.borderColor = 'rgba(255, 255, 255, 0.06)'
                    }}
                    style={{
                      ...ghostBtn,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <Download size={14} /> View
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </TabShell>
  )
}
