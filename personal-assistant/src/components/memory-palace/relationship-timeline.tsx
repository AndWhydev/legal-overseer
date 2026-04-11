'use client'

import React, { useState, useEffect, useCallback } from 'react'
import type { MemoryTimelineEvent } from '@/lib/memory-palace/types'

interface RelationshipTimelineProps {
  entityId: string
  entityName?: string
}

const EVENT_TYPE_COLORS: Record<string, string> = {
  memory: '#3B82F6',
  decision: '#8B5CF6',
  pattern: '#14B8A6',
}

const EVENT_TYPE_ICONS: Record<string, string> = {
  memory: 'M',
  decision: 'D',
  pattern: 'P',
}

export function RelationshipTimeline({ entityId, entityName }: RelationshipTimelineProps) {
  const [timeline, setTimeline] = useState<MemoryTimelineEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [displayName, setDisplayName] = useState(entityName ?? 'Entity')

  const loadTimeline = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/memory-palace/recall?entity_id=${entityId}`)
      if (res.ok) {
        const data = await res.json()
        setTimeline(data.timeline ?? [])
        if (data.entityName) setDisplayName(data.entityName)
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [entityId])

  useEffect(() => {
    loadTimeline()
  }, [loadTimeline])

  if (loading) {
    return (
      <div className="p-10 text-center text-muted-foreground">
        Loading timeline...
      </div>
    )
  }

  if (timeline.length === 0) {
    return (
      <div className="px-5 py-10 text-center text-muted-foreground">
        No timeline events for {displayName}
      </div>
    )
  }

  // Group by month
  const groups: { month: string; events: MemoryTimelineEvent[] }[] = []
  let currentMonth = ''
  for (const event of timeline) {
    const month = new Date(event.timestamp).toLocaleDateString('en-AU', {
      month: 'long',
      year: 'numeric',
    })
    if (month !== currentMonth) {
      currentMonth = month
      groups.push({ month, events: [] })
    }
    groups[groups.length - 1].events.push(event)
  }

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="mb-4 px-4 py-3">
        <div className="text-base font-medium text-foreground">
          {displayName}
        </div>
        <div className="mt-0.5 text-sm text-muted-foreground">
          {timeline.length} event{timeline.length !== 1 ? 's' : ''} in relationship history
        </div>
      </div>

      {/* Timeline */}
      {groups.map((group, gi) => (
        <div key={gi}>
          {/* Month Header */}
          <div className="px-4 py-2 text-sm font-medium uppercase tracking-widest text-muted-foreground">
            {group.month}
          </div>

          {/* Events */}
          {group.events.map((event, ei) => {
            const color = EVENT_TYPE_COLORS[event.type] ?? '#666'
            const icon = EVENT_TYPE_ICONS[event.type] ?? '?'
            const day = new Date(event.timestamp).toLocaleDateString('en-AU', {
              day: 'numeric',
              month: 'short',
            })
            const time = new Date(event.timestamp).toLocaleTimeString('en-AU', {
              hour: '2-digit',
              minute: '2-digit',
            })
            const isLast = gi === groups.length - 1 && ei === group.events.length - 1

            return (
              <div
                key={event.id}
                className="relative flex gap-3 px-4 py-2"
              >
                {/* Timeline Line */}
                <div className="flex w-6 shrink-0 flex-col items-center">
                  {/* Dot */}
                  <div
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-sm font-medium"
                    style={{ background: `${color}20`, color }}
                  >
                    {icon}
                  </div>
                  {/* Connector line */}
                  {!isLast && (
                    <div className="mt-1 min-h-[16px] w-0.5 flex-1 bg-secondary" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 pb-3">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {event.title}
                    </span>
                    <span className="flex-1" />
                    <span className="text-sm text-muted-foreground">
                      {day} {time}
                    </span>
                  </div>

                  <div className="line-clamp-2 text-sm text-muted-foreground">
                    {event.content}
                  </div>

                  {/* Confidence indicator */}
                  {event.confidence < 1 && (
                    <div className="mt-1 flex items-center gap-2">
                      <div className="h-1 w-10 overflow-hidden rounded-lg bg-secondary">
                        <div
                          className="h-full rounded-lg"
                          style={{
                            width: `${event.confidence * 100}%`,
                            background: event.confidence > 0.7 ? '#22C55E' :
                              event.confidence > 0.4 ? '#F59E0B' : '#EF4444',
                          }}
                        />
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {Math.round(event.confidence * 100)}%
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
