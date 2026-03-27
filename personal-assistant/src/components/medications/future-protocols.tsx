'use client'

import { useState, useMemo } from 'react'
import type { Protocol, Medication } from '@/lib/medications/types'
import type { Conflict } from '@/lib/medications/protocol-types'
import { checkConflicts } from '@/lib/medications/protocols'
import { IconCheck } from '@tabler/icons-react'
import { Card } from '@/components/ui/card'
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
    <Card className="flex flex-col gap-3 p-4">
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
    </Card>
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
    <div className="flex flex-col gap-2 rounded-lg bg-muted/50 border border-border p-3">
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
      <div className="flex flex-col gap-1">
        {protocol.entries.map((entry) => {
          const med = medicationMap[entry.medicationId]
          return (
            <div key={entry.medicationId} className="flex items-center gap-2 text-xs">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: med?.pillStyle.primaryColor ?? '#555' }}
              />
              <span className="text-muted-foreground">
                {med?.name ?? entry.medicationId}
                {med ? ` ${med.doseMg}mg` : ''}
              </span>
              <span className="text-muted-foreground/70">
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
          size="sm"
          onClick={runConflictCheck}
        >
          Conflict Check
        </Button>
        {onActivate && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onActivate(protocol.id)}
          >
            Activate
          </Button>
        )}
      </div>

      {/* Conflict results */}
      {showConflicts && (
        <div className="flex flex-col gap-1.5 pt-2 border-t border-border">
          {conflicts.length === 0 ? (
            <div className="flex items-center gap-1.5 text-xs text-success">
              <IconCheck className="h-3.5 w-3.5" />
              No conflicts with active protocols
            </div>
          ) : (
            conflicts.map((conflict, idx) => (
              <div
                key={idx}
                className={cn(
                  'flex items-start gap-1.5 text-xs px-2 py-1.5 rounded',
                  conflict.severity === 'danger'
                    ? 'bg-destructive/10 text-destructive'
                    : 'bg-warning/10 text-warning'
                )}
              >
                <span className="shrink-0">{conflict.severity === 'danger' ? '\uD83D\uDEAB' : '\u26A0\uFE0F'}</span>
                <span>{conflict.description}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
