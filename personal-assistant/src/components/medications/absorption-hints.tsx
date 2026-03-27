'use client'

import { useState, useMemo } from 'react'
import type { Protocol, Medication } from '@/lib/medications/types'
import type { Conflict } from '@/lib/medications/protocol-types'
import { checkConflicts } from '@/lib/medications/protocols'
import { IconChevronDown } from '@tabler/icons-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface AbsorptionHintsProps {
  protocols: Protocol[]
  medicationMap: Record<string, Medication>
  defaultExpanded?: boolean
}

const INSTRUCTION_BADGES: Record<string, { icon: string; label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  'empty-stomach': { icon: '\uD83E\uDED7', label: 'Empty stomach', variant: 'secondary' },
  'with-food': { icon: '\uD83C\uDF7D\uFE0F', label: 'With food', variant: 'secondary' },
  'with-fat': { icon: '\uD83E\uDDC8', label: 'With fat', variant: 'secondary' },
  'before-bed': { icon: '\uD83C\uDF19', label: 'Before bed', variant: 'secondary' },
  'any': { icon: '\u2713', label: 'Any time', variant: 'outline' },
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
    <Card className="overflow-hidden py-0">
      {/* Toggle header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">Absorption Hints</span>
          {conflicts.length > 0 && (
            <Badge variant="destructive" className="text-[10px]">
              {conflicts.length} conflict{conflicts.length !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>
        <IconChevronDown
          className={cn(
            'h-4 w-4 text-muted-foreground transition-transform duration-200',
            expanded && 'rotate-180'
          )}
        />
      </button>

      {expanded && (
        <div className="flex flex-col gap-3 px-4 pb-4 border-t border-border pt-3">
          {/* Conflict warnings */}
          {conflicts.map((conflict, idx) => (
            <ConflictBanner key={idx} conflict={conflict} medicationMap={medicationMap} />
          ))}

          {/* Per-medication instruction badges */}
          <div className="flex flex-col gap-1.5">
            {activeMeds.map((med) => {
              const instruction = med.instructions ?? 'any'
              const badge = INSTRUCTION_BADGES[instruction] ?? INSTRUCTION_BADGES['any']
              return (
                <div
                  key={med.id}
                  className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-muted/50"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: med.pillStyle.primaryColor }}
                    />
                    <span className="text-xs text-foreground">{med.name}</span>
                  </div>
                  <Badge variant={badge.variant} className="text-[10px]">
                    {badge.icon} {badge.label}
                  </Badge>
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
    </Card>
  )
}

function ConflictBanner({
  conflict,
}: {
  conflict: Conflict
  medicationMap: Record<string, Medication>
}) {
  const isDanger = conflict.severity === 'danger'

  return (
    <div
      className={cn(
        'flex items-start gap-2 px-3 py-2 rounded-lg text-xs',
        isDanger
          ? 'bg-destructive/10 border border-destructive/20'
          : 'bg-warning/10 border border-warning/20'
      )}
    >
      <span className="shrink-0 mt-0.5">{isDanger ? '\uD83D\uDEAB' : '\u26A0\uFE0F'}</span>
      <div>
        <p className={cn('font-medium', isDanger ? 'text-destructive' : 'text-warning')}>
          {conflict.type === 'absorption' ? 'Absorption conflict' : 'Timing conflict'}
        </p>
        <p className="text-muted-foreground mt-0.5 leading-relaxed">
          {conflict.description}
        </p>
      </div>
    </div>
  )
}
