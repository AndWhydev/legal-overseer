'use client'

import React, { useState, useEffect, useCallback } from 'react'
import type { DecisionLogEntry } from '@/lib/memory-palace/types'
import { S, C } from '@/lib/styles/design-tokens'

interface DecisionLogViewerProps {
  orgId: string
  entityId?: string
}

const IMPACT_COLORS: Record<string, string> = {
  critical: '#EF4444',
  high: '#F59E0B',
  medium: '#3B82F6',
  low: C.textDim,
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
      <div style={{ textAlign: 'center', padding: '40px', color: C.textDim }}>
        Loading decisions...
      </div>
    )
  }

  if (decisions.length === 0) {
    return (
      <div style={{
        textAlign: 'center',
        padding: '60px 20px',
        color: C.textMuted,
      }}>
        <div style={{ fontSize: '16px', marginBottom: '8px' }}>No decisions recorded</div>
        <div style={{ fontSize: '14px' }}>
          Decision reasoning chains are captured automatically when BitBit makes or recommends significant choices.
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
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
            style={{
              background: 'var(--bg-card, rgba(15, 20, 30, 0.35))',
              backdropFilter: 'blur(12px)',
              borderRadius: '12px',
              padding: '14px 16px',
              cursor: 'pointer',
              transition: 'background 0.15s ease',
              borderLeft: `3px solid ${impactColor}`,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--bb-surface-hover, rgba(20, 28, 40, 0.5))'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = C.bgCardLight
            }}
          >
            {/* Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '6px',
            }}>
              {/* Domain Icon */}
              <span style={{
                width: '22px',
                height: '22px',
                borderRadius: '8px',
                background: `${impactColor}15`,
                color: impactColor,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '14px',
                fontWeight: 500,
              }}>
                {domainIcon}
              </span>

              {/* Impact */}
              <span style={{
                fontSize: '14px',
                fontWeight: 500,
                color: impactColor,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}>
                {decision.impact}
              </span>

              <span style={{ flex: 1 }} />

              <span style={{ fontSize: '14px', color: C.textMuted }}>
                {dateStr}
              </span>
            </div>

            {/* Title */}
            <div style={{
              fontSize: '14px',
              fontWeight: 500,
              color: C.textPrimary,
              marginBottom: '4px',
            }}>
              {decision.title}
            </div>

            {/* Decision summary */}
            <div style={{
              fontSize: '14px',
              color: C.textSecondary,
              lineHeight: '1.5',
              overflow: isExpanded ? 'visible' : 'hidden',
              textOverflow: isExpanded ? 'unset' : 'ellipsis',
              display: isExpanded ? 'block' : '-webkit-box',
              WebkitLineClamp: isExpanded ? undefined : 2,
              WebkitBoxOrient: isExpanded ? undefined : 'vertical' as const,
            }}>
              {decision.decision}
            </div>

            {/* Expanded: Reasoning Chain */}
            {isExpanded && (
              <div style={{
                marginTop: '12px',
                paddingTop: '12px',
                borderTop: '1px solid var(--glass-border, rgba(255, 255, 255, 0.03))',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}>
                {/* Reasoning */}
                <div>
                  <div style={{
                    fontSize: '14px',
                    color: C.textDim,
                    marginBottom: '4px',
                    fontWeight: 500,
                  }}>
                    REASONING
                  </div>
                  <div style={{
                    fontSize: '14px',
                    color: C.textSecondary,
                    lineHeight: '1.5',
                  }}>
                    {decision.reasoning}
                  </div>
                </div>

                {/* Alternatives */}
                {decision.alternatives && (decision.alternatives as { option: string; pros: string[]; cons: string[] }[]).length > 0 && (
                  <div>
                    <div style={{
                      fontSize: '14px',
                      color: C.textDim,
                      marginBottom: '4px',
                      fontWeight: 500,
                    }}>
                      ALTERNATIVES CONSIDERED
                    </div>
                    {(decision.alternatives as { option: string; pros: string[]; cons: string[] }[]).map((alt, i) => (
                      <div key={i} style={{
                        padding: '8px 12px',
                        background: 'var(--hover-bg)',
                        borderRadius: '8px',
                        marginBottom: '4px',
                      }}>
                        <div style={{ fontSize: '14px', color: C.textSecondary }}>
                          {alt.option}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Outcome */}
                {decision.outcome && (
                  <div>
                    <div style={{
                      fontSize: '14px',
                      color: C.textDim,
                      marginBottom: '4px',
                      fontWeight: 500,
                    }}>
                      OUTCOME
                    </div>
                    <div style={{
                      fontSize: '14px',
                      color: '#22C55E',
                      lineHeight: '1.5',
                    }}>
                      {decision.outcome}
                    </div>
                  </div>
                )}

                {/* Lessons */}
                {decision.lessons_learned && (
                  <div>
                    <div style={{
                      fontSize: '14px',
                      color: C.textDim,
                      marginBottom: '4px',
                      fontWeight: 500,
                    }}>
                      LESSONS LEARNED
                    </div>
                    <div style={{
                      fontSize: '14px',
                      color: '#F59E0B',
                      lineHeight: '1.5',
                    }}>
                      {decision.lessons_learned}
                    </div>
                  </div>
                )}

                {/* Entity names */}
                {decision.entity_names && decision.entity_names.length > 0 && (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {decision.entity_names.map((name, i) => (
                      <span key={i} style={{
                        padding: '1px 8px',
                        borderRadius: '8px',
                        background: 'rgba(59, 130, 246, 0.1)',
                        color: '#3B82F6',
                        fontSize: '14px',
                      }}>
                        {name}
                      </span>
                    ))}
                  </div>
                )}

                {/* Decided by */}
                {decision.decided_by && (
                  <div style={{ fontSize: '14px', color: C.textMuted }}>
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
