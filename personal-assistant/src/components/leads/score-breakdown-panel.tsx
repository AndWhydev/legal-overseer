'use client'

import React, { memo } from 'react'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import type { ScoreBreakdown } from '@/lib/leads/types'

interface ScoreBreakdownPanelProps {
  fitScore: number
  opportunityScore: number
  fitBreakdown: ScoreBreakdown | null
  opportunityBreakdown: ScoreBreakdown | null
}

function ScoreGauge({ label, score }: { label: string; score: number }) {
  const pct = Math.min(score, 100)
  return (
    <div className="flex-1 space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[12px] text-muted-foreground">{label}</span>
        <span className="text-sm font-medium font-mono text-foreground" aria-label={`${label} score: ${score}`}>
          {score}
        </span>
      </div>
      <Progress value={pct} className="h-1" />
    </div>
  )
}

function FactorList({ title, breakdown }: { title: string; breakdown: ScoreBreakdown | null }) {
  if (!breakdown?.components?.length) return null
  return (
    <div className="space-y-0.5">
      <div className="text-[12px] font-medium text-muted-foreground">{title}</div>
      {breakdown.components.map((c, i) => (
        <div key={i} className="flex items-center justify-between py-0.5">
          <span className="text-sm text-muted-foreground">{c.factor}</span>
          <Badge variant="secondary" className="font-mono text-[12px] tabular-nums">
            {c.points > 0 ? '+' : ''}{c.points}
          </Badge>
        </div>
      ))}
    </div>
  )
}

function ScoreBreakdownPanelInner({ fitScore, opportunityScore, fitBreakdown, opportunityBreakdown }: ScoreBreakdownPanelProps) {
  return (
    <div className="space-y-3">
      <h4 className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
        Score Breakdown
      </h4>

      <div className="flex gap-4">
        <ScoreGauge label="Fit" score={fitScore} />
        <ScoreGauge label="Opportunity" score={opportunityScore} />
      </div>

      <FactorList title="Fit Factors" breakdown={fitBreakdown} />
      <FactorList title="Opportunity Factors" breakdown={opportunityBreakdown} />
    </div>
  )
}

export const ScoreBreakdownPanel = memo(ScoreBreakdownPanelInner)
