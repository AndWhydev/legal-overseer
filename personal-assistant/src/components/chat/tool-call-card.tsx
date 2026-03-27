'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { IconChevronDown, IconCheck, IconX, IconActivity } from '@tabler/icons-react'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

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
    <Collapsible open={expanded} onOpenChange={setExpanded} className="mt-1">
      <CollapsibleTrigger asChild>
        <button className="inline-flex items-center gap-2 py-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <IconActivity size={12} />
          <span>
            {toolCalls.length} tool{toolCalls.length !== 1 ? 's' : ''} used
            {failed.length > 0 && <span className="text-destructive"> · {failed.length} failed</span>}
          </span>
          <motion.div
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.15 }}
          >
            <IconChevronDown size={12} />
          </motion.div>
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="flex flex-col gap-0.5 pl-4.5 py-1">
          {toolCalls.map((tc, i) => {
            const display = toolDisplayNames[tc.name]
            return (
              <div
                key={i}
                className="flex items-center gap-2 text-sm text-muted-foreground leading-relaxed"
              >
                {tc.status === 'done' ? (
                  <IconCheck size={11} className="text-muted-foreground shrink-0" />
                ) : tc.status === 'error' ? (
                  <IconX size={11} className="text-muted-foreground shrink-0" />
                ) : (
                  <span className="w-[11px] h-[11px] shrink-0" />
                )}
                <span>{display?.label || tc.name}</span>
              </div>
            )
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

/** Legacy single card */
export function ToolCallCard({ toolCall }: { toolCall: ToolCall }) {
  const display = toolDisplayNames[toolCall.name]
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      {toolCall.status === 'done' && <IconCheck size={11} className="text-emerald-500" />}
      {toolCall.status === 'error' && <IconX size={11} className="text-destructive" />}
      <span>{display?.label || toolCall.name}</span>
    </div>
  )
}
