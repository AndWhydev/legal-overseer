'use client'

import { motion, AnimatePresence } from 'motion/react'
import { Check, AlertCircle } from 'lucide-react'
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
    <span style={{ display: 'inline-flex', gap: '2px' }}>
      <motion.span
        animate={{ opacity: [0.4, 1] }}
        transition={{ duration: 0.6, repeat: Infinity }}
        style={{ display: 'inline-block' }}
      >
        .
      </motion.span>
      <motion.span
        animate={{ opacity: [0.4, 1] }}
        transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }}
        style={{ display: 'inline-block' }}
      >
        .
      </motion.span>
      <motion.span
        animate={{ opacity: [0.4, 1] }}
        transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }}
        style={{ display: 'inline-block' }}
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
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        alignItems: 'center',
      }}
    >
      {/* Shimmer animation container */}
      <motion.div
        style={{
          position: 'relative',
          width: '32px',
          height: '32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Outer pulsing glow */}
        <motion.div
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 2, repeat: Infinity }}
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            background: `radial-gradient(circle, rgba(255, 255, 255, 0.1), transparent)`,
            boxShadow: '0 0 12px rgba(255, 255, 255, 0.15)',
          }}
        />

        {/* Inner shimmer particles */}
        {[0, 1, 2].map(i => (
          <motion.div
            key={i}
            animate={{
              rotate: 360,
              scale: [1, 0.6, 1],
            }}
            transition={{
              duration: 3 + i * 0.5,
              repeat: Infinity,
              delay: i * 0.3,
            }}
            style={{
              position: 'absolute',
              width: `${28 - i * 6}px`,
              height: `${28 - i * 6}px`,
              borderRadius: '50%',
              border: `1px solid rgba(255, 255, 255, ${0.2 - i * 0.05})`,
            }}
          />
        ))}

        {/* Center sparkle */}
        <motion.div
          animate={{ scale: [1, 1.2, 1], opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          style={{
            width: '4px',
            height: '4px',
            borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.8)',
          }}
        />
      </motion.div>

      {/* Thinking text with animated ellipsis */}
      <div style={{ fontSize: '14px', color: 'var(--text-secondary)', fontWeight: 500 }}>
        Thinking<ThinkingEllipsis />
      </div>
    </motion.div>
  )
}

/** Individual stage component with smooth animations */
function PipelineStage({
  stage,
  index,
}: {
  stage: ChatPipelineStage
  index: number
}) {
  const statusStyles = {
    idle: { opacity: 0.6, borderColor: 'rgba(255, 255, 255, 0.08)' },
    active: { opacity: 1, borderColor: 'rgba(255, 255, 255, 0.15)' },
    done: { opacity: 0.5, borderColor: 'rgba(255, 255, 255, 0.08)' },
    error: { opacity: 1, borderColor: 'rgba(239, 68, 68, 0.5)' },
  }

  const statusColor = {
    idle: 'var(--text-secondary)',
    active: 'var(--text-primary)',
    done: 'var(--bb-green)',
    error: 'var(--bb-red)',
  }

  const bgColor = {
    idle: 'rgba(255, 255, 255, 0.04)',
    active: 'rgba(255, 255, 255, 0.08)',
    done: 'rgba(34, 197, 94, 0.06)',
    error: 'rgba(239, 68, 68, 0.06)',
  }

  return (
    <motion.div
      key={stage.id}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.4,
        delay: index * 0.15,
        ease: [0.34, 1.56, 0.64, 1], // spring easing
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 12px',
        borderRadius: '8px',
        background: bgColor[stage.status],
        border: `1px solid ${statusStyles[stage.status].borderColor}`,
        transition: 'all 0.3s ease',
      }}
    >
      {/* Icon or status indicator */}
      <div style={{ position: 'relative', display: 'flex' }}>
        {stage.status === 'done' ? (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.3, ease: [0.34, 1.56, 0.64, 1] }}
          >
            <Check size={16} color="var(--bb-green)" />
          </motion.div>
        ) : stage.status === 'error' ? (
          <motion.div
            animate={{ rotate: [0, -2, 2, -2, 0] }}
            transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 2 }}
          >
            <AlertCircle size={16} color="var(--bb-red)" />
          </motion.div>
        ) : (
          <motion.div
            animate={stage.status === 'active' ? { opacity: [0.6, 1] } : undefined}
            transition={{ duration: 1, repeat: Infinity }}
            style={{ opacity: statusStyles[stage.status].opacity }}
          >
            <span style={{ fontSize: '16px' }}>{stage.icon || '○'}</span>
          </motion.div>
        )}
      </div>

      {/* Text content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: '14px',
            fontWeight: 500,
            color: statusColor[stage.status],
            transition: 'color 0.2s ease',
          }}
        >
          {stage.label}
        </div>
        {stage.sublabel && (
          <div
            style={{
              fontSize: '14px',
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginTop: '2px',
            }}
          >
            {stage.sublabel}
          </div>
        )}
      </div>

      {/* Active pulsing glow */}
      {stage.status === 'active' && (
        <motion.div
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 2, repeat: Infinity }}
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: 'var(--accent-primary)',
            boxShadow: '0 0 8px var(--accent-primary)',
          }}
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
          exit={{
            opacity: 0,
            y: -4,
            transition: { duration: 0.2 },
          }}
          transition={{ duration: 0.25 }}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            padding: '16px',
            borderRadius: '12px',
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            backdropFilter: 'blur(24px)',
          }}
        >
          {isSkeleton ? (
            <ThinkingIndicator />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {stages.map((stage, i) => (
                <PipelineStage key={stage.id} stage={stage} index={i} />
              ))}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
