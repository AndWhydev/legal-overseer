'use client'

import React, { useState, useMemo } from 'react'
import { IconSearch, IconX } from '@tabler/icons-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface Thread {
  id: string
  title: string | null
  lastActivity: string
  messageCount: number
  preview: string | null
}

interface ConversationSearchProps {
  threads: Thread[]
  onSelectThread: (threadId: string) => void
  onClose: () => void
  onQueryChange?: (query: string) => void
}

export function ConversationSearch({ threads, onSelectThread, onClose, onQueryChange }: ConversationSearchProps) {
  const [query, setQuery] = useState('')

  const updateQuery = (q: string) => {
    setQuery(q)
    onQueryChange?.(q)
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return []
    return threads.filter(t => {
      const title = (t.title || '').toLowerCase()
      const preview = (t.preview || '').toLowerCase()
      return title.includes(q) || preview.includes(q)
    })
  }, [query, threads])

  const showNoResults = query.trim().length >= 2 && filtered.length === 0

  return (
    <div className="px-3 pt-1">
      <div className="flex items-center gap-2 rounded-lg bg-muted/50 border border-border px-2.5 py-1.5">
        <IconSearch size={14} className="text-muted-foreground shrink-0" />
        <Input
          type="text"
          value={query}
          onChange={e => updateQuery(e.target.value)}
          placeholder="Search conversations..."
          autoFocus
          className="h-auto border-0 bg-transparent p-0 text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 shrink-0"
          onClick={onClose}
        >
          <IconX size={12} />
        </Button>
      </div>
      {filtered.length > 0 && (
        <div className="mt-2 max-h-[300px] overflow-auto">
          {filtered.map(t => (
            <button
              key={t.id}
              onClick={() => onSelectThread(t.id)}
              className="block w-full text-left px-2.5 py-2 rounded-md hover:bg-muted/50 transition-colors mb-0.5"
            >
              <div className="text-sm font-semibold text-foreground mb-0.5">
                {t.title || 'Untitled'}
              </div>
              {t.preview && (
                <div className="text-[11px] text-muted-foreground leading-snug">
                  {t.preview.length > 80 ? t.preview.slice(0, 77) + '...' : t.preview}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
      {showNoResults && (
        <div className="mt-2 text-xs text-muted-foreground">
          No results
        </div>
      )}
    </div>
  )
}
