'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { ChevronDown, Check, X, Activity } from 'lucide-react'

interface ToolCall {
  name: string
  input: unknown
  result?: unknown
  success?: boolean
  status: 'running' | 'done' | 'error'
}

const toolDisplayNames: Record<string, { label: string }> = {
  create_task: { label: 'Created task' },
  update_task: { label: 'Updated task' },
  search_tasks: { label: 'Searched tasks' },
  search_contacts: { label: 'Searched contacts' },
  get_contact: { label: 'Looked up contact' },
  log_activity: { label: 'Logged activity' },
  compose_creator_notification_mockup: { label: 'Composed notification' },
  search_memory: { label: 'Searched memory' },
  add_memory: { label: 'Saved to memory' },
}

/** Collapsed summary for multiple tool calls */
export function ToolCallSummary({ toolCalls }: { toolCalls: ToolCall[] }) {
  const [expanded, setExpanded] = useState(false)
  const failed = toolCalls.filter(tc => tc.status === 'error')

  if (toolCalls.length === 0) return null

  return (
    <div style={{ marginTop: 4 }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 0',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text-dim)',
          fontSize: 12,
          fontFamily: 'inherit',
          transition: 'color 0.15s ease',
        }}
        onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-dim)')}
      >
        <Activity size={12} />
        <span>
          {toolCalls.length} tool{toolCalls.length !== 1 ? 's' : ''} used
          {failed.length > 0 && <span style={{ color: 'var(--bb-red)' }}> · {failed.length} failed</span>}
        </span>
        <motion.div
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.15 }}
        >
          <ChevronDown size={12} />
        </motion.div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              padding: '4px 0 4px 18px',
            }}>
              {toolCalls.map((tc, i) => {
                const display = toolDisplayNames[tc.name]
                return (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 12,
                      color: 'var(--text-dim)',
                      lineHeight: 1.5,
                    }}
                  >
                    {tc.status === 'done' ? (
                      <Check size={11} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                    ) : tc.status === 'error' ? (
                      <X size={11} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                    ) : (
                      <span style={{ width: 11, height: 11, flexShrink: 0 }} />
                    )}
                    <span>{display?.label || tc.name}</span>
                  </div>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Legacy single card */
export function ToolCallCard({ toolCall }: { toolCall: ToolCall }) {
  const display = toolDisplayNames[toolCall.name]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-dim)' }}>
      {toolCall.status === 'done' && <Check size={11} color="var(--bb-green)" />}
      {toolCall.status === 'error' && <X size={11} color="var(--bb-red)" />}
      <span>{display?.label || toolCall.name}</span>
    </div>
  )
}
