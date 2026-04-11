'use client'

import React, { memo } from 'react'
import { IconCheck, IconX } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import type { WebsiteSignals } from '@/lib/leads/types'

interface WebsiteSignalsPanelProps {
  signals: WebsiteSignals
}

function SignalValue({ value, label }: { value: boolean | null | undefined; label: string }) {
  if (value === true) return <IconCheck size={14} className="text-green-500" aria-label={`${label}: yes`} />
  if (value === false) return <IconX size={14} className="text-destructive" aria-label={`${label}: no`} />
  return <span className="text-[12px] text-muted-foreground">--</span>
}

function loadTimeColor(ms: number | null | undefined): string {
  if (ms == null) return 'text-muted-foreground'
  if (ms < 1500) return 'text-green-500'
  if (ms < 3000) return 'text-yellow-500'
  return 'text-destructive'
}

function WebsiteSignalsPanelInner({ signals }: WebsiteSignalsPanelProps) {
  const items = [
    { label: 'CMS', content: <span className="text-base font-medium text-foreground">{signals.cms ?? '--'}</span> },
    { label: 'Analytics', content: <SignalValue value={signals.has_google_analytics} label="Analytics" /> },
    { label: 'Pixel', content: <SignalValue value={signals.has_facebook_pixel} label="Facebook Pixel" /> },
    { label: 'Booking', content: <SignalValue value={signals.has_booking_system} label="Booking system" /> },
    { label: 'Load Time', content: <span className={cn('text-base font-medium tabular-nums', loadTimeColor(signals.load_time_ms))}>{signals.load_time_ms != null ? `${signals.load_time_ms}ms` : '--'}</span> },
    { label: 'Reachable', content: <SignalValue value={signals.reachable} label="Reachable" /> },
  ]

  return (
    <div className="space-y-3">
      <h4 className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
        Website Signals
      </h4>

      <div className="grid grid-cols-3 gap-1.5">
        {items.map((cell) => (
          <div key={cell.label} className="flex flex-col items-center gap-1 rounded-[var(--radius-md)] bg-secondary p-2.5">
            <span className="text-[12px] text-muted-foreground">{cell.label}</span>
            {cell.content}
          </div>
        ))}
      </div>
    </div>
  )
}

export const WebsiteSignalsPanel = memo(WebsiteSignalsPanelInner)
