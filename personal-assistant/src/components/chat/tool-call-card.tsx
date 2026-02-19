'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Loader2, Check, X, Wrench } from 'lucide-react'
import { cn } from '@/lib/utils'

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
        return <Loader2 className="size-3.5 animate-spin text-primary" />
      case 'done':
        return <Check className="size-3.5 text-green-400" />
      case 'error':
        return <X className="size-3.5 text-destructive" />
    }
  }

  return (
    <div className="ml-10 my-0.5">
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          'flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors',
          'border-border/50 bg-muted/30 hover:bg-muted/50'
        )}
      >
        {expanded ? (
          <ChevronDown className="size-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3 text-muted-foreground" />
        )}
        <Wrench className="size-3 text-muted-foreground" />
        <span className="font-medium text-foreground/80">
          {toolDisplayNames[toolCall.name] || toolCall.name}
        </span>
        <span className="ml-auto">
          <StatusIcon />
        </span>
      </button>

      {expanded && (
        <div className="mt-1 rounded-lg border border-border/30 bg-muted/20 p-3 text-xs">
          <div>
            <span className="font-medium text-muted-foreground">Input:</span>
            <pre className="mt-1 overflow-x-auto rounded bg-background/50 p-2 font-mono text-[11px] text-foreground/70">
              {JSON.stringify(toolCall.input, null, 2)}
            </pre>
          </div>
          {toolCall.result !== undefined && (
            <div className="mt-2">
              <span className="font-medium text-muted-foreground">Result:</span>
              <pre className="mt-1 overflow-x-auto rounded bg-background/50 p-2 font-mono text-[11px] text-foreground/70">
                {JSON.stringify(toolCall.result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
