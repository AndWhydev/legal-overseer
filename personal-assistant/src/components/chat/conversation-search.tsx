'use client'

import React, { useState, useCallback, useRef } from 'react'
import { Search, X } from 'lucide-react'

interface SearchResult {
  id: string
  content: string
  role: string
  thread_id: string
  created_at: string
}

interface ConversationSearchProps {
  onSelectThread: (threadId: string) => void
  onClose: () => void
}

export function ConversationSearch({ onSelectThread, onClose }: ConversationSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const handleSearch = useCallback((q: string) => {
    setQuery(q)
    clearTimeout(debounceRef.current)
    if (q.length < 2) {
      setResults([])
      return
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/agent/chat/history?search=${encodeURIComponent(q)}`)
        if (res.ok) {
          const data = await res.json()
          setResults(data.results || [])
        }
      } catch {
        // silent
      } finally {
        setLoading(false)
      }
    }, 300)
  }, [])

  return (
    <div style={{ padding: '12px', paddingBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: '4px' }}>
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
          onChange={e => handleSearch(e.target.value)}
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
      {results.length > 0 && (
        <div style={{ marginTop: 8, maxHeight: 240, overflow: 'auto' }}>
          {results.map(r => (
            <button
              key={r.id}
              onClick={() => onSelectThread(r.thread_id)}
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
              <span
                style={{
                  color: 'var(--text-muted)',
                  fontSize: 11,
                  textTransform: 'capitalize',
                }}
              >
                {r.role}
              </span>
              {' · '}
              {r.content.length > 80 ? r.content.slice(0, 77) + '...' : r.content}
            </button>
          ))}
        </div>
      )}
      {loading && (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
          Searching...
        </div>
      )}
      {!loading && query.length >= 2 && results.length === 0 && (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
          No results
        </div>
      )}
    </div>
  )
}
