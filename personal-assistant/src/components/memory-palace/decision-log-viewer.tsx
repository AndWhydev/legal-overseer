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
  low: 'rgba(255, 255, 255, 0.4)',
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
      <div style={{ textAlign: 'center', padding: '40px', color: 'rgba(255, 255, 255, 0.4)' }}>
        Loading decisions...
      </div>
    )
  }

  if (decisions.length === 0) {
    return (
      <div style={{
        textAlign: 'center',
        padding: '60px 20px',
        color: 'rgba(255, 255, 255, 0.3)',
      }}>
        <div style={{ fontSize: '24px', marginBottom: '8px' }}>No decisions recorded</div>
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
              background: 'rgba(15, 20, 30, 0.35)',
              backdropFilter: 'blur(12px)',
              borderRadius: '10px',
              padding: '14px 16px',
              cursor: 'pointer',
              transition: 'background 0.15s ease',
              borderLeft: `3px solid ${impactColor}`,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(20, 28, 40, 0.5)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(15, 20, 30, 0.35)'
            }}
          >
            {/* Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginBottom: '6px',
            }}>
              {/* Domain Icon */}
              <span style={{
                width: '22px',
                height: '22px',
                borderRadius: '6px',
                background: `${impactColor}15`,
                color: impactColor,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '11px',
                fontWeight: 700,
              }}>
                {domainIcon}
              </span>

              {/* Impact */}
              <span style={{
                fontSize: '10px',
                fontWeight: 600,
                color: impactColor,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}>
                {decision.impact}
              </span>

              <span style={{ flex: 1 }} />

              <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.3)' }}>
                {dateStr}
              </span>
            </div>

            {/* Title */}
            <div style={{
              fontSize: '14px',
              fontWeight: 600,
              color: 'rgba(255, 255, 255, 0.9)',
              marginBottom: '4px',
            }}>
              {decision.title}
            </div>

            {/* Decision summary */}
            <div style={{
              fontSize: '13px',
              color: 'rgba(255, 255, 255, 0.6)',
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
                borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}>
                {/* Reasoning */}
                <div>
                  <div style={{
                    fontSize: '11px',
                    color: 'rgba(255, 255, 255, 0.4)',
                    marginBottom: '4px',
                    fontWeight: 600,
                  }}>
                    REASONING
                  </div>
                  <div style={{
                    fontSize: '13px',
                    color: 'rgba(255, 255, 255, 0.7)',
                    lineHeight: '1.5',
                  }}>
                    {decision.reasoning}
                  </div>
                </div>

                {/* Alternatives */}
                {decision.alternatives && (decision.alternatives as { option: string; pros: string[]; cons: string[] }[]).length > 0 && (
                  <div>
                    <div style={{
                      fontSize: '11px',
                      color: 'rgba(255, 255, 255, 0.4)',
                      marginBottom: '4px',
                      fontWeight: 600,
                    }}>
                      ALTERNATIVES CONSIDERED
                    </div>
                    {(decision.alternatives as { option: string; pros: string[]; cons: string[] }[]).map((alt, i) => (
                      <div key={i} style={{
                        padding: '6px 10px',
                        background: 'rgba(255, 255, 255, 0.03)',
                        borderRadius: '6px',
                        marginBottom: '4px',
                      }}>
                        <div style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.7)' }}>
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
                      fontSize: '11px',
                      color: 'rgba(255, 255, 255, 0.4)',
                      marginBottom: '4px',
                      fontWeight: 600,
                    }}>
                      OUTCOME
                    </div>
                    <div style={{
                      fontSize: '13px',
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
                      fontSize: '11px',
                      color: 'rgba(255, 255, 255, 0.4)',
                      marginBottom: '4px',
                      fontWeight: 600,
                    }}>
                      LESSONS LEARNED
                    </div>
                    <div style={{
                      fontSize: '13px',
                      color: '#F59E0B',
                      lineHeight: '1.5',
                    }}>
                      {decision.lessons_learned}
                    </div>
                  </div>
                )}

                {/* Entity names */}
                {decision.entity_names && decision.entity_names.length > 0 && (
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {decision.entity_names.map((name, i) => (
                      <span key={i} style={{
                        padding: '1px 8px',
                        borderRadius: '6px',
                        background: 'rgba(59, 130, 246, 0.1)',
                        color: '#3B82F6',
                        fontSize: '11px',
                      }}>
                        {name}
                      </span>
                    ))}
                  </div>
                )}

                {/* Decided by */}
                {decision.decided_by && (
                  <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.3)' }}>
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
