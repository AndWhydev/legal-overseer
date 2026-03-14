'use client'

import { useState, useEffect } from 'react'
import { SFXmark, SFCheckmarkCircle, SFExclamationmarkCircle, SFEnvelope, SFBubbleLeft, SFCalendar, SFBell } from 'sf-symbols-lib'
import { cn } from '@/lib/utils'

const channelIcons: Record<string, React.ElementType> = {
  gmail: SFEnvelope,
  outlook: SFEnvelope,
  imessage: SFBubbleLeft,
  calendar: SFCalendar,
  reminders: SFBell,
}

const channelLabels: Record<string, string> = {
  gmail: 'Gmail',
  outlook: 'Outlook',
  imessage: 'iMessage',
  calendar: 'Calendar',
  reminders: 'Reminders',
}

interface SyncResultItem {
  channel: string
  messagesFound: number
  tasksCreated: number
  tasksUpdated: number
  errors: string[]
  duration: number
}

interface SyncResultsProps {
  results: SyncResultItem[]
  onDismiss: () => void
  autoDismissMs?: number
}

export function SyncResults({ results, onDismiss, autoDismissMs = 10000 }: SyncResultsProps) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    if (autoDismissMs <= 0) return
    const timer = setTimeout(() => {
      setVisible(false)
      setTimeout(onDismiss, 300)
    }, autoDismissMs)
    return () => clearTimeout(timer)
  }, [autoDismissMs, onDismiss])

  const totals = results.reduce(
    (acc, r) => ({
      messagesFound: acc.messagesFound + r.messagesFound,
      tasksCreated: acc.tasksCreated + r.tasksCreated,
      tasksUpdated: acc.tasksUpdated + r.tasksUpdated,
      errors: acc.errors + r.errors.length,
    }),
    { messagesFound: 0, tasksCreated: 0, tasksUpdated: 0, errors: 0 }
  )

  const totalDuration = Math.max(...results.map(r => r.duration), 0)
  const hasErrors = totals.errors > 0

  function handleDismiss() {
    setVisible(false)
    setTimeout(onDismiss, 300)
  }

  return (
    <div className={cn(
      'rounded-xl border bg-card p-4 transition-all duration-300',
      visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2',
      hasErrors ? 'border-destructive/30' : 'border-[#4ADE80]/20'
    )}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {hasErrors ? (
            <SFExclamationmarkCircle className="h-4 w-4 text-amber-400" />
          ) : (
            <SFCheckmarkCircle className="h-4 w-4 text-[#4ADE80]" />
          )}
          <h3 className="text-sm font-semibold text-foreground">
            Sync Complete
          </h3>
          <span className="text-xs text-muted-foreground">
            {(totalDuration / 1000).toFixed(1)}s
          </span>
        </div>
        <button
          onClick={handleDismiss}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <SFXmark className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Summary totals */}
      <div className="mt-3 grid grid-cols-3 gap-3 rounded-lg bg-secondary/50 p-3">
        <div className="text-center">
          <p className="text-2xl font-bold text-foreground">{totals.messagesFound}</p>
          <p className="text-xs text-muted-foreground">Messages Found</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-[#4ADE80]">{totals.tasksCreated}</p>
          <p className="text-xs text-muted-foreground">Tasks Created</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-foreground">{totals.tasksUpdated}</p>
          <p className="text-xs text-muted-foreground">Tasks Updated</p>
        </div>
      </div>

      {/* Per-channel breakdown */}
      <div className="mt-3 space-y-1.5">
        {results.map((r) => {
          const Icon = channelIcons[r.channel] || SFEnvelope
          const label = channelLabels[r.channel] || r.channel
          const hasChannelErrors = r.errors.length > 0

          return (
            <div
              key={r.channel}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-xs',
                hasChannelErrors ? 'bg-destructive/5' : 'bg-secondary/30'
              )}
            >
              <Icon className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-medium text-foreground">{label}</span>
              <span className="flex-1" />
              <span className="text-muted-foreground">
                {r.messagesFound} msgs
              </span>
              {r.tasksCreated > 0 && (
                <span className="text-[#4ADE80]">
                  +{r.tasksCreated} tasks
                </span>
              )}
              {hasChannelErrors && (
                <span className="text-destructive">{r.errors.length} error{r.errors.length > 1 ? 's' : ''}</span>
              )}
              <span className="text-muted-foreground/50">
                {r.duration}ms
              </span>
            </div>
          )
        })}
      </div>

      {/* Auto-dismiss progress bar */}
      {autoDismissMs > 0 && (
        <div className="mt-3 h-0.5 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-muted-foreground/30 transition-none"
            style={{
              animation: `shrink-bar ${autoDismissMs}ms linear forwards`,
            }}
          />
          <style>{`
            @keyframes shrink-bar {
              from { width: 100%; }
              to { width: 0%; }
            }
          `}</style>
        </div>
      )}
    </div>
  )
}
