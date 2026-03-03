'use client'

import { motion, AnimatePresence } from 'motion/react'
import type { StageId } from '@/lib/agent/engine'

export interface PipelineStage {
  id: StageId
  label: string
  status: 'idle' | 'active' | 'done'
  meta?: Record<string, unknown>
}

interface ThoughtPipelineProps {
  stages: PipelineStage[]
  visible: boolean
}

const STAGE_CONFIG: Record<StageId, { label: string; icon: string }> = {
  cost_check: { label: 'Budget', icon: '◈' },
  model_routing: { label: 'Routing', icon: '◇' },
  context_assembly: { label: 'Context', icon: '◆' },
  api_streaming: { label: 'Thinking', icon: '✦' },
  tool_execution: { label: 'Tools', icon: '⚡' },
}

const statusColors = {
  idle: { dot: 'var(--text-dim, #475569)', glow: 'transparent' },
  active: { dot: 'var(--bb-orange, #F97316)', glow: 'var(--bb-orange, #F97316)' },
  done: { dot: 'var(--bb-green, #22C55E)', glow: 'var(--bb-green, #22C55E)' },
}

function StageDot({ status }: { status: 'idle' | 'active' | 'done' }) {
  const colors = statusColors[status]
  return (
    <motion.span
      className="bb-thought__dot"
      style={{
        background: colors.dot,
        boxShadow: status !== 'idle' ? `0 0 8px ${colors.glow}, 0 0 16px color-mix(in srgb, ${colors.glow} 30%, transparent)` : 'none',
      }}
      animate={status === 'active' ? { opacity: [1, 0.5, 1] } : { opacity: 1 }}
      transition={status === 'active' ? { duration: 1.2, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
    />
  )
}

function Connector({ status }: { status: 'idle' | 'active' | 'done' }) {
  const color = status === 'done' ? 'var(--bb-green, #22C55E)'
    : status === 'active' ? 'var(--bb-orange, #F97316)'
    : 'var(--text-dim, #475569)'

  return (
    <span className="bb-thought__connector">
      <span
        className="bb-thought__connector-line"
        style={{
          background: `linear-gradient(90deg, ${color}, color-mix(in srgb, ${color} 40%, transparent))`,
        }}
      >
        {status === 'active' && (
          <span
            className="bb-thought__connector-flow"
            style={{ background: color }}
          />
        )}
      </span>
    </span>
  )
}

export function ThoughtPipeline({ stages, visible }: ThoughtPipelineProps) {
  // Only show stages that have been activated (not perpetually idle ones)
  const visibleStages = stages.filter(s => s.status !== 'idle' || stages.some(other => other.status !== 'idle'))

  return (
    <AnimatePresence>
      {visible && visibleStages.length > 0 && (
        <motion.div
          className="bb-thought"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4, transition: { duration: 0.2 } }}
          transition={{ duration: 0.3 }}
        >
          <div className="bb-thought__pipeline">
            {visibleStages.map((stage, i) => (
              <div key={stage.id} className="bb-thought__stage-group">
                <motion.div
                  className={`bb-thought__stage bb-thought__stage--${stage.status}`}
                  initial={stage.status === 'active' ? { scale: 0.95, opacity: 0 } : false}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.2 }}
                >
                  <StageDot status={stage.status} />
                  <span className="bb-thought__label">
                    {STAGE_CONFIG[stage.id]?.label ?? stage.label}
                  </span>
                  {stage.status === 'done' && stage.meta && (
                    <span className="bb-thought__meta">
                      {formatMeta(stage.id, stage.meta)}
                    </span>
                  )}
                </motion.div>
                {i < visibleStages.length - 1 && (
                  <Connector status={stage.status === 'done' ? 'done' : 'idle'} />
                )}
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function formatMeta(stageId: StageId, meta: Record<string, unknown>): string {
  switch (stageId) {
    case 'model_routing':
      return meta.tier ? String(meta.tier) : ''
    case 'context_assembly':
      return meta.promptLength ? `${Math.round(Number(meta.promptLength) / 100) / 10}k` : ''
    case 'api_streaming':
      if (meta.tokens && typeof meta.tokens === 'object') {
        const t = meta.tokens as { input_tokens?: number; output_tokens?: number }
        if (t.output_tokens) return `${t.output_tokens} tok`
      }
      return ''
    case 'tool_execution':
      return meta.toolName ? String(meta.toolName).replace(/_/g, ' ') : ''
    default:
      return ''
  }
}
