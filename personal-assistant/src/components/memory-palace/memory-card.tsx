'use client'

import React, { useState } from 'react'
import type { MemoryPalaceEntry } from '@/lib/memory-palace/types'

interface MemoryCardProps {
  memory: MemoryPalaceEntry
  categoryColor: string
}

export function MemoryCard({ memory, categoryColor }: MemoryCardProps) {
  const [expanded, setExpanded] = useState(false)

  const confidencePct = Math.round(memory.confidence * 100)
  const age = getTimeAgo(memory.created_at)
  const decayLabel = memory.decay_rate === 'never' ? 'Permanent' :
    memory.decay_rate === 'slow' ? 'Slow decay' :
    memory.decay_rate === 'fast' ? 'Fast decay' : 'Normal decay'

  return (
    <div
      onClick={() => setExpanded(!expanded)}
      style={{
        background: 'rgba(15, 20, 30, 0.35)',
        backdropFilter: 'blur(12px)',
        borderRadius: '12px',
        padding: '14px 16px',
        cursor: 'pointer',
        transition: 'background 0.15s ease',
        borderLeft: `3px solid ${categoryColor}`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(20, 28, 40, 0.5)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'rgba(15, 20, 30, 0.35)'
      }}
    >
      {/* Header Row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        marginBottom: '6px',
      }}>
        {/* Category Pill */}
        <span style={{
          padding: '2px 8px',
          borderRadius: '8px',
          background: `${categoryColor}15`,
          color: categoryColor,
          fontSize: '14px',
          fontWeight: 500,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}>
          {memory.category}
        </span>

        {/* Confidence */}
        <span style={{
          fontSize: '14px',
          color: confidencePct > 70 ? '#22C55E' :
            confidencePct > 40 ? '#F59E0B' : '#EF4444',
          fontWeight: 500,
        }}>
          {confidencePct}%
        </span>

        {/* Source badge */}
        {memory.source === 'user_explicit' && (
          <span style={{
            fontSize: '14px',
            color: '#FF7A45',
            fontWeight: 500,
          }}>
            USER
          </span>
        )}

        {/* Spacer */}
        <span style={{ flex: 1 }} />

        {/* Age */}
        <span style={{
          fontSize: '14px',
          color: 'rgba(255, 255, 255, 0.3)',
        }}>
          {age}
        </span>
      </div>

      {/* Title */}
      {memory.title && (
        <div style={{
          fontSize: '14px',
          fontWeight: 500,
          color: 'rgba(255, 255, 255, 0.9)',
          marginBottom: '4px',
        }}>
          {memory.title}
        </div>
      )}

      {/* Content */}
      <div style={{
        fontSize: '14px',
        color: 'rgba(255, 255, 255, 0.7)',
        lineHeight: '1.5',
        overflow: expanded ? 'visible' : 'hidden',
        textOverflow: expanded ? 'unset' : 'ellipsis',
        display: expanded ? 'block' : '-webkit-box',
        WebkitLineClamp: expanded ? undefined : 2,
        WebkitBoxOrient: expanded ? undefined : 'vertical' as const,
      }}>
        {memory.content}
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div style={{
          marginTop: '12px',
          paddingTop: '12px',
          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}>
          {/* Entity Names */}
          {memory.entity_names && memory.entity_names.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.4)' }}>
                Entities:
              </span>
              {memory.entity_names.map((name, i) => (
                <span
                  key={i}
                  style={{
                    padding: '1px 8px',
                    borderRadius: '8px',
                    background: 'rgba(59, 130, 246, 0.1)',
                    color: '#3B82F6',
                    fontSize: '14px',
                  }}
                >
                  {name}
                </span>
              ))}
            </div>
          )}

          {/* Tags */}
          {memory.tags && memory.tags.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.4)' }}>
                Tags:
              </span>
              {memory.tags.map((tag, i) => (
                <span
                  key={i}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    color: 'rgba(255, 255, 255, 0.5)',
                    fontSize: '14px',
                  }}
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {/* Metadata row */}
          <div style={{
            display: 'flex',
            gap: '16px',
            fontSize: '14px',
            color: 'rgba(255, 255, 255, 0.3)',
          }}>
            <span>{decayLabel}</span>
            {memory.corroboration_count > 0 && (
              <span>Corroborated {memory.corroboration_count}x</span>
            )}
            {memory.source_channel && (
              <span>via {memory.source_channel}</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getTimeAgo(isoDate: string): string {
  const now = Date.now()
  const then = new Date(isoDate).getTime()
  const seconds = Math.floor((now - then) / 1000)

  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`
  if (seconds < 2592000) return `${Math.floor(seconds / 604800)}w ago`
  return new Date(isoDate).toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })
}
