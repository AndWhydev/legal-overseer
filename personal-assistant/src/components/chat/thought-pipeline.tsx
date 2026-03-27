'use client'

import { motion, AnimatePresence } from 'motion/react'
import { IconCheck, IconAlertCircle } from '@tabler/icons-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { PlanStage } from '@/lib/agent/planner'

export interface ChatPipelineStage extends PlanStage {
  status: 'idle' | 'active' | 'done' | 'error'
}

interface ThoughtPipelineProps {
  stages: ChatPipelineStage[]
  visible: boolean
  phase?: 'skeleton' | 'plan' | 'done'
}

/** Animated thinking ellipsis */
function ThinkingEllipsis() {
  return (
    <span className="inline-flex gap-0.5">
      <motion.span
        initial={{ opacity: 0.4 }}
        animate={{ opacity: [0.4, 1] }}
        transition={{ duration: 0.6, repeat: Infinity }}
        className="inline-block"
      >
        .
      </motion.span>
      <motion.span
        initial={{ opacity: 0.4 }}
        animate={{ opacity: [0.4, 1] }}
        transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }}
        className="inline-block"
      >
        .
      </motion.span>
      <motion.span
        initial={{ opacity: 0.4 }}
        animate={{ opacity: [0.4, 1] }}
        transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }}
        className="inline-block"
      >
        .
      </motion.span>
    </span>
  )
}

/** Pulsing shimmer thinking indicator */
function ThinkingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col gap-3 items-center"
    >
      <motion.div className="relative w-8 h-8 flex items-center justify-center">
        {/* Outer pulsing glow */}
        <motion.div
          initial={{ opacity: 0.3 }}
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="absolute w-full h-full rounded-full bg-muted-foreground/10 shadow-[0_0_12px_rgba(var(--foreground-rgb),0.15)]"
        />
        {/* Inner shimmer particles */}
        {[0, 1, 2].map(i => (
          <motion.div
            key={i}
            animate={{ rotate: 360, scale: [1, 0.6, 1] }}
            transition={{ duration: 3 + i * 0.5, repeat: Infinity, delay: i * 0.3 }}
            className="absolute rounded-full border border-muted-foreground/15"
            style={{ width: `${28 - i * 6}px`, height: `${28 - i * 6}px` }}
          />
        ))}
        {/* Center sparkle */}
        <motion.div
          initial={{ opacity: 0.6, scale: 1 }}
          animate={{ scale: [1, 1.2, 1], opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="w-1 h-1 rounded-full bg-foreground/80"
        />
      </motion.div>
      <div className="text-sm text-muted-foreground font-medium">
        Thinking<ThinkingEllipsis />
      </div>
    </motion.div>
  )
}

/** Individual stage component */
function PipelineStage({
  stage,
  index,
}: {
  stage: ChatPipelineStage
  index: number
}) {
  const statusVariant = {
    idle: 'secondary' as const,
    active: 'default' as const,
    done: 'secondary' as const,
    error: 'destructive' as const,
  }

  return (
    <motion.div
      key={stage.id}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.4,
        delay: index * 0.15,
        ease: [0.34, 1.56, 0.64, 1],
      }}
      className={`flex items-center gap-3 px-3 py-3 rounded-lg border transition-all duration-300 ${
        stage.status === 'idle' ? 'opacity-60 bg-muted/30 border-border' :
        stage.status === 'active' ? 'opacity-100 bg-muted/60 border-border' :
        stage.status === 'done' ? 'opacity-50 bg-emerald-500/5 border-emerald-500/10' :
        'opacity-100 bg-destructive/5 border-destructive/20'
      }`}
    >
      {/* Icon or status indicator */}
      <div className="relative flex">
        {stage.status === 'done' ? (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.3, ease: [0.34, 1.56, 0.64, 1] }}
          >
            <IconCheck size={16} className="text-emerald-500" />
          </motion.div>
        ) : stage.status === 'error' ? (
          <motion.div
            animate={{ rotate: [0, -2, 2, -2, 0] }}
            transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 2 }}
          >
            <IconAlertCircle size={16} className="text-destructive" />
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: stage.status === 'idle' ? 0.6 : 1 }}
            animate={stage.status === 'active' ? { opacity: [0.6, 1] } : {}}
            transition={{ duration: 1, repeat: Infinity }}
          >
            <span className="text-base">{stage.icon || '○'}</span>
          </motion.div>
        )}
      </div>

      {/* Text content */}
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-medium transition-colors duration-200 ${
          stage.status === 'idle' ? 'text-muted-foreground' :
          stage.status === 'active' ? 'text-foreground' :
          stage.status === 'done' ? 'text-emerald-500' :
          'text-destructive'
        }`}>
          {stage.label}
        </div>
        {stage.sublabel && (
          <div className="text-xs text-muted-foreground uppercase tracking-wide mt-0.5">
            {stage.sublabel}
          </div>
        )}
      </div>

      {/* Active pulsing glow */}
      {stage.status === 'active' && (
        <motion.div
          initial={{ opacity: 0.3 }}
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_var(--primary)]"
        />
      )}
    </motion.div>
  )
}

/** Main pipeline component */
export function ThoughtPipeline({
  stages,
  visible,
  phase = 'plan',
}: ThoughtPipelineProps) {
  const isSkeleton = phase === 'skeleton'
  const isDone = phase === 'done'

  return (
    <AnimatePresence mode="wait">
      {visible && (
        <motion.div
          key={isSkeleton ? 'skeleton' : 'pipeline'}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: isDone ? 0.5 : 1, y: 0 }}
          exit={{ opacity: 0, y: -4, transition: { duration: 0.2 } }}
          transition={{ duration: 0.25 }}
        >
          <Card className="p-4 gap-3">
            <CardContent className="p-0">
              {isSkeleton ? (
                <ThinkingIndicator />
              ) : (
                <div className="flex flex-col gap-2">
                  {stages.map((stage, i) => (
                    <PipelineStage key={stage.id} stage={stage} index={i} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
