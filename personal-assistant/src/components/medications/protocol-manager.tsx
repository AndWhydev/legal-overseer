'use client'

import { useState } from 'react'
import type { Protocol, Medication } from '@/lib/medications/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ProtocolManagerProps {
  protocols: Protocol[]
  medicationMap: Record<string, Medication>
  descriptions?: Record<string, string>
  onToggle?: (protocolId: string, active: boolean) => void
}

export function ProtocolManager({
  protocols,
  medicationMap,
  descriptions = {},
  onToggle,
}: ProtocolManagerProps) {
  const [expanded, setExpanded] = useState<string | null>(null)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground">Protocols</h3>
        <Badge variant="secondary" className="text-xs">
          {protocols.filter((p) => p.active).length} active
        </Badge>
      </div>

      {protocols.map((protocol) => {
        const isExpanded = expanded === protocol.id
        const desc = descriptions[protocol.id]

        return (
          <div
            key={protocol.id}
            className={cn(
              'glass-card rounded-xl transition-all duration-200',
              protocol.active
                ? 'border-primary/20'
                : 'border-border/40 opacity-70'
            )}
          >
            {/* Header */}
            <button
              onClick={() => setExpanded(isExpanded ? null : protocol.id)}
              className="w-full flex items-center justify-between px-4 py-3 text-left"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={cn(
                    'w-2 h-2 rounded-full shrink-0',
                    protocol.active ? 'bg-success' : 'bg-muted-foreground'
                  )}
                />
                <div className="min-w-0">
                  <span className="text-sm font-medium text-foreground block truncate">
                    {protocol.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {protocol.entries.length} medication{protocol.entries.length !== 1 ? 's' : ''}
                    {protocol.cyclePattern && (
                      <span className="ml-2 text-primary/80">
                        {protocol.cyclePattern.onDays}on/{protocol.cyclePattern.offDays}off
                      </span>
                    )}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Badge
                  variant={protocol.active ? 'success' : 'secondary'}
                  className="text-[10px]"
                >
                  {protocol.active ? 'Active' : 'Draft'}
                </Badge>
                <svg
                  className={cn(
                    'w-4 h-4 text-muted-foreground transition-transform duration-200',
                    isExpanded && 'rotate-180'
                  )}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            {/* Expanded content */}
            {isExpanded && (
              <div className="px-4 pb-4 space-y-3 border-t border-border/40 pt-3">
                {desc && (
                  <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
                )}

                <div className="space-y-2">
                  {protocol.entries.map((entry) => {
                    const med = medicationMap[entry.medicationId]
                    return (
                      <div
                        key={entry.medicationId}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg bg-background/50"
                      >
                        {/* Pill indicator */}
                        <div
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: med?.pillStyle.primaryColor ?? '#555' }}
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-medium text-foreground">
                            {med?.name ?? entry.medicationId}
                          </span>
                          <span className="text-xs text-muted-foreground ml-2">
                            {med ? `${med.doseMg}mg` : ''}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                          <span>{entry.dosesPerDay}x</span>
                          <TimingBadge timing={entry.timing} />
                        </div>
                      </div>
                    )
                  })}
                </div>

                {onToggle && (
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => onToggle(protocol.id, !protocol.active)}
                    className="w-full mt-2"
                  >
                    {protocol.active ? 'Deactivate' : 'Activate'}
                  </Button>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function TimingBadge({ timing }: { timing: string }) {
  const labels: Record<string, { label: string; icon: string }> = {
    morning: { label: 'AM', icon: '☀️' },
    evening: { label: 'PM', icon: '🌙' },
    both: { label: 'AM+PM', icon: '🔄' },
    'as-needed': { label: 'PRN', icon: '⚡' },
  }
  const info = labels[timing] ?? { label: timing, icon: '' }

  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-elevated text-text-secondary">
      {info.label}
    </span>
  )
}
