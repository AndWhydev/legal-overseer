'use client'

import React, { useState, memo } from 'react'
import { IconCalendar } from '@tabler/icons-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

interface NextActionPanelProps {
  nextAction: string | null
  nextActionAt: string | null
  onSave: (action: string, date: string | null) => void
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function NextActionPanelInner({ nextAction, nextActionAt, onSave }: NextActionPanelProps) {
  const [action, setAction] = useState(nextAction ?? '')
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    nextActionAt ? new Date(nextActionAt) : undefined
  )
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const originalDate = nextActionAt ? nextActionAt.split('T')[0] : ''
  const currentDate = selectedDate ? selectedDate.toISOString().split('T')[0] : ''
  const hasChanged = action !== (nextAction ?? '') || currentDate !== originalDate

  async function handleSave() {
    setSaving(true)
    try {
      await onSave(action, currentDate || null)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-2">
      <h4 className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
        Next Action
      </h4>

      <Input
        type="text"
        value={action}
        onChange={(e) => setAction(e.target.value)}
        placeholder="What's the next step?"
        aria-label="Next action description"
      />

      <div className="flex items-center gap-2">
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "h-8 flex-1 justify-start text-left",
                !selectedDate && "text-muted-foreground"
              )}
            >
              <IconCalendar size={14} />
              {selectedDate ? formatDate(selectedDate.toISOString()) : 'Pick a date'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => {
                setSelectedDate(date ?? undefined)
                setCalendarOpen(false)
              }}
              disabled={{ before: new Date() }}
            />
          </PopoverContent>
        </Popover>

        {selectedDate && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-muted-foreground"
            onClick={() => setSelectedDate(undefined)}
          >
            Clear
          </Button>
        )}

        <Button
          size="sm"
          className="h-8"
          onClick={handleSave}
          disabled={!hasChanged || saving}
          variant={hasChanged ? 'default' : 'secondary'}
        >
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </div>
  )
}

export const NextActionPanel = memo(NextActionPanelInner)
