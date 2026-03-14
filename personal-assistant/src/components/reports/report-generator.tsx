'use client'

import { useState, useMemo } from 'react'
import { FileText, Loader2 } from 'lucide-react'
import { useToast } from '@/components/ui/toast'

type ReportType = 'monthly' | 'agent-roi' | 'pipeline'

interface ReportGeneratorProps {
  onGenerateStart?: () => void
  onGenerateComplete?: () => void
}

const REPORT_TYPES: Array<{ value: ReportType; label: string }> = [
  { value: 'monthly', label: 'Monthly Summary' },
  { value: 'agent-roi', label: 'Agent ROI' },
  { value: 'pipeline', label: 'Pipeline' },
]

function getPeriodOptions() {
  const now = new Date()
  const options: Array<{ label: string; value: { month?: string; from?: string; to?: string } }> = []

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

export function ReportGenerator({ onGenerateStart, onGenerateComplete }: ReportGeneratorProps) {
  const { toast } = useToast()
  const [reportType, setReportType] = useState<ReportType>('monthly')
  const [periodIndex, setPeriodIndex] = useState(0)
  const [isGenerating, setIsGenerating] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const periods = useMemo(() => getPeriodOptions(), [])

  async function handleGenerate() {
    if (isGenerating) return

    setIsGenerating(true)
    setStatusMessage(null)
    setError(null)
    onGenerateStart?.()

    try {
      const period = periods[periodIndex]?.value ?? {}
      const response = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report_type: reportType, period }),
      })

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? 'Failed to generate report')
      }

      const data = (await response.json()) as { success?: boolean; url?: string }
      if (data.success) {
        setStatusMessage(`${reportType} report generated successfully`)
        toast('success', 'Report generated successfully')
      } else {
        throw new Error('Report generation failed')
      }

      onGenerateComplete?.()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate report'
      setError(message)
      toast('error', message)
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-4 text-sm font-semibold text-foreground">Generate New Report</h3>

        <div className="grid gap-3 sm:grid-cols-3 sm:items-end">
          {/* Report Type Selector */}
          <div>
            <label htmlFor="report-type" className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase">
              Report Type
            </label>
            <select
              id="report-type"
              value={reportType}
              onChange={(e) => setReportType(e.target.value as ReportType)}
              disabled={isGenerating}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground hover:border-border/80 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
            >
              {REPORT_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          {/* Period Selector */}
          <div>
            <label htmlFor="period" className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase">
              Period
            </label>
            <select
              id="period"
              value={periodIndex}
              onChange={(e) => setPeriodIndex(Number(e.target.value))}
              disabled={isGenerating}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground hover:border-border/80 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
            >
              {periods.map((period, idx) => (
                <option key={idx} value={idx}>
                  {period.label}
                </option>
              ))}
            </select>
          </div>

          {/* Generate Button */}
          <div>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={isGenerating}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all duration-200 hover:opacity-90 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4" />
                  Generate Report
                </>
              )}
            </button>
          </div>
        </div>

        {/* Status Messages */}
        {statusMessage ? (
          <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
            {statusMessage}
          </div>
        ) : null}

        {error ? (
          <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  )
}
