'use client'

import React, { useState, useMemo } from 'react'
import { motion } from 'motion/react'
import { Search, FileText, Brain, Trash2, History, Download } from 'lucide-react'

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
      style={{
        position: 'absolute',
        bottom: '100%',
        left: 0,
        right: 0,
        marginBottom: 4,
        background: 'var(--bg-card, rgba(15, 20, 30, 0.95))',
        backdropFilter: 'blur(24px)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12,
        overflow: 'hidden',
        maxHeight: 300,
        zIndex: 60,
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      }}
    >
      {filtered.map((cmd, i) => {
        const Icon = cmd.icon
        return (
          <button
            key={cmd.id}
            onClick={() => onSelect(cmd)}
            onMouseEnter={() => setHoveredIdx(i)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              width: '100%',
              padding: '10px 14px',
              background: i === hoveredIdx ? 'rgba(255,255,255,0.04)' : 'transparent',
              border: 'none',
              borderBottom: i < filtered.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none',
              color: 'var(--text-primary, #F1F5F9)',
              cursor: 'pointer',
              textAlign: 'left',
              fontSize: 13,
              transition: 'background 100ms',
            }}
          >
            <Icon size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 500 }}>/{cmd.label}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted, rgba(255,255,255,0.4))', marginTop: 1 }}>{cmd.description}</div>
            </div>
          </button>
        )
      })}
    </motion.div>
  )
}

/** Default chat commands */
export const DEFAULT_CHAT_COMMANDS: ChatCommand[] = [
  { id: 'new', label: 'new', description: 'Start a new conversation', icon: FileText },
  { id: 'clear', label: 'clear', description: 'Clear current conversation', icon: Trash2 },
  { id: 'search', label: 'search', description: 'Search conversation history', icon: Search },
  { id: 'memory', label: 'memory', description: 'Search your memory', icon: Brain },
  { id: 'history', label: 'history', description: 'Open conversation drawer', icon: History },
  { id: 'export', label: 'export', description: 'Export this conversation', icon: Download },
]
