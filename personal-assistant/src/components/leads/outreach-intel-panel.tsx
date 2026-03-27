'use client'

import React, { memo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'

interface OutreachIntelPanelProps {
  opportunityNotes: string | null
  outreachAngle: string | null
  priorityServices: string[] | null
}

function parseNotesByCategory(notes: string): Array<{ category: string; note: string }> {
  if (!notes) return []
  return notes.split(';').map((n) => n.trim()).filter(Boolean).map((n) => {
    const colonIdx = n.indexOf(':')
    if (colonIdx > 0 && colonIdx < 20) {
      return { category: n.substring(0, colonIdx).trim(), note: n.substring(colonIdx + 1).trim() }
    }
    return { category: 'General', note: n }
  })
}

function OutreachIntelPanelInner({ opportunityNotes, outreachAngle, priorityServices }: OutreachIntelPanelProps) {
  const parsedNotes = parseNotesByCategory(opportunityNotes ?? '')

  return (
    <div>
      <h4 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Outreach Intelligence
      </h4>

      {outreachAngle && (
        <Card className="mb-4 gap-1 py-3">
          <CardContent>
            <div className="text-xs font-medium uppercase text-muted-foreground">Suggested Angle</div>
            <div className="text-sm font-medium text-foreground">{outreachAngle}</div>
          </CardContent>
        </Card>
      )}

      {parsedNotes.length > 0 && (
        <div className="mb-4 space-y-2">
          {parsedNotes.map((n, i) => (
            <div key={i} className="flex items-start gap-2">
              <Badge variant="secondary" className="mt-0.5 shrink-0">
                {n.category}
              </Badge>
              <span className="text-sm text-muted-foreground">{n.note}</span>
            </div>
          ))}
        </div>
      )}

      {priorityServices && priorityServices.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-medium text-muted-foreground">Priority Services</div>
          <div className="flex flex-wrap gap-1.5">
            {priorityServices.map((s) => (
              <Badge key={s} variant="outline">{s}</Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export const OutreachIntelPanel = memo(OutreachIntelPanelInner)
