'use client'

import { useState } from 'react'
import { Truck, ChevronDown, ChevronRight, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { inTransitItems as initialItems } from '@/lib/medications/inventory-seed'
import type { InTransitItem } from '@/lib/medications/types'

export function InTransitTracker({ className }: { className?: string }) {
  const [items, setItems] = useState<InTransitItem[]>(initialItems)
  const [expanded, setExpanded] = useState(true)

  const pending = items.filter(i => !i.arrived)
  const arrived = items.filter(i => i.arrived)

  function markArrived(medicationId: string) {
    setItems(prev =>
      prev.map(item =>
        item.medicationId === medicationId
          ? { ...item, arrived: true }
          : item
      )
    )
  }

  return (
    <div className={cn('glass-card rounded-xl p-4', className)}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full"
      >
        <div className="flex items-center gap-2">
          <Truck className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">In Transit</h3>
          {pending.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary font-medium tabular-nums">
              {pending.length} incoming
            </span>
          )}
        </div>
        {expanded
          ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="mt-3 space-y-1.5">
          {pending.map(item => (
            <div
              key={item.medicationId}
              className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-elevated/50 transition-smooth"
            >
              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="text-sm text-foreground truncate">{item.name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {item.quantity} {item.form.split('(')[0].trim().toLowerCase()}
                </div>
              </div>

              {/* Arrival status */}
              <div className="text-right shrink-0 mr-2">
                <span className="text-[11px] text-muted-foreground">
                  {item.expectedArrival ?? 'Pending'}
                </span>
              </div>

              {/* Mark arrived button */}
              <button
                onClick={() => markArrived(item.medicationId)}
                className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium
                  bg-success/10 text-success hover:bg-success/20 transition-colors"
              >
                <Check className="h-3 w-3" />
                Arrived
              </button>
            </div>
          ))}

          {arrived.length > 0 && (
            <div className="pt-2 mt-2 border-t border-border">
              <span className="text-[10px] text-muted-foreground px-1">
                Recently arrived ({arrived.length})
              </span>
              {arrived.map(item => (
                <div
                  key={item.medicationId}
                  className="flex items-center gap-3 px-3 py-1.5 rounded-lg opacity-60"
                >
                  <Check className="h-3 w-3 text-success shrink-0" />
                  <span className="text-sm text-foreground truncate">{item.name}</span>
                  <span className="text-[11px] text-muted-foreground ml-auto tabular-nums">
                    {item.quantity} units
                  </span>
                </div>
              ))}
            </div>
          )}

          {pending.length === 0 && arrived.length === 0 && (
            <div className="text-center py-4 text-sm text-muted-foreground">
              Nothing in transit
            </div>
          )}
        </div>
      )}
    </div>
  )
}
