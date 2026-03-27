'use client'

import React, { memo } from 'react'
import { IconCheck, IconX, IconQuestionMark } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import type { WebsiteSignals } from '@/lib/leads/types'

interface WebsiteSignalsPanelProps {
  signals: WebsiteSignals
}

function TriState({ value, label }: { value: boolean | null | undefined; label: string }) {
  if (value === true) return <IconCheck data-icon className="text-success" aria-label={`${label}: yes`} />
  if (value === false) return <IconX data-icon className="text-destructive" aria-label={`${label}: no`} />
  return <IconQuestionMark data-icon className="text-muted-foreground" aria-label={`${label}: unknown`} />
}

function loadTimeColor(ms: number | null | undefined): string {
  if (ms == null) return 'text-muted-foreground'
  if (ms < 1500) return 'text-success'
  if (ms < 3000) return 'text-warning'
  return 'text-destructive'
}

function WebsiteSignalsPanelInner({ signals }: WebsiteSignalsPanelProps) {
  return (
    <div>
      <h4 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Website Signals
      </h4>

      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'CMS', content: <span className={cn('text-sm font-medium font-mono', signals.cms ? 'text-foreground' : 'text-muted-foreground')}>{signals.cms ?? 'Unknown'}</span> },
          { label: 'Analytics', content: <TriState value={signals.has_google_analytics} label="Analytics" /> },
          { label: 'Pixel', content: <TriState value={signals.has_facebook_pixel} label="Facebook Pixel" /> },
          { label: 'Booking', content: <TriState value={signals.has_booking_system} label="Booking system" /> },
          { label: 'Load Time', content: <span className={cn('text-sm font-medium font-mono', loadTimeColor(signals.load_time_ms))}>{signals.load_time_ms != null ? `${signals.load_time_ms}ms` : '--'}</span> },
          { label: 'Reachable', content: <TriState value={signals.reachable} label="Reachable" /> },
        ].map((cell) => (
          <div key={cell.label} className="flex flex-col items-center gap-1 rounded-lg bg-muted/50 p-3">
            <span className="text-xs font-medium text-muted-foreground">{cell.label}</span>
            {cell.content}
          </div>
        ))}
      </div>
    </div>
  )
}

export const WebsiteSignalsPanel = memo(WebsiteSignalsPanelInner)
