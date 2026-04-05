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
    <div className="flex-1 space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <span className="text-base font-medium font-mono text-foreground" aria-label={`${label} score: ${score}`}>
          {score}
        </span>
      </div>
      <Progress value={pct} className="h-1.5" />
    </div>
  )
}

function FactorList({ breakdown }: { breakdown: ScoreBreakdown | null }) {
  if (!breakdown?.components?.length) return null
  return (
    <div className="space-y-1">
      {breakdown.components.map((c, i) => (
        <div key={i} className="flex items-center justify-between py-1">
          <span className="text-sm text-muted-foreground">
            {c.factor}
            {c.note && <span className="ml-1 text-muted-foreground">({c.note})</span>}
          </span>
          <Badge variant="secondary" className="font-mono tabular-nums">
            {c.points > 0 ? '+' : ''}{c.points}
          </Badge>
        </div>
      ))}
    </div>
  )
}

function ScoreBreakdownPanelInner({ fitScore, opportunityScore, fitBreakdown, opportunityBreakdown }: ScoreBreakdownPanelProps) {
  return (
    <div>
      <h4 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">
        Score Breakdown
      </h4>

      <div className="mb-4 flex gap-4">
        <ScoreGauge label="Fit" score={fitScore} />
        <ScoreGauge label="Opportunity" score={opportunityScore} />
      </div>

      {fitBreakdown && (
        <div className="mb-3">
          <div className="mb-2 text-sm font-medium text-muted-foreground">Fit Factors</div>
          <FactorList breakdown={fitBreakdown} />
        </div>
      )}

      {opportunityBreakdown && (
        <div>
          <div className="mb-2 text-sm font-medium text-muted-foreground">Opportunity Factors</div>
          <FactorList breakdown={opportunityBreakdown} />
        </div>
      )}
    </div>
  )
}

export const ScoreBreakdownPanel = memo(ScoreBreakdownPanelInner)
