'use client'

import React, { useState, memo } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

interface NextActionPanelProps {
  nextAction: string | null
  nextActionAt: string | null
  onSave: (action: string, date: string | null) => void
}

function NextActionPanelInner({ nextAction, nextActionAt, onSave }: NextActionPanelProps) {
  const [action, setAction] = useState(nextAction ?? '')
  const [date, setDate] = useState(nextActionAt ? nextActionAt.split('T')[0] : '')
  const [saving, setSaving] = useState(false)

  const hasChanged = action !== (nextAction ?? '') || date !== (nextActionAt ? nextActionAt.split('T')[0] : '')

  async function handleSave() {
    setSaving(true)
    try {
      await onSave(action, date || null)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <h4 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Next Action
      </h4>

      <div className="space-y-2">
        <Input
          type="text"
          value={action}
          onChange={(e) => setAction(e.target.value)}
          placeholder="What's the next step?"
          aria-label="Next action description"
        />

        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-label="Next action date"
            className="flex-1"
          />

          <Button
            onClick={handleSave}
            disabled={!hasChanged || saving}
            variant={hasChanged ? 'default' : 'secondary'}
          >
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export const NextActionPanel = memo(NextActionPanelInner)
