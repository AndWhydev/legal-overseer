'use client'

import { useState, useMemo } from 'react'
import { SFShippingbox, SFChevronDown, SFChevronRight, SFArrowUpArrowDown } from 'sf-symbols-lib'
import { cn } from '@/lib/utils'
import { StockIndicator } from './stock-indicator'
import { getInventoryStatus, type InventoryStatus } from '@/lib/medications/inventory'
import { inventoryItems } from '@/lib/medications/inventory-seed'
import { medications, medicationMap } from '@/lib/medications/seed-data'

type SortMode = 'health' | 'name' | 'category'

const healthOrder = { red: 0, amber: 1, green: 2 }

const categoryLabels: Record<string, string> = {
  prescription: 'Prescription',
  supplement: 'Supplements',
  nootropic: 'Nootropics',
}

const categoryOrder: Record<string, number> = {
  prescription: 0,
  supplement: 1,
  nootropic: 2,
}

interface CollapsibleSectionProps {
  title: string
  count: number
  children: React.ReactNode
  defaultOpen?: boolean
}

function CollapsibleSection({ title, count, children, defaultOpen = true }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 w-full px-1 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? <SFChevronDown className="h-3 w-3" /> : <SFChevronRight className="h-3 w-3" />}
        {title}
        <span className="text-text-muted ml-auto">{count}</span>
      </button>
      {open && <div className="space-y-1">{children}</div>}
    </div>
  )
}

function InventoryRow({ item }: { item: InventoryStatus }) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-lg transition-smooth',
        'hover:bg-elevated/50',
        item.urgentRed && 'bg-destructive/5 border border-destructive/10'
      )}
    >
      {/* Pill indicator dot */}
      <div
        className="h-3 w-3 rounded-full shrink-0"
        style={{ backgroundColor: medicationMap[item.medicationId]?.pillStyle?.primaryColor ?? '#888' }}
      />

      {/* Name + dose */}
      <div className="flex-1 min-w-0">
        <div className="text-sm text-foreground truncate">{item.name}</div>
        <div className="text-[11px] text-muted-foreground">{item.doseMg}mg</div>
      </div>

      {/* Stock count */}
      <div className="text-right shrink-0">
        <div className="text-sm tabular-nums text-foreground">{item.currentStock}</div>
        <div className="text-[10px] text-muted-foreground">remaining</div>
      </div>

      {/* Health indicator */}
      <div className="shrink-0 w-24">
        <StockIndicator
          health={item.stockHealth}
          daysRemaining={item.daysRemaining}
          size="sm"
        />
      </div>
    </div>
  )
}

export function InventoryPanel({ className }: { className?: string }) {
  const [sortMode, setSortMode] = useState<SortMode>('health')

  const statuses = useMemo(
    () => getInventoryStatus(inventoryItems, medications),
    []
  )

  const sorted = useMemo(() => {
    const items = [...statuses]
    switch (sortMode) {
      case 'health':
        items.sort((a, b) => healthOrder[a.stockHealth] - healthOrder[b.stockHealth])
        break
      case 'name':
        items.sort((a, b) => a.name.localeCompare(b.name))
        break
      case 'category':
        items.sort((a, b) => categoryOrder[a.category] - categoryOrder[b.category])
        break
    }
    return items
  }, [statuses, sortMode])

  const grouped = useMemo(() => {
    if (sortMode !== 'category') return null
    const groups: Record<string, InventoryStatus[]> = {}
    for (const item of sorted) {
      const cat = item.category
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(item)
    }
    return groups
  }, [sorted, sortMode])

  const urgentCount = statuses.filter(s => s.urgentRed).length
  const amberCount = statuses.filter(s => s.stockHealth === 'amber').length

  return (
    <div className={cn('glass-card rounded-xl p-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <SFShippingbox className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Inventory</h3>
          {urgentCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-destructive/15 text-destructive font-medium">
              {urgentCount} urgent
            </span>
          )}
          {amberCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-warning/15 text-warning font-medium">
              {amberCount} low
            </span>
          )}
        </div>

        {/* Sort toggle */}
        <button
          onClick={() => {
            const modes: SortMode[] = ['health', 'name', 'category']
            const next = modes[(modes.indexOf(sortMode) + 1) % modes.length]
            setSortMode(next)
          }}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <SFArrowUpArrowDown className="h-3 w-3" />
          {sortMode}
        </button>
      </div>

      {/* Item list */}
      <div className="space-y-0.5 max-h-[400px] overflow-y-auto">
        {grouped
          ? Object.entries(grouped)
              .sort(([a], [b]) => categoryOrder[a] - categoryOrder[b])
              .map(([cat, items]) => (
                <CollapsibleSection
                  key={cat}
                  title={categoryLabels[cat] ?? cat}
                  count={items.length}
                >
                  {items.map(item => (
                    <InventoryRow key={item.medicationId} item={item} />
                  ))}
                </CollapsibleSection>
              ))
          : sorted.map(item => (
              <InventoryRow key={item.medicationId} item={item} />
            ))}
      </div>

      {/* Summary footer */}
      <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{statuses.length} medications tracked</span>
        <span className="tabular-nums">
          {statuses.reduce((sum, s) => sum + s.currentStock, 0)} total units
        </span>
      </div>
    </div>
  )
}
