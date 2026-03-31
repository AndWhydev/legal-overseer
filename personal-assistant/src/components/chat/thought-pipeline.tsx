'use client'

import { motion, AnimatePresence } from 'motion/react'
import { Shimmer } from '@/components/ai-elements/shimmer'
import type { PlanStage } from '@/lib/agent/planner'

export interface ChatPipelineStage extends PlanStage {
  status: 'pending' | 'active' | 'done' | 'error'
}

interface ThoughtPipelineProps {
  stages: ChatPipelineStage[]
  visible: boolean
}

function PipelineStage({
  stage,
  index,
}: {
  stage: ChatPipelineStage
  index: number
}) {
  return (
    <motion.div
      key={stage.id}
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.2,
        delay: index * 0.05,
      }}
      className="flex items-center gap-2 text-sm"
    >
      <span className="w-5 text-center">{stage.icon}</span>
      <span
        className={
          stage.status === 'done' ? 'text-muted-foreground/60 line-through' :
          stage.status === 'active' ? 'text-foreground font-medium' :
          stage.status === 'error' ? 'text-destructive' :
          'text-muted-foreground'
        }
      >
        {stage.label}
      </span>
      {stage.sublabel && stage.status === 'active' && (
        <span className="text-xs uppercase tracking-wider text-muted-foreground/70">
          <Shimmer duration={1.2}>{stage.sublabel}</Shimmer>
        </span>
      )}
    </motion.div>
  )
}

export function ThoughtPipeline({
  stages,
  visible,
}: ThoughtPipelineProps) {
  return (
    <AnimatePresence initial={false}>
      {visible && (
        <motion.div
          key="pipeline"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4, transition: { duration: 0.2 } }}
          transition={{ duration: 0.25 }}
        >
          <div className="mb-2 space-y-1">
            {stages.map((stage, i) => (
              <PipelineStage key={stage.id} stage={stage} index={i} />
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
