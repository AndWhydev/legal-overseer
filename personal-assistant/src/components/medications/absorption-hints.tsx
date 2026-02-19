'use client'

import { useState, useMemo } from 'react'
import type { Protocol, Medication } from '@/lib/medications/types'
import type { Conflict } from '@/lib/medications/protocol-types'
import { checkConflicts } from '@/lib/medications/protocols'
import { cn } from '@/lib/utils'

interface AbsorptionHintsProps {
  protocols: Protocol[]
  medicationMap: Record<string, Medication>
  defaultExpanded?: boolean
}

const INSTRUCTION_BADGES: Record<string, { icon: string; label: string; color: string }> = {
  'empty-stomach': { icon: '🫗', label: 'Empty stomach', color: '#D4A574' },
  'with-food': { icon: '🍽️', label: 'With food', color: '#7CAA85' },
  'with-fat': { icon: '🧈', label: 'With fat', color: '#E8C49A' },
  'before-bed': { icon: '🌙', label: 'Before bed', color: '#A78BFA' },
  'any': { icon: '✓', label: 'Any time', color: '#7A7468' },
}

export function AbsorptionHints({
  protocols,
  medicationMap,
  defaultExpanded = false,
}: AbsorptionHintsProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  const conflicts = useMemo(
    () => checkConflicts(protocols, medicationMap),
    [protocols, medicationMap]
  )

  // Collect unique medications from active protocols
  const activeMeds = useMemo(() => {
    const seen = new Set<string>()
    const result: Medication[] = []
    for (const proto of protocols) {
      if (!proto.active) continue
      for (const entry of proto.entries) {
        if (!seen.has(entry.medicationId)) {
          seen.add(entry.medicationId)
          const med = medicationMap[entry.medicationId]
          if (med) result.push(med)
        }
      }
    }
    return result
  }, [protocols, medicationMap])

  return (
    <div className="glass-card rounded-xl overflow-hidden">
      {/* Toggle header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">Absorption Hints</span>
          {conflicts.length > 0 && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-[#C47070]/15 text-[#C47070] border border-[#C47070]/20">
              {conflicts.length} conflict{conflicts.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <svg
          className={cn(
            'w-4 h-4 text-muted-foreground transition-transform duration-200',
            expanded && 'rotate-180'
          )}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-border/40 pt-3">
          {/* Conflict warnings */}
          {conflicts.map((conflict, idx) => (
            <ConflictBanner key={idx} conflict={conflict} medicationMap={medicationMap} />
          ))}

          {/* Per-medication instruction badges */}
          <div className="space-y-1.5">
            {activeMeds.map((med) => {
              const instruction = med.instructions ?? 'any'
              const badge = INSTRUCTION_BADGES[instruction] ?? INSTRUCTION_BADGES['any']
              return (
                <div
                  key={med.id}
                  className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-background/50"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: med.pillStyle.primaryColor }}
                    />
                    <span className="text-xs text-foreground">{med.name}</span>
                  </div>
                  <span
                    className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded"
                    style={{
                      backgroundColor: `${badge.color}15`,
                      color: badge.color,
                      border: `1px solid ${badge.color}20`,
                    }}
                  >
                    {badge.icon} {badge.label}
                  </span>
                </div>
              )
            })}
          </div>

          {activeMeds.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">
              No active medications
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function ConflictBanner({
  conflict,
  medicationMap,
}: {
  conflict: Conflict
  medicationMap: Record<string, Medication>
}) {
  const isDanger = conflict.severity === 'danger'
  const color = isDanger ? '#C47070' : '#D4A574'

  return (
    <div
      className="flex items-start gap-2 px-3 py-2 rounded-lg text-xs"
      style={{
        backgroundColor: `${color}10`,
        border: `1px solid ${color}25`,
      }}
    >
      <span className="shrink-0 mt-0.5">{isDanger ? '🚫' : '⚠️'}</span>
      <div>
        <p style={{ color }} className="font-medium">
          {conflict.type === 'absorption' ? 'Absorption conflict' : 'Timing conflict'}
        </p>
        <p className="text-muted-foreground mt-0.5 leading-relaxed">
          {conflict.description}
        </p>
      </div>
    </div>
  )
}
