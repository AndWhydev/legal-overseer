'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { ChevronDown, ChevronRight, Check, X, Wrench, Activity, Loader2 } from 'lucide-react'

interface ToolCall {
  name: string
  input: unknown
  result?: unknown
  success?: boolean
  status: 'running' | 'done' | 'error'
}

const toolDisplayNames: Record<string, { label: string; icon: string }> = {
  create_task: { label: 'Created task', icon: '✅' },
  update_task: { label: 'Updated task', icon: '📝' },
  search_tasks: { label: 'Searched tasks', icon: '🔍' },
  search_contacts: { label: 'Searched contacts', icon: '👤' },
  get_contact: { label: 'Looked up contact', icon: '👤' },
  log_activity: { label: 'Logged activity', icon: '📋' },
  compose_creator_notification_mockup: { label: 'Composed notification', icon: '✉️' },
  search_memory: { label: 'Searched memory', icon: '🧠' },
  add_memory: { label: 'Saved to memory', icon: '💾' },
}

function summarizeResult(name: string, result: unknown): string {
  if (!result || typeof result !== 'object') return 'Done'
  const r = result as Record<string, unknown>
  switch (name) {
    case 'search_memory': return `Found ${(r.results as unknown[])?.length || 0} memories`
    case 'add_memory': return 'Memory saved'
    case 'create_task': return `Task "${r.title || 'untitled'}" created`
    case 'update_task': return 'Task updated'
    case 'search_tasks': return `Found ${(r.tasks as unknown[])?.length || 0} tasks`
    case 'search_contacts': return `Found ${(r.contacts as unknown[])?.length || 0} contacts`
    case 'get_contact': return r.name ? `${r.name}` : 'Contact found'
    case 'log_activity': return 'Activity logged'
    default: return r.success === false ? 'Error' : 'Completed'
  }
}

/** Individual tool call card with premium glassmorphic design */
function ToolCallCardItem({ toolCall, index }: { toolCall: ToolCall; index: number }) {
  const [expanded, setExpanded] = useState(false)
  const display = toolDisplayNames[toolCall.name]

  const statusConfig = {
    running: {
      bg: 'rgba(255, 255, 255, 0.04)',
      border: 'rgba(255, 255, 255, 0.08)',
      textColor: 'var(--text-primary)',
    },
    done: {
      bg: 'rgba(34, 197, 94, 0.04)',
      border: 'rgba(34, 197, 94, 0.15)',
      textColor: 'var(--text-primary)',
    },
    error: {
      bg: 'rgba(239, 68, 68, 0.04)',
      border: 'rgba(239, 68, 68, 0.15)',
      textColor: 'var(--bb-red)',
    },
  }

  const config = statusConfig[toolCall.status]

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.4,
        delay: index * 0.15,
        ease: [0.34, 1.56, 0.64, 1],
      }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        borderRadius: '8px',
        background: config.bg,
        border: `1px solid ${config.border}`,
        backdropFilter: 'blur(24px)',
        overflow: 'hidden',
      }}
    >
      {/* Card header */}
      <motion.button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '10px 12px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: config.textColor,
          fontSize: '13px',
          fontWeight: 500,
          transition: 'background-color 0.2s ease',
        }}
        whileHover={{
          backgroundColor:
            toolCall.status === 'running'
              ? 'rgba(255, 255, 255, 0.06)'
              : toolCall.status === 'done'
                ? 'rgba(34, 197, 94, 0.08)'
                : 'rgba(239, 68, 68, 0.08)',
        }}
      >
        {/* Tool icon */}
        <span style={{ fontSize: '14px' }}>{(display?.icon as string | undefined) || '🔧'}</span>

        {/* Tool label and status */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {(display?.label as string | undefined) || toolCall.name}
          </span>

          {/* Status indicator */}
          {toolCall.status === 'running' ? (
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity }}>
              <Loader2 size={12} />
            </motion.div>
          ) : toolCall.status === 'done' ? (
            <Check size={12} style={{ color: 'var(--bb-green)' }} />
          ) : toolCall.status === 'error' ? (
            <X size={12} style={{ color: 'var(--bb-red)' }} />
          ) : null}
        </div>

        {/* Expand button (only if result exists) */}
        {toolCall.result ? (
          <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </motion.div>
        ) : null}

        {/* Active pulse indicator */}
        {toolCall.status === 'running' ? (
          <motion.div
            animate={{ opacity: [0.4, 0.8, 0.4] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            style={{
              width: '4px',
              height: '4px',
              borderRadius: '50%',
              background: 'var(--accent-primary)',
              boxShadow: '0 0 6px var(--accent-primary)',
            }}
          />
        ) : null}
      </motion.button>

      {/* Expandable result content */}
      <AnimatePresence>
        {expanded && toolCall.result ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '8px 12px 10px 12px',
                borderTop: '1px solid ' + config.border,
                fontSize: '12px',
                color: 'var(--text-secondary)',
                lineHeight: '1.4',
                wordBreak: 'break-word',
              }}
            >
              <pre
                style={{
                  margin: 0,
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  whiteSpace: 'pre-wrap',
                  overflow: 'hidden',
                }}
              >
                {typeof toolCall.result === 'string'
                  ? (toolCall.result as string)
                  : JSON.stringify(toolCall.result as Record<string, unknown>, null, 2)}
              </pre>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  )
}

/** Collapsed summary for multiple tool calls */
export function ToolCallSummary({ toolCalls }: { toolCalls: ToolCall[] }) {
  const [expanded, setExpanded] = useState(false)
  const completed = toolCalls.filter(tc => tc.status === 'done')
  const failed = toolCalls.filter(tc => tc.status === 'error')

  if (toolCalls.length === 0) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        marginTop: '8px',
      }}
    >
      {/* Summary header */}
      <motion.button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 12px',
          borderRadius: '8px',
          background: 'rgba(255, 255, 255, 0.04)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          backdropFilter: 'blur(24px)',
          cursor: 'pointer',
          color: 'var(--text-secondary)',
          fontSize: '12px',
          fontWeight: 500,
          transition: 'all 0.2s ease',
        }}
        whileHover={{
          backgroundColor: 'rgba(255, 255, 255, 0.06)',
        }}
      >
        <Activity size={12} />
        <span>
          Used {toolCalls.length} tool{toolCalls.length !== 1 ? 's' : ''}
          {failed.length > 0 && ` · ${failed.length} failed`}
        </span>
        <motion.div
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          style={{ marginLeft: 'auto' }}
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </motion.div>
      </motion.button>

      {/* Expandable list */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              overflow: 'hidden',
            }}
          >
            {toolCalls.map((tc, i) => (
              <ToolCallCardItem key={i} toolCall={tc} index={i} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

/** Legacy single card — kept for edge cases */
export function ToolCallCard({ toolCall }: { toolCall: ToolCall }) {
  const display = toolDisplayNames[toolCall.name]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
      <span>{display?.icon || '🔧'}</span>
      <span>{display?.label || toolCall.name}</span>
      {toolCall.status === 'done' && <Check size={11} color="var(--bb-green)" />}
      {toolCall.status === 'error' && <X size={11} color="var(--bb-red)" />}
    </div>
  )
}
