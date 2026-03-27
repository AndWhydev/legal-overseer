'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { FileText, Download, Loader2, RefreshCw } from 'lucide-react'
import { TabShell } from '@/components/ui/tab-shell'
import { EmptyState } from '@/components/ui/empty-state'
import { S, C } from '@/lib/styles/design-tokens'
import { GlassDropdown } from '@/components/ui/glass-dropdown'
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
    ...S.card,
    overflow: 'hidden' as const,
  }

  const glassSelect: React.CSSProperties = {
    padding: '12px 16px',
    borderRadius: 12,
    background: C.bgInput,
    border: `1px solid ${C.borderSubtle}`,
    color: C.textPrimary,
    fontSize: 14,
    outline: 'none' as const,
    appearance: 'none' as const,
    cursor: 'pointer',
    transition: 'border-color 200ms, box-shadow 200ms',
  }

  const accentBtn: React.CSSProperties = {
    height: 40,
    padding: '0 20px',
    borderRadius: 8,
    background: 'var(--btn-primary-bg, #F1F5F9)',
    border: 'none',
    color: 'var(--btn-primary-fg, #0a0f1a)',
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 200ms',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
  }

  const ghostBtn: React.CSSProperties = {
    padding: '8px 16px',
    borderRadius: 12,
    background: 'transparent',
    border: '1px solid var(--glass-interactive-border)',
    color: 'var(--text-primary)',
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 200ms',
  }

  const sectionHeader: React.CSSProperties = {
    fontSize: 14,
    fontWeight: 500,
    letterSpacing: '0.04em',
    textTransform: 'uppercase' as const,
    color: 'var(--text-dim)',
    marginBottom: 12,
  }

  const listRow: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    padding: '12px 20px',
    borderRadius: 12,
    background: 'var(--glass-pill-bg)',
    backdropFilter: 'var(--glass-blur)',
    WebkitBackdropFilter: 'var(--glass-blur)',
    boxShadow: 'var(--card-shadow), var(--card-inset)',
    border: 'none',
    transition: 'background 200ms',
  }

  return (
    <TabShell>
      <div style={{ maxWidth: 960, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Controls Section */}
        <div>
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
              <GlassDropdown
                options={Object.entries(REPORT_LABELS).map(([k, v]) => ({ value: k, label: v }))}
                value={reportType}
                onChange={v => setReportType(v as ReportType)}
              />
            </div>

            <div style={{ flex: 1, minWidth: 160 }}>
              <label style={sectionHeader}>
                Period
              </label>
              <GlassDropdown
                options={periods.map((p, i) => ({ value: String(i), label: p.label }))}
                value={String(periodIndex)}
                onChange={v => setPeriodIndex(Number(v))}
              />
            </div>

            <button
              onClick={handleGenerate}
              disabled={generating}
              onMouseEnter={(e) => {
                if (!generating) {
                  (e.target as HTMLButtonElement).style.background = 'var(--btn-primary-hover, #E2E8F0)'
                  ;(e.target as HTMLButtonElement).style.transform = 'translateY(-1px)'
                }
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLButtonElement).style.background = 'var(--btn-primary-bg, #F1F5F9)'
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
          <div>
            <div style={sectionHeader}>Report Preview</div>
            <div style={{ marginBottom: '12px' }}>
              <button
                onClick={handlePrintPreview}
                onMouseEnter={(e) => {
                  (e.target as HTMLButtonElement).style.background = C.bgHover
                  ;(e.target as HTMLButtonElement).style.borderColor = C.borderHover
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLButtonElement).style.background = 'transparent'
                  ;(e.target as HTMLButtonElement).style.borderColor = C.borderVisible
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
                (e.target as HTMLButtonElement).style.color = 'var(--text-primary)'
                ;(e.target as HTMLButtonElement).style.opacity = '0.7'
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLButtonElement).style.color = 'var(--text-secondary)'
                ;(e.target as HTMLButtonElement).style.opacity = '1'
              }}
              style={{
                padding: '8px',
                background: 'none',
                border: 'none',
                color: 'var(--text-secondary)',
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
            <EmptyState
              title="No reports generated"
              description="Monthly and weekly reports will appear here after the first full week"
            />
          ) : (
            <div className="bb-stagger" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {reports.map(r => (
                <div
                  key={r.id}
                  onMouseEnter={() => setHoveredRowId(r.id)}
                  onMouseLeave={() => setHoveredRowId(null)}
                  style={{
                    ...listRow,
                    background: hoveredRowId === r.id ? 'var(--bb-surface-hover)' : 'var(--glass-pill-bg)',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontSize: 14,
                      fontWeight: 500,
                      color: 'var(--text-primary)',
                      marginBottom: '4px',
                    }}>
                      {REPORT_LABELS[r.report_type as ReportType] ?? r.report_type}
                    </div>
                    <div style={{
                      fontSize: 14,
                      color: 'var(--text-secondary)',
                    }}>
                      Period: {r.period_from ?? '-'} • Generated: {new Date(r.created_at).toLocaleDateString('en-AU')}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDownload(r.id)}
                    onMouseEnter={(e) => {
                      (e.target as HTMLButtonElement).style.background = C.bgHover
                      ;(e.target as HTMLButtonElement).style.borderColor = C.borderHover
                    }}
                    onMouseLeave={(e) => {
                      (e.target as HTMLButtonElement).style.background = 'transparent'
                      ;(e.target as HTMLButtonElement).style.borderColor = C.borderVisible
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
