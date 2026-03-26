'use client'

import React, { useState, useMemo } from 'react'
import { Search, X } from 'lucide-react'

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
}

export function ConversationSearch({ threads, onSelectThread, onClose }: ConversationSearchProps) {
  const [query, setQuery] = useState('')

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
    <div style={{ padding: '4px 12px 0' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 10px',
          borderRadius: 8,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid var(--glass-border, rgba(255,255,255,0.03))',
        }}
      >
        <Search size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <input
          type="text"
          className="bb-naked-input"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search conversations..."
          autoFocus
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text-primary, #F1F5F9)',
            fontSize: 13,
          }}
        />
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: 2,
          }}
        >
          <X size={12} />
        </button>
      </div>
      {filtered.length > 0 && (
        <div style={{ marginTop: 8, maxHeight: 300, overflow: 'auto' }}>
          {filtered.map(t => (
            <button
              key={t.id}
              onClick={() => onSelectThread(t.id)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '8px 10px',
                borderRadius: 6,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: 'var(--text-secondary, #94A3B8)',
                fontSize: 12,
                marginBottom: 2,
                transition: 'background 100ms',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent'
              }}
            >
              <div style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, marginBottom: 2 }}>
                {t.title || 'Untitled'}
              </div>
              {t.preview && (
                <div style={{ color: 'var(--text-muted)', fontSize: 11, lineHeight: 1.4 }}>
                  {t.preview.length > 80 ? t.preview.slice(0, 77) + '...' : t.preview}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
      {showNoResults && (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
          No results
        </div>
      )}
    </div>
  )
}
