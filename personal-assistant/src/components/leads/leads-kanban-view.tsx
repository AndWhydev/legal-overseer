'use client'

import { useCallback, useState } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  DragOverEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import type { EnhancedLeadData, LeadStatus } from '@/lib/leads/types'
import { LeadCard } from './lead-card'

const BOARD_COLUMNS: Array<{
  id: string
  label: string
  statuses: LeadStatus[]
}> = [
  { id: 'new', label: 'New', statuses: ['new'] },
  { id: 'qualified', label: 'Qualified', statuses: ['qualified'] },
  { id: 'booked', label: 'Booked', statuses: ['booked'] },
  { id: 'won_lost', label: 'Won / Lost', statuses: ['converted', 'lost'] },
]

const STATUS_FOR_COLUMN: Record<string, LeadStatus> = {
  new: 'new',
  qualified: 'qualified',
  booked: 'booked',
  won_lost: 'converted',
}

interface LeadsKanbanViewProps {
  grouped: Map<LeadStatus, EnhancedLeadData[]>
  onMoveLead: (leadId: string, newStatus: LeadStatus) => void
  onSelectLead: (lead: EnhancedLeadData) => void
  movingLeadId: string | null
}

function KanbanDropColumn({
  columnId,
  label,
  leads,
  onSelectLead,
}: {
  columnId: string
  label: string
  leads: EnhancedLeadData[]
  onSelectLead: (lead: EnhancedLeadData) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: columnId })

  return (
    <div style={{ display: 'flex', flex: 1, minWidth: 240, flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 6px 8px' }}>
        <h3 style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: '#94A3B8',
          margin: 0,
        }}>
          {label}
        </h3>
        <span style={{ fontSize: 11, fontWeight: 500, fontFamily: 'var(--font-mono)', color: '#475569' }}>
          {leads.length}
        </span>
      </div>

      <div
        ref={setNodeRef}
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          borderRadius: 14,
          padding: 6,
          background: isOver ? 'rgba(255, 255, 255, 0.03)' : 'transparent',
          transition: 'background 0.2s ease',
          minHeight: 120,
        }}
      >
        <SortableContext
          items={leads.map((l) => l.id)}
          strategy={verticalListSortingStrategy}
        >
          {leads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} onClick={onSelectLead} />
          ))}
        </SortableContext>

        {leads.length === 0 && (
          <div style={{
            padding: '24px 12px',
            textAlign: 'center',
            fontSize: 12,
            color: '#475569',
            borderRadius: 12,
            border: '1px dashed rgba(255, 255, 255, 0.06)',
          }}>
            No leads
          </div>
        )}
      </div>
    </div>
  )
}

export function LeadsKanbanView({ grouped, onMoveLead, onSelectLead, movingLeadId }: LeadsKanbanViewProps) {
  const [activeLead, setActiveLead] = useState<EnhancedLeadData | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  const getColumnLeads = useCallback(
    (statuses: LeadStatus[]) => statuses.flatMap((s) => grouped.get(s) ?? []),
    [grouped],
  )

  function handleDragStart(event: DragStartEvent) {
    const allLeads = [...grouped.values()].flat()
    const lead = allLeads.find((l) => l.id === event.active.id)
    if (lead) setActiveLead(lead)
  }

  function handleDragOver(_event: DragOverEvent) {
    // Visual feedback handled by useDroppable isOver state
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveLead(null)
    const { active, over } = event
    if (!over) return

    const leadId = active.id as string
    const overId = over.id as string

    // Find which column was dropped on
    const targetColumn = BOARD_COLUMNS.find((c) => c.id === overId)
    if (targetColumn) {
      const newStatus = STATUS_FOR_COLUMN[targetColumn.id]
      if (newStatus) onMoveLead(leadId, newStatus)
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 12,
        flex: 1,
        minHeight: 0,
        alignItems: 'stretch',
      }}>
        {BOARD_COLUMNS.map((column) => (
          <KanbanDropColumn
            key={column.id}
            columnId={column.id}
            label={column.label}
            leads={getColumnLeads(column.statuses)}
            onSelectLead={onSelectLead}
          />
        ))}
      </div>

      <DragOverlay>
        {activeLead ? (
          <div style={{
            width: 260,
            transform: 'rotate(2deg)',
            filter: 'drop-shadow(0 16px 32px rgba(0,0,0,0.4))',
          }}>
            <LeadCard lead={activeLead} />
          </div>
        ) : null}
      </DragOverlay>

      <style>{`
        @media (max-width: 1024px) {
          [style*="grid-template-columns: repeat(4"] {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
        @media (max-width: 640px) {
          [style*="grid-template-columns: repeat(4"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </DndContext>
  )
}
