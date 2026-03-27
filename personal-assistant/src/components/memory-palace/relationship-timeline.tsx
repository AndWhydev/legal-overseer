'use client'

import React, { useState, useEffect, useCallback } from 'react'
import type { MemoryTimelineEvent } from '@/lib/memory-palace/types'
import { S, C } from '@/lib/styles/design-tokens'

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
      <div style={{ textAlign: 'center', padding: '40px', color: C.textDim }}>
        Loading timeline...
      </div>
    )
  }

  if (timeline.length === 0) {
    return (
      <div style={{
        textAlign: 'center',
        padding: '40px 20px',
        color: C.textMuted,
      }}>
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
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '0',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        marginBottom: '16px',
      }}>
        <div style={{
          fontSize: '16px',
          fontWeight: 500,
          color: C.textPrimary,
        }}>
          {displayName}
        </div>
        <div style={{
          fontSize: '14px',
          color: C.textDim,
          marginTop: '2px',
        }}>
          {timeline.length} event{timeline.length !== 1 ? 's' : ''} in relationship history
        </div>
      </div>

      {/* Timeline */}
      {groups.map((group, gi) => (
        <div key={gi}>
          {/* Month Header */}
          <div style={{
            fontSize: '14px',
            fontWeight: 500,
            color: C.textMuted,
            padding: '8px 16px',
            textTransform: 'uppercase',
            letterSpacing: '1px',
          }}>
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
                style={{
                  display: 'flex',
                  gap: '12px',
                  padding: '8px 16px',
                  position: 'relative',
                }}
              >
                {/* Timeline Line */}
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  width: '24px',
                  flexShrink: 0,
                }}>
                  {/* Dot */}
                  <div style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '8px',
                    background: `${color}20`,
                    color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '14px',
                    fontWeight: 500,
                    flexShrink: 0,
                  }}>
                    {icon}
                  </div>
                  {/* Connector line */}
                  {!isLast && (
                    <div style={{
                      width: '2px',
                      flex: 1,
                      minHeight: '16px',
                      background: 'var(--hover-bg-strong)',
                      marginTop: '4px',
                    }} />
                  )}
                </div>

                {/* Content */}
                <div style={{
                  flex: 1,
                  paddingBottom: '12px',
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '4px',
                  }}>
                    <span style={{
                      fontSize: '14px',
                      fontWeight: 500,
                      color: C.textPrimary,
                    }}>
                      {event.title}
                    </span>
                    <span style={{ flex: 1 }} />
                    <span style={{
                      fontSize: '14px',
                      color: C.textMuted,
                    }}>
                      {day} {time}
                    </span>
                  </div>

                  <div style={{
                    fontSize: '14px',
                    color: C.textPlaceholder,
                    lineHeight: '1.5',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical' as const,
                  }}>
                    {event.content}
                  </div>

                  {/* Confidence indicator */}
                  {event.confidence < 1 && (
                    <div style={{
                      marginTop: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}>
                      <div style={{
                        width: '40px',
                        height: '4px',
                        borderRadius: '2px',
                        background: 'var(--hover-bg-strong)',
                        overflow: 'hidden',
                      }}>
                        <div style={{
                          width: `${event.confidence * 100}%`,
                          height: '100%',
                          borderRadius: '2px',
                          background: event.confidence > 0.7 ? '#22C55E' :
                            event.confidence > 0.4 ? '#F59E0B' : '#EF4444',
                        }} />
                      </div>
                      <span style={{
                        fontSize: '14px',
                        color: C.textMuted,
                      }}>
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
