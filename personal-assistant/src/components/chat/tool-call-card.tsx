'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Loader2, Check, X, Wrench } from 'lucide-react'

interface ToolCall {
  name: string
  input: unknown
  result?: unknown
  success?: boolean
  status: 'running' | 'done' | 'error'
}

const toolDisplayNames: Record<string, string> = {
  create_task: 'Create Task',
  update_task: 'Update Task',
  search_tasks: 'Search Tasks',
  search_contacts: 'Search Contacts',
  get_contact: 'Get Contact',
  log_activity: 'Log Activity',
  search_memory: 'Search Memory',
  add_memory: 'Add Memory',
}

export function ToolCallCard({ toolCall }: { toolCall: ToolCall }) {
  const [expanded, setExpanded] = useState(false)

  const StatusIcon = () => {
    switch (toolCall.status) {
      case 'running':
        return <Loader2 className="bb-chat__tc-icon bb-chat__tc-icon--spin" size={14} />
      case 'done':
        return <Check className="bb-chat__tc-icon bb-chat__tc-icon--done" size={14} />
      case 'error':
        return <X className="bb-chat__tc-icon bb-chat__tc-icon--error" size={14} />
    }
  }

  return (
    <div className="bb-chat__tc">
      <button
        onClick={() => setExpanded(!expanded)}
        className="bb-chat__tc-header"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Wrench size={12} />
        <span className="bb-chat__tc-name">
          {toolDisplayNames[toolCall.name] || toolCall.name}
        </span>
        <span className="bb-chat__tc-status">
          <StatusIcon />
        </span>
      </button>

      {expanded && (
        <div className="bb-chat__tc-body">
          <div>
            <span className="bb-chat__tc-label">Input:</span>
            <pre className="bb-chat__tc-pre">
              {JSON.stringify(toolCall.input, null, 2)}
            </pre>
          </div>
          {toolCall.result !== undefined && (
            <div>
              <span className="bb-chat__tc-label">Result:</span>
              <pre className="bb-chat__tc-pre">
                {JSON.stringify(toolCall.result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
