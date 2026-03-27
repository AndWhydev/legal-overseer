'use client'

import React, { useState, useEffect, useCallback } from 'react'
import type { DecisionLogEntry } from '@/lib/memory-palace/types'

interface DecisionLogViewerProps {
  orgId: string
  entityId?: string
}

const IMPACT_COLORS: Record<string, string> = {
  critical: '#EF4444',
  high: '#F59E0B',
  medium: '#3B82F6',
  low: 'var(--text-dim, #475569)',
}

const DOMAIN_ICONS: Record<string, string> = {
  pricing: '$',
  staffing: 'P',
  tooling: 'T',
  process: 'W',
  client: 'C',
  vendor: 'V',
  general: 'G',
}

export function DecisionLogViewer({ orgId, entityId }: DecisionLogViewerProps) {
  const [decisions, setDecisions] = useState<DecisionLogEntry[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const loadDecisions = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ q: '*', decisions: 'true', patterns: 'false', limit: '30' })
      if (entityId) params.set('entity_id', entityId)
      const res = await fetch(`/api/memory-palace/search?${params}`)
      if (res.ok) {
        const data = await res.json()
        setDecisions(data.decisions ?? [])
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [entityId])

  useEffect(() => {
    loadDecisions()
  }, [loadDecisions])

  if (loading) {
    return (
      <div className="p-10 text-center text-muted-foreground">
        Loading decisions...
      </div>
    )
  }

  if (decisions.length === 0) {
    return (
      <div className="px-5 py-16 text-center text-muted-foreground">
        <div className="mb-2 text-base">No decisions recorded</div>
        <div className="text-sm">
          Decision reasoning chains are captured automatically when BitBit makes or recommends significant choices.
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      {decisions.map(decision => {
        const isExpanded = expandedId === decision.id
        const impactColor = IMPACT_COLORS[decision.impact] ?? 'rgba(255, 255, 255, 0.4)'
        const domainIcon = DOMAIN_ICONS[decision.domain] ?? 'G'
        const dateStr = new Date(decision.decided_at).toLocaleDateString('en-AU', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })

        return (
          <div
            key={decision.id}
            onClick={() => setExpandedId(isExpanded ? null : decision.id)}
            className="cursor-pointer rounded-xl bg-card p-3.5 backdrop-blur-[12px] transition-colors hover:bg-secondary/50"
            style={{ borderLeft: `3px solid ${impactColor}` }}
          >
            {/* Header */}
            <div className="mb-1.5 flex items-center gap-3">
              {/* Domain Icon */}
              <span
                className="flex h-[22px] w-[22px] items-center justify-center rounded-lg text-sm font-medium"
                style={{ background: `${impactColor}15`, color: impactColor }}
              >
                {domainIcon}
              </span>

              {/* Impact */}
              <span
                className="text-sm font-medium uppercase tracking-wide"
                style={{ color: impactColor }}
              >
                {decision.impact}
              </span>

              <span className="flex-1" />

              <span className="text-sm text-muted-foreground">
                {dateStr}
              </span>
            </div>

            {/* Title */}
            <div className="mb-1 text-sm font-medium text-foreground">
              {decision.title}
            </div>

            {/* Decision summary */}
            <div
              className={`text-sm leading-normal text-muted-foreground ${
                isExpanded ? '' : 'line-clamp-2'
              }`}
            >
              {decision.decision}
            </div>

            {/* Expanded: Reasoning Chain */}
            {isExpanded && (
              <div className="mt-3 flex flex-col gap-3 border-t border-border pt-3">
                {/* Reasoning */}
                <div>
                  <div className="mb-1 text-sm font-medium text-muted-foreground">
                    REASONING
                  </div>
                  <div className="text-sm leading-normal text-muted-foreground">
                    {decision.reasoning}
                  </div>
                </div>

                {/* Alternatives */}
                {decision.alternatives && (decision.alternatives as { option: string; pros: string[]; cons: string[] }[]).length > 0 && (
                  <div>
                    <div className="mb-1 text-sm font-medium text-muted-foreground">
                      ALTERNATIVES CONSIDERED
                    </div>
                    {(decision.alternatives as { option: string; pros: string[]; cons: string[] }[]).map((alt, i) => (
                      <div key={i} className="mb-1 rounded-lg bg-secondary/50 px-3 py-2">
                        <div className="text-sm text-muted-foreground">
                          {alt.option}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Outcome */}
                {decision.outcome && (
                  <div>
                    <div className="mb-1 text-sm font-medium text-muted-foreground">
                      OUTCOME
                    </div>
                    <div className="text-sm leading-normal text-green-500">
                      {decision.outcome}
                    </div>
                  </div>
                )}

                {/* Lessons */}
                {decision.lessons_learned && (
                  <div>
                    <div className="mb-1 text-sm font-medium text-muted-foreground">
                      LESSONS LEARNED
                    </div>
                    <div className="text-sm leading-normal text-muted-foreground">
                      {decision.lessons_learned}
                    </div>
                  </div>
                )}

                {/* Entity names */}
                {decision.entity_names && decision.entity_names.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {decision.entity_names.map((name, i) => (
                      <span key={i} className="rounded-lg bg-blue-500/10 px-2 py-px text-sm text-blue-500">
                        {name}
                      </span>
                    ))}
                  </div>
                )}

                {/* Decided by */}
                {decision.decided_by && (
                  <div className="text-sm text-muted-foreground">
                    Decided by: {decision.decided_by}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
