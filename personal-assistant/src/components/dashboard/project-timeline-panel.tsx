'use client'

import React, { useState } from 'react'
import useSWR from 'swr'
import { Skeleton } from '@/components/ui/skeleton'
import { motion, AnimatePresence } from 'motion/react'

const fetcher = (url: string) => fetch(url).then(r => r.json())

type Entry = { date: string; type: string; summary: string }

const TYPE_LABEL: Record<string, string> = {
  mention: 'Mentioned',
  received: 'Received',
  sent: 'Sent',
  invoice: 'Invoice',
  payment: 'Payment',
  email_received: 'Email in',
  email_sent: 'Email out',
}

function relDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diff = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff < 7) return `${diff}d ago`
  return d.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })
}

export function ProjectTimelinePanel({ projectId }: { projectId: string }) {
  const { data, isLoading } = useSWR<{ project: string; entries: Entry[] }>(
    projectId ? `/api/dashboard/project-timeline?projectId=${projectId}` : null,
    fetcher,
    { revalidateOnFocus: false }
  )

  if (isLoading) {
    return (
      <div className="px-4 pb-4 space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex gap-3"><Skeleton className="h-3 w-12" /><Skeleton className="h-3 w-full" /></div>
        ))}
      </div>
    )
  }

  const entries = data?.entries ?? []
  if (entries.length === 0) {
    return <div className="px-4 pb-4 text-sm text-muted-foreground">No timeline events yet</div>
  }

  return (
    <div className="px-4 pb-4 space-y-0 border-t border-border pt-2 mt-1">
      {entries.slice(0, 10).map((entry, i) => (
        <div key={i} className="flex gap-3 py-1 items-start">
          <span className="text-sm tabular-nums text-muted-foreground shrink-0 w-14 pt-0.5 text-right">{relDate(entry.date)}</span>
          <span className="text-sm text-muted-foreground shrink-0 w-12 pt-0.5 truncate">{TYPE_LABEL[entry.type] || entry.type}</span>
          <span className="text-sm text-muted-foreground leading-snug line-clamp-1">{entry.summary}</span>
        </div>
      ))}
    </div>
  )
}

export function ExpandableProjectCard({ projectId, children }: { projectId: string; children: React.ReactNode }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="cursor-pointer" onClick={() => setExpanded(prev => !prev)}>
      {children}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <ProjectTimelinePanel projectId={projectId} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
