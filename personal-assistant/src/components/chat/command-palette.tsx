'use client'

import React, { useState, useMemo } from 'react'
import { motion } from 'motion/react'
import { cn } from '@/lib/utils'
import {
  IconSearch,
  IconFileText,
  IconBrain,
  IconTrash,
  IconHistory,
  IconDownload,
} from '@tabler/icons-react'

export interface ChatCommand {
  id: string
  label: string
  description: string
  icon: React.ElementType
}

interface CommandPaletteProps {
  query: string
  commands: ChatCommand[]
  onSelect: (command: ChatCommand) => void
}

export function CommandPalette({ query, commands, onSelect }: CommandPaletteProps) {
  const [hoveredIdx, setHoveredIdx] = useState(0)

  const filtered = useMemo(() => {
    if (!query) return commands
    const q = query.toLowerCase()
    return commands.filter(c =>
      c.label.toLowerCase().includes(q) || c.description.toLowerCase().includes(q)
    )
  }, [query, commands])

  if (filtered.length === 0) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.15 }}
      className="absolute bottom-full left-0 right-0 z-[60] mb-1 max-h-[300px] overflow-hidden rounded-xl border border-border bg-popover shadow-xl"
    >
      {filtered.map((cmd, i) => {
        const Icon = cmd.icon
        return (
          <button
            key={cmd.id}
            onClick={() => onSelect(cmd)}
            onMouseEnter={() => setHoveredIdx(i)}
            className={cn(
              'flex w-full items-center gap-2.5 border-b border-border px-3.5 py-2.5 text-left text-sm transition-colors last:border-b-0',
              i === hoveredIdx ? 'bg-muted' : 'bg-transparent'
            )}
          >
            <Icon className="size-4 shrink-0 text-muted-foreground" />
            <div>
              <div className="font-medium text-foreground">/{cmd.label}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{cmd.description}</div>
            </div>
          </button>
        )
      })}
    </motion.div>
  )
}

/** Default chat commands */
export const DEFAULT_CHAT_COMMANDS: ChatCommand[] = [
  { id: 'new', label: 'new', description: 'Start a new conversation', icon: IconFileText },
  { id: 'clear', label: 'clear', description: 'Clear current conversation', icon: IconTrash },
  { id: 'search', label: 'search', description: 'Search conversation history', icon: IconSearch },
  { id: 'memory', label: 'memory', description: 'Search your memory', icon: IconBrain },
  { id: 'history', label: 'history', description: 'Open conversation drawer', icon: IconHistory },
  { id: 'export', label: 'export', description: 'Export this conversation', icon: IconDownload },
]
