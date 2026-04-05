'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { IconFileText, IconDownload, IconLoader2, IconRefresh } from '@tabler/icons-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { logger } from '@/lib/core/logger'

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

  for (let i = 1; i <= 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    options.push({
      label: d.toLocaleDateString('en-AU', { year: 'numeric', month: 'long' }),
      value: { month },
    })
  }

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
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Report Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex min-w-40 flex-1 flex-col gap-2">
              <Label>Report Type</Label>
              <Select value={reportType} onValueChange={(v) => setReportType(v as ReportType)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(REPORT_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex min-w-40 flex-1 flex-col gap-2">
              <Label>Period</Label>
              <Select value={String(periodIndex)} onValueChange={(v) => setPeriodIndex(Number(v))}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {periods.map((p, i) => (
                    <SelectItem key={i} value={String(i)}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button onClick={handleGenerate} disabled={generating} className="gap-2">
              {generating ? <IconLoader2 className="size-4 animate-spin" /> : <IconFileText className="size-4" />}
              {generating ? 'Generating...' : 'Generate Report'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Preview */}
      {previewHtml && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-medium uppercase tracking-wider text-muted-foreground">Report Preview</h2>
            <Button variant="outline" size="sm" onClick={handlePrintPreview} className="gap-1.5">
              <IconDownload className="size-3.5" /> Download PDF
            </Button>
          </div>
          <Card>
            <CardContent className="overflow-hidden p-0">
              <iframe
                srcDoc={previewHtml}
                title="Report Preview"
                className="h-[560px] w-full border-0"
              />
            </CardContent>
          </Card>
        </div>
      )}

      {/* History */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-medium uppercase tracking-wider text-muted-foreground">Generated Reports</h2>
          <Button variant="ghost" size="icon-sm" onClick={() => fetchReports()} aria-label="Refresh">
            <IconRefresh className="size-4" />
          </Button>
        </div>

        {loading ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-3 py-16">
              <IconLoader2 className="size-8 animate-spin text-muted-foreground" />
              <span className="text-base text-muted-foreground">Loading reports...</span>
            </CardContent>
          </Card>
        ) : reports.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon"><IconFileText /></EmptyMedia>
              <EmptyTitle>No reports generated</EmptyTitle>
              <EmptyDescription>Monthly and weekly reports will appear here after the first full week</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="flex flex-col gap-2">
            {reports.map((r) => (
              <Card key={r.id} className="py-3">
                <CardContent className="flex items-center justify-between py-0">
                  <div>
                    <div className="text-base font-medium">
                      {REPORT_LABELS[r.report_type as ReportType] ?? r.report_type}
                    </div>
                    <div className="text-base text-muted-foreground">
                      Period: {r.period_from ?? '-'} &middot; Generated: {new Date(r.created_at).toLocaleDateString('en-AU')}
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => handleDownload(r.id)} className="gap-1.5">
                    <IconDownload className="size-3.5" /> View
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
