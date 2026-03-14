'use client'

import { useState, useEffect, useCallback } from 'react'
import { Download, RefreshCw, FileText } from 'lucide-react'
import { SkeletonTable } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { useToast } from '@/components/ui/toast'

type ReportType = 'monthly' | 'agent-roi' | 'pipeline'

interface GeneratedReport {
  id: string
  report_type: ReportType
  period_from: string | null
  period_to: string | null
  created_at: string
}

const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  monthly: 'Monthly Summary',
  'agent-roi': 'Agent ROI',
  pipeline: 'Pipeline',
}

const REPORT_TYPE_COLORS: Record<ReportType, string> = {
  monthly: 'bg-blue-500/10 border-blue-500/30 text-blue-300',
  'agent-roi': 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300',
  pipeline: 'bg-purple-500/10 border-purple-500/30 text-purple-300',
}

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-AU', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return dateStr
  }
}

function formatPeriod(from: string | null, to: string | null): string {
  if (!from && !to) return 'Custom'
  if (!from) return `Until ${formatDate(to || '')}`
  if (!to) return `From ${formatDate(from)}`
  return `${formatDate(from)} to ${formatDate(to)}`
}

export function ReportList({ onRefresh }: { onRefresh?: () => void }) {
  const { toast } = useToast()
  const [reports, setReports] = useState<GeneratedReport[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadReports = useCallback(async () => {
    try {
      const response = await fetch('/api/reports')
      if (!response.ok) {
        throw new Error('Failed to load reports')
      }
      const data = (await response.json()) as { reports?: GeneratedReport[] }
      setReports(data.reports ?? [])
      setError(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load reports'
      setError(message)
      toast('error', message)
    }
  }, [toast])

  useEffect(() => {
    let mounted = true

    async function bootstrap() {
      try {
        await loadReports()
      } finally {
        if (mounted) setIsLoading(false)
      }
    }

    void bootstrap()

    return () => {
      mounted = false
    }
  }, [loadReports])

  async function handleRefresh() {
    setIsRefreshing(true)
    try {
      await loadReports()
      toast('success', 'Reports refreshed')
      onRefresh?.()
    } finally {
      setIsRefreshing(false)
    }
  }

  async function handleDownload(reportId: string) {
    try {
      const response = await fetch(`/api/reports?id=${encodeURIComponent(reportId)}`)
      if (!response.ok) {
        throw new Error('Failed to fetch report')
      }
      const data = (await response.json()) as { download_url?: string }
      if (data.download_url) {
        window.open(data.download_url, '_blank')
        toast('success', 'Opening report...')
      } else {
        throw new Error('No download URL provided')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to download report'
      toast('error', message)
    }
  }

  if (isLoading) {
    return <SkeletonTable rows={5} cols={5} />
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {error}
      </div>
    )
  }

  if (reports.length === 0) {
    return (
      <EmptyState
        icon={<FileText size={40} />}
        title="No reports generated"
        description="Generate your first report to see it listed here."
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Generated Reports</h3>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="rounded-md border border-border bg-secondary px-2 py-1.5 text-xs font-medium text-foreground hover:bg-secondary/80 disabled:opacity-60"
        >
          <RefreshCw className={`inline-block h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="bg-background/60 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Period</th>
                <th className="px-4 py-3">Generated</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((report) => (
                <tr key={report.id} className="border-t border-border/70">
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${REPORT_TYPE_COLORS[report.report_type]}`}
                    >
                      {REPORT_TYPE_LABELS[report.report_type]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatPeriod(report.period_from, report.period_to)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDate(report.created_at)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => void handleDownload(report.id)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-sky-500/40 px-2 py-1 text-xs font-medium text-sky-300 hover:bg-sky-500/20"
                    >
                      <Download className="h-3 w-3" />
                      Download
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
