'use client'

import { SFArrowDownDocument, SFPrinter, SFXmark, SFArrowClockwise } from 'sf-symbols-lib'
import { useToast } from '@/components/ui/toast'

interface ReportPreviewProps {
  html: string | null
  isLoading?: boolean
  onClose: () => void
  onDownload?: () => void
}

export function ReportPreview({ html, isLoading = false, onClose, onDownload }: ReportPreviewProps) {
  const { toast } = useToast()

  if (!html && !isLoading) {
    return null
  }

  async function handlePrint() {
    if (!html) return
    try {
      const win = window.open('', '_blank')
      if (!win) {
        toast('error', 'Failed to open print preview')
        return
      }
      win.document.write(html)
      win.document.close()
      setTimeout(() => {
        win.print()
      }, 500)
      toast('success', 'Opening print preview...')
    } catch (err) {
      toast('error', 'Failed to open print preview')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="flex h-[90vh] w-[90vw] max-w-6xl flex-col rounded-xl border border-border bg-card shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/50 px-6 py-4">
          <h2 className="text-lg font-semibold text-foreground">Report Preview</h2>
          <div className="flex items-center gap-2">
            {onDownload && (
              <button
                type="button"
                onClick={onDownload}
                disabled={!html || isLoading}
                className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/40 px-3 py-1.5 text-xs font-medium text-sky-300 hover:bg-sky-500/20 disabled:opacity-60"
              >
                <SFArrowDownDocument className="h-3.5 w-3.5" />
                SFArrowDownDocument
              </button>
            )}
            <button
              type="button"
              onClick={handlePrint}
              disabled={!html || isLoading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary/80 disabled:opacity-60"
            >
              <SFPrinter className="h-3.5 w-3.5" />
              Print
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border bg-secondary px-2 py-1.5 text-foreground hover:bg-secondary/80"
            >
              <SFXmark className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto bg-white">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <SFArrowClockwise className="mx-auto h-8 w-8 animate-spin text-foreground mb-2" />
                <p className="text-sm text-muted-foreground">Loading report preview...</p>
              </div>
            </div>
          ) : html ? (
            <iframe
              srcDoc={html}
              title="Report Preview"
              className="h-full w-full border-none"
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-muted-foreground">No report to display</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
