'use client'

import { useState } from 'react'
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react'
import { cn } from '@/lib/utils'

interface Activity {
  id: string
  action_type: string
  action: string
  reasoning: string | null
  result: string | null
  created_at: string
}

const typeStyles: Record<string, { bg: string; text: string; label: string }> = {
  task: { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'Task' },
  email: { bg: 'bg-green-500/20', text: 'text-green-400', label: 'Email' },
  agent: { bg: 'bg-purple-500/20', text: 'text-purple-400', label: 'Agent' },
  system: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', label: 'System' },
  research: { bg: 'bg-cyan-500/20', text: 'text-cyan-400', label: 'Research' },
}

function formatTimestamp(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export function ActivityItem({ activity }: { activity: Activity }) {
  const [expanded, setExpanded] = useState(false)
  const style = typeStyles[activity.action_type] || typeStyles.system

  return (
    <div
      className={cn(
        'rounded-lg border border-border/30 bg-card/50 transition-colors',
        expanded && 'border-border/60'
      )}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-start gap-3 px-4 py-3 text-left"
      >
        <span className="mt-0.5 text-muted-foreground">
          {expanded ? (
            <IconChevronDown className="size-3.5" />
          ) : (
            <IconChevronRight className="size-3.5" />
          )}
        </span>

        <span
          className={cn(
            'mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium',
            style.bg,
            style.text
          )}
        >
          {style.label}
        </span>

        <span className="flex-1 text-sm">{activity.action}</span>

        <span className="shrink-0 text-xs text-muted-foreground">
          {formatTimestamp(activity.created_at)}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-border/20 px-4 py-3 pl-12">
          {activity.reasoning && (
            <div className="mb-2">
              <span className="text-xs font-medium text-muted-foreground">
                Reasoning:
              </span>
              <p className="mt-0.5 text-sm text-foreground/70">
                {activity.reasoning}
              </p>
            </div>
          )}
          {activity.result && (
            <div>
              <span className="text-xs font-medium text-muted-foreground">
                Result:
              </span>
              <p className="mt-0.5 text-sm text-foreground/70">
                {activity.result}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
