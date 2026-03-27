'use client'

import React, { useState } from 'react'
import { IconCheck } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { PillIcon } from './pill-icon'
import type { DaySchedule, Medication } from '@/lib/medications/types'

interface DayCellProps {
  schedule: DaySchedule
  medications: Record<string, Medication>
  isToday: boolean
  isPast: boolean
  dayNumber: number
  onToggleDose: (date: string, medicationId: string) => void
  onTakeAll: (date: string) => void
}

export const DayCell = React.memo(function DayCell({
  schedule,
  medications,
  isToday,
  isPast,
  dayNumber,
  onToggleDose,
  onTakeAll,
}: DayCellProps) {
  const [hovered, setHovered] = useState(false)
  const isEmpty = schedule.medications.length === 0
  const isComplete = schedule.status === 'complete'
  const isPartial = schedule.status === 'partial'
  const hasPending = schedule.medications.some(e => !e.taken)

  return (
    <div
      className={cn(
        'group relative flex flex-col rounded-xl border p-2 transition-all duration-200 min-h-[100px]',
        // Base styles
        'bg-card/50',
        // Today: amber glow
        isToday && 'border-primary/60 shadow-[0_0_12px_rgba(212,165,116,0.2)]',
        // Past + complete: settled
        isPast && isComplete && 'border-border/40 opacity-70',
        // Past + incomplete
        isPast && !isComplete && !isEmpty && 'border-border/50 opacity-80',
        // Future
        !isPast && !isToday && 'border-border/30',
        // Empty
        isEmpty && 'border-border/20 opacity-50',
        // Hover lift
        !isEmpty && 'hover:border-border-hover hover:-translate-y-0.5 hover:shadow-md',
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Date number */}
      <div className="flex items-center justify-between mb-1.5">
        <span
          className={cn(
            'text-xs font-medium',
            isToday && 'text-primary font-semibold',
            isPast && 'text-text-muted',
            !isPast && !isToday && 'text-text-secondary',
          )}
        >
          {dayNumber}
        </span>

        {/* Complete checkmark */}
        {isComplete && (
          <div className="flex h-4 w-4 items-center justify-center rounded-full bg-success/20">
            <IconCheck className="h-2.5 w-2.5 text-success" />
          </div>
        )}

        {/* Partial indicator */}
        {isPartial && (
          <div className="h-1.5 w-1.5 rounded-full bg-warning" />
        )}
      </div>

      {/* Pills grid */}
      {!isEmpty && (
        <div className="flex flex-wrap gap-1 flex-1 items-start content-start">
          {schedule.medications.map((dosage) => {
            const med = medications[dosage.medicationId]
            if (!med) return null

            // Show individual pill icons for each dose (capped at 4 to save space)
            const displayDoses = Math.min(dosage.doses, 4)
            const extraDoses = dosage.doses - displayDoses

            return Array.from({ length: displayDoses }, (_, i) => (
              <PillIcon
                key={`${dosage.medicationId}-${i}`}
                style={med.pillStyle}
                size={14}
                taken={dosage.taken}
                onClick={() => onToggleDose(schedule.date, dosage.medicationId)}
                tooltip={`${med.name} ${med.doseMg}mg${dosage.doses > 1 ? ` (${dosage.doses}x)` : ''}`}
              />
            )).concat(
              extraDoses > 0
                ? [
                    <span
                      key={`${dosage.medicationId}-extra`}
                      className="text-[9px] text-text-muted leading-none self-center"
                    >
                      +{extraDoses}
                    </span>,
                  ]
                : []
            )
          })}
        </div>
      )}

      {/* Take All button — shows on hover when there are pending doses */}
      {hovered && hasPending && !isEmpty && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onTakeAll(schedule.date)
          }}
          className={cn(
            'absolute inset-x-1 bottom-1 flex items-center justify-center gap-1',
            'rounded-lg bg-success/15 py-0.5 text-[10px] font-medium text-success',
            'transition-all duration-150 hover:bg-success/25',
            'animate-fade-in',
          )}
        >
          <IconCheck className="h-2.5 w-2.5" />
          Take All
        </button>
      )}
    </div>
  )
})
