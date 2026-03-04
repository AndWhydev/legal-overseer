'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Check, X, Wrench, Activity } from 'lucide-react'

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

/** Collapsed summary for multiple tool calls */
export function ToolCallSummary({ toolCalls }: { toolCalls: ToolCall[] }) {
  const [expanded, setExpanded] = useState(false)
  const completed = toolCalls.filter(tc => tc.status === 'done')
  const failed = toolCalls.filter(tc => tc.status === 'error')

  if (toolCalls.length === 0) return null

  return (
    <div className="bb-chat__tc-summary">
      <button
        onClick={() => setExpanded(!expanded)}
        className="bb-chat__tc-summary-header"
      >
        <Activity size={12} />
        <span>
          Used {toolCalls.length} tool{toolCalls.length !== 1 ? 's' : ''}
          {failed.length > 0 && ` · ${failed.length} failed`}
        </span>
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>

      {expanded && (
        <div className="bb-chat__tc-summary-list">
          {toolCalls.map((tc, i) => {
            const display = toolDisplayNames[tc.name]
            return (
              <div key={i} className="bb-chat__tc-summary-item">
                <span className="bb-chat__tc-summary-icon">{display?.icon || '🔧'}</span>
                <span className="bb-chat__tc-summary-label">{display?.label || tc.name}</span>
                <span className="bb-chat__tc-summary-result">
                  {tc.status === 'done' && <Check size={11} className="bb-chat__tc-icon--done" />}
                  {tc.status === 'error' && <X size={11} className="bb-chat__tc-icon--error" />}
                  <span>{tc.status !== 'running' ? summarizeResult(tc.name, tc.result) : 'Running...'}</span>
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Legacy single card — kept for edge cases but generally replaced by summary */
export function ToolCallCard({ toolCall }: { toolCall: ToolCall }) {
  const display = toolDisplayNames[toolCall.name]
  return (
    <div className="bb-chat__tc-inline">
      <span className="bb-chat__tc-summary-icon">{display?.icon || '🔧'}</span>
      <span className="bb-chat__tc-summary-label">{display?.label || toolCall.name}</span>
      {toolCall.status === 'done' && <Check size={11} className="bb-chat__tc-icon--done" />}
      {toolCall.status === 'error' && <X size={11} className="bb-chat__tc-icon--error" />}
    </div>
  )
}
