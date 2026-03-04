'use client'

import { motion, AnimatePresence } from 'motion/react'
import { ProcessPipeline, type PipelineStage } from '@/components/ui/data-viz/process-pipeline'
import type { PlanStage } from '@/lib/agent/planner'

export interface ChatPipelineStage extends PlanStage {
  status: 'idle' | 'active' | 'done' | 'error'
}

interface ThoughtPipelineProps {
  stages: ChatPipelineStage[]
  visible: boolean
  phase?: 'skeleton' | 'plan' | 'done'
}

/** Map plan status to ProcessPipeline status */
function toPipelineStatus(status: ChatPipelineStage['status']): PipelineStage['status'] {
  switch (status) {
    case 'active': return 'active'
    case 'done': return 'active' // green = active in ProcessPipeline
    case 'error': return 'error'
    case 'idle':
    default: return 'idle'
  }
}

/** Map ChatPipelineStages to ProcessPipeline's PipelineStage format */
function toPipelineStages(stages: ChatPipelineStage[]): PipelineStage[] {
  return stages.map(s => ({
    label: s.label,
    sublabel: s.sublabel,
    icon: s.icon,
    status: toPipelineStatus(s.status),
  }))
}

export function ThoughtPipeline({ stages, visible, phase = 'plan' }: ThoughtPipelineProps) {
  if (stages.length === 0) return null

  const isSkeleton = phase === 'skeleton'
  const isDone = phase === 'done'

  return (
    <AnimatePresence mode="wait">
      {visible && (
        <motion.div
          key={isSkeleton ? 'skeleton' : 'pipeline'}
          className={`bb-chat__pipeline ${isSkeleton ? 'bb-chat__pipeline--skeleton' : ''} ${isDone ? 'bb-chat__pipeline--done' : ''}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: isDone ? 0.5 : 1, y: 0 }}
          exit={{ opacity: 0, y: -4, transition: { duration: 0.2 } }}
          transition={{ duration: 0.25 }}
        >
          <ProcessPipeline
            stages={toPipelineStages(stages)}
            connectorWidth={24}
            className="bb-chat__pipeline-inner"
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
