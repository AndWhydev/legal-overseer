'use client'

import { useCallback, useState } from 'react'
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
import type { EnhancedLeadData, LeadStatus } from '@/lib/leads/types'
import { LeadCard } from './lead-card'

const BOARD_COLUMNS: Array<{
  id: LeadStatus
  label: string
  color: string
  emptyText: string
}> = [
  { id: 'new', label: 'New', color: 'var(--bb-blue)', emptyText: 'No new leads — run PCC or wait for inbound' },
  { id: 'qualified', label: 'Qualified', color: 'var(--bb-amber)', emptyText: 'Move promising leads here' },
  { id: 'booked', label: 'Booked', color: 'var(--bb-green)', emptyText: 'Leads with scheduled meetings' },
]

interface LeadsKanbanViewProps {
  grouped: Map<LeadStatus, EnhancedLeadData[]>
  onMoveLead: (leadId: string, newStatus: LeadStatus) => void
  onSelectLead: (lead: EnhancedLeadData) => void
  onAdvanceStage: (leadId: string, event: React.MouseEvent) => void
  movingLeadId: string | null
}

function KanbanDropColumn({
  columnId,
  label,
  color,
  emptyText,
  leads,
  totalLeads,
  onSelectLead,
}: {
  columnId: LeadStatus
  label: string
  color: string
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
    <div className="kanban-col" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Column header */}
      <div style={{ padding: '0 8px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <h3 style={{
            fontSize: 14,
            fontWeight: 500,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: 'var(--text-secondary)',
            margin: 0,
          }}>
            {label}
          </h3>
          <span style={{
            fontSize: 14,
            fontWeight: 500,
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-dim)',
          }}>
            {leads.length}
          </span>
        </div>

        {/* Progress bar — visible on column hover via CSS */}
        <div style={{ height: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 8, overflow: 'hidden' }}>
          <div
            className="col-progress"
            style={{
              height: '100%',
              width: progressWidth + '%',
              background: color,
              borderRadius: 8,
            }}
          />
        </div>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          borderRadius: 12,
          padding: 8,
          minHeight: 120,
          background: isOver ? 'rgba(255, 255, 255, 0.03)' : 'transparent',
          border: isOver
            ? '1px dashed rgba(255, 255, 255, 0.15)'
            : '1px dashed transparent',
          animation: isOver ? 'bb-drop-pulse 1s ease infinite' : 'none',
          transition: 'background 0.2s ease',
        }}
      >
        <SortableContext items={leads.map((l) => l.id)} strategy={verticalListSortingStrategy}>
          {leads.map((lead, index) => (
            <div
              key={lead.id}
              style={{
                animation: 'bb-card-enter 200ms cubic-bezier(0.2, 0.9, 0.3, 1) both',
                animationDelay: index * 30 + 'ms',
              }}
            >
              <LeadCard lead={lead} onClick={onSelectLead} />
            </div>
          ))}
        </SortableContext>

        {leads.length === 0 && (
          <div style={{
            padding: '24px 12px',
            textAlign: 'center',
            fontSize: 14,
            color: 'var(--text-dim)',
            borderRadius: 12,
            border: '1px dashed var(--border-subtle)',
          }}>
            {emptyText}
          </div>
        )}
      </div>
    </div>
  )
}

export function LeadsKanbanView({
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
        className="leads-kanban-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 12,
          flex: 1,
          minHeight: 0,
          alignItems: 'stretch',
        }}
      >
        {BOARD_COLUMNS.map((column) => (
          <KanbanDropColumn
            key={column.id}
            columnId={column.id}
            label={column.label}
            color={column.color}
            emptyText={column.emptyText}
            leads={getColumnLeads(column.id)}
            totalLeads={totalLeads}
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
        @keyframes bb-card-enter {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes bb-drop-pulse {
          0%, 100% { border-color: rgba(255, 255, 255, 0.15); }
          50% { border-color: rgba(255, 255, 255, 0.3); }
        }
        .kanban-col .col-progress {
          opacity: 0;
          transition: opacity 0.2s ease;
        }
        .kanban-col:hover .col-progress {
          opacity: 1;
        }
        @media (max-width: 1024px) {
          .leads-kanban-grid {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
        @media (max-width: 640px) {
          .leads-kanban-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </DndContext>
  )
}
