'use client'

import React, { useCallback, useState, memo } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  useDroppable,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
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

const KanbanDropColumn = memo(function KanbanDropColumn({
  columnId,
  label,
  emptyText,
  leads,
  totalLeads,
  onSelectLead,
}: {
  columnId: LeadStatus
  label: string
  emptyText: string
  leads: EnhancedLeadData[]
  totalLeads: number
  onSelectLead: (lead: EnhancedLeadData) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: columnId })

  const progressWidth = totalLeads > 0
    ? Math.max(4, (leads.length / totalLeads) * 100)
    : 0

  return (
    <div
      className="flex h-full flex-col"
      role="region"
      aria-label={`${label} column, ${leads.length} leads`}
    >
      {/* Column header */}
      <div className="px-2 pb-2">
        <div className="mb-2 flex items-center gap-2">
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </h3>
          <span className="text-sm font-medium font-mono text-muted-foreground" aria-label={`${leads.length} leads`}>
            {leads.length}
          </span>
        </div>
        <Progress value={progressWidth} className="h-0.5" />
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={cn(
          'flex min-h-[120px] flex-1 flex-col gap-2.5 rounded-xl p-2 transition-colors',
          isOver
            ? 'border border-dashed border-ring/30 bg-muted/50'
            : 'border border-dashed border-transparent'
        )}
        aria-label={`Drop zone for ${label}`}
      >
        <SortableContext items={leads.map((l) => l.id)} strategy={verticalListSortingStrategy}>
          {leads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} onClick={onSelectLead} />
          ))}
        </SortableContext>

        {leads.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            {emptyText}
          </div>
        )}
      </div>
    </div>
  )
})

function LeadsKanbanViewInner({
  grouped,
  onMoveLead,
  onSelectLead,
  onAdvanceStage: _onAdvanceStage,
  movingLeadId: _movingLeadId,
}: LeadsKanbanViewProps) {
  const [activeLead, setActiveLead] = useState<EnhancedLeadData | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  const getColumnLeads = useCallback(
    (status: LeadStatus) => grouped.get(status) ?? [],
    [grouped],
  )

  const totalLeads = BOARD_COLUMNS.reduce(
    (sum, col) => sum + (grouped.get(col.id)?.length ?? 0),
    0,
  )

  function handleDragStart(event: DragStartEvent) {
    const allLeads = [...grouped.values()].flat()
    const lead = allLeads.find((l) => l.id === event.active.id)
    if (lead) setActiveLead(lead)
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveLead(null)
    const { active, over } = event
    if (!over) return

    const leadId = active.id as string
    const overId = over.id as string

    const targetColumn = BOARD_COLUMNS.find((c) => c.id === overId)
    if (targetColumn) {
      onMoveLead(leadId, targetColumn.id)
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div
        className="grid min-h-0 flex-1 auto-rows-fr grid-cols-1 gap-4 overflow-x-auto sm:grid-cols-2 lg:grid-cols-3"
        role="application"
        aria-label="Lead pipeline kanban board"
        aria-roledescription="kanban board"
      >
        {BOARD_COLUMNS.map((column) => (
          <KanbanDropColumn
            key={column.id}
            columnId={column.id}
            label={column.label}
            emptyText={column.emptyText}
            leads={getColumnLeads(column.id)}
            totalLeads={totalLeads}
            onSelectLead={onSelectLead}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeLead ? (
          <div className="pointer-events-none w-64 opacity-90 drop-shadow-lg">
            <LeadCard lead={activeLead} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

export const LeadsKanbanView = memo(LeadsKanbanViewInner)
