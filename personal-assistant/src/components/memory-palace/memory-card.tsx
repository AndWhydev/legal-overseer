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
      className="cursor-pointer rounded-xl bg-card p-3.5-[12px] transition-colors hover:bg-secondary/50"
      style={{ borderLeft: `3px solid ${categoryColor}` }}
    >
      {/* Header Row */}
      <div className="mb-1.5 flex items-center gap-3">
        {/* Category Pill */}
        <span
          className="rounded-lg px-2 py-px text-sm font-medium uppercase tracking-wide"
          style={{ background: `${categoryColor}15`, color: categoryColor }}
        >
          {memory.category}
        </span>

        {/* Confidence */}
        <span
          className="text-sm font-medium"
          style={{
            color: confidencePct > 70 ? '#22C55E' :
              confidencePct > 40 ? '#F59E0B' : '#EF4444',
          }}
        >
          {confidencePct}%
        </span>

        {/* Source badge */}
        {memory.source === 'user_explicit' && (
          <span className="text-sm font-medium text-foreground">
            USER
          </span>
        )}

        {/* Spacer */}
        <span className="flex-1" />

        {/* Age */}
        <span className="text-sm text-muted-foreground">
          {age}
        </span>
      </div>

      {/* Title */}
      {memory.title && (
        <div className="mb-1 text-sm font-medium text-foreground">
          {memory.title}
        </div>
      )}

      {/* Content */}
      <div
        className={`text-sm leading-normal text-muted-foreground ${
          expanded ? '' : 'line-clamp-2'
        }`}
      >
        {memory.content}
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
          {/* Entity Names */}
          {memory.entity_names && memory.entity_names.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <span className="text-sm text-muted-foreground">
                Entities:
              </span>
              {memory.entity_names.map((name, i) => (
                <span
                  key={i}
                  className="rounded-lg bg-blue-500/10 px-2 py-px text-sm text-blue-500"
                >
                  {name}
                </span>
              ))}
            </div>
          )}

          {/* Tags */}
          {memory.tags && memory.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <span className="text-sm text-muted-foreground">
                Tags:
              </span>
              {memory.tags.map((tag, i) => (
                <span
                  key={i}
                  className="rounded-lg bg-secondary px-2 py-1 text-sm text-muted-foreground"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {/* Metadata row */}
          <div className="flex gap-4 text-sm text-muted-foreground">
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

// --- Helpers ---

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
