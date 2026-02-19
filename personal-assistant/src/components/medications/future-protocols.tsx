'use client'

import { useState, useMemo } from 'react'
import type { Protocol, Medication } from '@/lib/medications/types'
import type { Conflict } from '@/lib/medications/protocol-types'
import { checkConflicts } from '@/lib/medications/protocols'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface FutureProtocolsProps {
  protocols: Protocol[]
  activeProtocols: Protocol[]
  medicationMap: Record<string, Medication>
  descriptions?: Record<string, string>
  onActivate?: (protocolId: string) => void
}

export function FutureProtocols({
  protocols,
  activeProtocols,
  medicationMap,
  descriptions = {},
  onActivate,
}: FutureProtocolsProps) {
  const draftProtocols = protocols.filter((p) => !p.active)

  if (draftProtocols.length === 0) {
    return null
  }

  return (
    <div className="glass-card rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Future Protocols</h3>
        <Badge variant="secondary" className="text-[10px]">
          {draftProtocols.length} draft{draftProtocols.length !== 1 ? 's' : ''}
        </Badge>
      </div>

      {draftProtocols.map((protocol) => (
        <DraftCard
          key={protocol.id}
          protocol={protocol}
          activeProtocols={activeProtocols}
          medicationMap={medicationMap}
          description={descriptions[protocol.id]}
          onActivate={onActivate}
        />
      ))}
    </div>
  )
}

function DraftCard({
  protocol,
  activeProtocols,
  medicationMap,
  description,
  onActivate,
}: {
  protocol: Protocol
  activeProtocols: Protocol[]
  medicationMap: Record<string, Medication>
  description?: string
  onActivate?: (protocolId: string) => void
}) {
  const [showConflicts, setShowConflicts] = useState(false)
  const [conflicts, setConflicts] = useState<Conflict[]>([])

  function runConflictCheck() {
    // Temporarily "activate" this protocol and check against all active ones
    const testProtocol: Protocol = { ...protocol, active: true }
    const allProtos = [...activeProtocols, testProtocol]
    const found = checkConflicts(allProtos, medicationMap)
    setConflicts(found)
    setShowConflicts(true)
  }

  return (
    <div className="rounded-lg bg-background/50 border border-border/40 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{protocol.name}</span>
          <Badge variant="outline" className="text-[10px]">Draft</Badge>
        </div>
      </div>

      {description && (
        <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
      )}

      {/* Medication list */}
      <div className="space-y-1">
        {protocol.entries.map((entry) => {
          const med = medicationMap[entry.medicationId]
          return (
            <div key={entry.medicationId} className="flex items-center gap-2 text-xs">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: med?.pillStyle.primaryColor ?? '#555' }}
              />
              <span className="text-text-secondary">
                {med?.name ?? entry.medicationId}
                {med ? ` ${med.doseMg}mg` : ''}
              </span>
              <span className="text-muted-foreground">
                {entry.dosesPerDay}x {entry.timing}
              </span>
            </div>
          )
        })}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <Button
          variant="outline"
          size="xs"
          onClick={runConflictCheck}
        >
          Conflict Check
        </Button>
        {onActivate && (
          <Button
            variant="outline"
            size="xs"
            onClick={() => onActivate(protocol.id)}
          >
            Activate
          </Button>
        )}
      </div>

      {/* Conflict results */}
      {showConflicts && (
        <div className="pt-2 border-t border-border/40 space-y-1.5">
          {conflicts.length === 0 ? (
            <div className="flex items-center gap-1.5 text-xs text-success">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              No conflicts with active protocols
            </div>
          ) : (
            conflicts.map((conflict, idx) => (
              <div
                key={idx}
                className={cn(
                  'flex items-start gap-1.5 text-xs px-2 py-1.5 rounded',
                  conflict.severity === 'danger'
                    ? 'bg-[#C47070]/10 text-[#C47070]'
                    : 'bg-[#D4A574]/10 text-[#D4A574]'
                )}
              >
                <span className="shrink-0">{conflict.severity === 'danger' ? '🚫' : '⚠️'}</span>
                <span>{conflict.description}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
