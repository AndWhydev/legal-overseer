'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { DayCell } from './day-cell'
import type { DaySchedule, Medication, MonthData } from '@/lib/medications/types'

interface MonthlyGridProps {
  monthData: MonthData
  medications: Record<string, Medication>
  year: number
  month: number // 0-indexed
  onToggleDose: (date: string, medicationId: string) => void
  onTakeAll: (date: string) => void
}

const DAY_HEADERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

export function MonthlyGrid({
  monthData,
  medications,
  year,
  month,
  onToggleDose,
  onTakeAll,
}: MonthlyGridProps) {
  const todayStr = useMemo(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  }, [])

  // Build grid: figure out which day-of-week the 1st falls on
  const firstDay = new Date(year, month, 1).getDay() // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7

  // Map schedule data by date
  const scheduleMap = useMemo(() => {
    const map: Record<string, DaySchedule> = {}
    for (const s of monthData) {
      map[s.date] = s
    }
    return map
  }, [monthData])

  const emptySchedule: DaySchedule = {
    date: '',
    medications: [],
    status: 'empty',
  }

  return (
    <div className="w-full">
      {/* Day headers */}
      <div className="grid grid-cols-7 gap-2 mb-2">
        {DAY_HEADERS.map((d, i) => (
          <div
            key={i}
            className={cn(
              'text-center text-xs font-medium py-1',
              (i === 0 || i === 6) ? 'text-muted-foreground/60' : 'text-muted-foreground',
            )}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: totalCells }, (_, idx) => {
          const dayNum = idx - firstDay + 1
          const isValidDay = dayNum >= 1 && dayNum <= daysInMonth

          if (!isValidDay) {
            return (
              <div
                key={idx}
                className="min-h-[100px] rounded-xl border border-transparent"
              />
            )
          }

          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
          const schedule = scheduleMap[dateStr] || { ...emptySchedule, date: dateStr }
          const isToday = dateStr === todayStr
          const isPast = dateStr < todayStr

          return (
            <DayCell
              key={dateStr}
              schedule={schedule}
              medications={medications}
              isToday={isToday}
              isPast={isPast}
              dayNumber={dayNum}
              onToggleDose={onToggleDose}
              onTakeAll={onTakeAll}
            />
          )
        })}
      </div>
    </div>
  )
}
