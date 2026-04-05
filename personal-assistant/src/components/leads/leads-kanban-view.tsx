'use client'

import React, { useCallback, useState, useMemo, memo } from 'react'
import type { UniqueIdentifier } from '@dnd-kit/core'
import {
  Kanban,
  KanbanBoard,
  KanbanColumn,
  KanbanItem,
  KanbanOverlay,
} from '@/components/ui/kanban'
import type { EnhancedLeadData, LeadStatus } from '@/lib/leads/types'
import { LeadCard } from './lead-card'

const BOARD_COLUMNS: Array<{
  id: LeadStatus
  label: string
  emptyText: string
}> = [
  { id: 'new', label: 'New', emptyText: 'No new leads -- discover prospects or wait for inbound' },
  { id: 'qualified', label: 'Qualified', emptyText: 'Move promising leads here' },
  { id: 'booked', label: 'Booked', emptyText: 'Leads with scheduled meetings' },
]

interface LeadsKanbanViewProps {
  grouped: Map<LeadStatus, EnhancedLeadData[]>
  onMoveLead: (leadId: string, newStatus: LeadStatus) => void
  onSelectLead: (lead: EnhancedLeadData) => void
  onAdvanceStage: (leadId: string, event: React.MouseEvent) => void
  movingLeadId: string | null
}

function LeadsKanbanViewInner({
  grouped,
  onMoveLead,
  onSelectLead,
  onAdvanceStage,
  movingLeadId: _movingLeadId,
}: LeadsKanbanViewProps) {
  // Build the kanban value: Record<UniqueIdentifier, EnhancedLeadData[]>
  const kanbanValue = useMemo(() => {
    const record: Record<UniqueIdentifier, EnhancedLeadData[]> = {}
    for (const col of BOARD_COLUMNS) {
      record[col.id] = grouped.get(col.id) ?? []
    }
    return record
  }, [grouped])

  const totalLeads = useMemo(
    () => BOARD_COLUMNS.reduce((sum, col) => sum + (grouped.get(col.id)?.length ?? 0), 0),
    [grouped],
  )

  const handleValueChange = useCallback(
    (newValue: Record<UniqueIdentifier, EnhancedLeadData[]>) => {
      // Detect which lead moved to which column
      for (const [colId, leads] of Object.entries(newValue)) {
        for (const lead of leads) {
          const originalCol = BOARD_COLUMNS.find((c) =>
            (grouped.get(c.id) ?? []).some((l) => l.id === lead.id)
          )
          if (originalCol && originalCol.id !== colId) {
            onMoveLead(lead.id, colId as LeadStatus)
          }
        }
      }
    },
    [grouped, onMoveLead],
  )

  return (
    <Kanban<EnhancedLeadData>
      value={kanbanValue}
      onValueChange={handleValueChange}
      getItemValue={(lead) => lead.id}
      flatCursor
    >
      <KanbanBoard
        className="grid min-h-0 flex-1 auto-rows-fr grid-cols-1 gap-4 overflow-x-auto sm:grid-cols-2 lg:grid-cols-3"
        role="application"
        aria-label="Lead pipeline kanban board"
        aria-roledescription="kanban board"
      >
        {BOARD_COLUMNS.map((column) => {
          const leads = kanbanValue[column.id] ?? []

          return (
            <KanbanColumn
              key={column.id}
              value={column.id}
              className="flex h-full flex-col"
              role="region"
              aria-label={`${column.label} column, ${leads.length} leads`}
            >
              {/* Column header */}
              <div className="flex items-center gap-2 px-1 pb-2">
                <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                  {column.label}
                </h3>
                <span className="flex h-5 min-w-5 items-center justify-center rounded-lg bg-secondary px-1 font-mono text-sm text-muted-foreground">
                  {leads.length}
                </span>
              </div>

              {/* Drop zone */}
              <div
                className="flex min-h-[120px] flex-1 flex-col gap-2 rounded-xl border border-dashed border-transparent p-2 transition-colors"
                aria-label={`Drop zone for ${column.label}`}
              >
                {leads.map((lead) => (
                  <KanbanItem key={lead.id} value={lead.id} asHandle>
                    <LeadCard lead={lead} onClick={onSelectLead} onAdvanceStage={onAdvanceStage} />
                  </KanbanItem>
                ))}

                {leads.length === 0 && (
                  <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    {column.emptyText}
                  </div>
                )}
              </div>
            </KanbanColumn>
          )
        })}
      </KanbanBoard>

      <KanbanOverlay>
        {({ value, variant }) => {
          if (variant === 'column') return null
          const allLeads = [...grouped.values()].flat()
          const lead = allLeads.find((l) => l.id === value)
          if (!lead) return null
          return (
            <div className="pointer-events-none w-64 opacity-90 drop-shadow-lg">
              <LeadCard lead={lead} />
            </div>
          )
        }}
      </KanbanOverlay>
    </Kanban>
  )
}

export const LeadsKanbanView = memo(LeadsKanbanViewInner)
