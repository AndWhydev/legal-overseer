'use client'

import React, { useState, useCallback } from 'react'
import type { TranscriptSearchResult } from '@/lib/meetings/types'
import { S, C } from '@/lib/styles/design-tokens'

interface MeetingSearchProps {
  onSelectMeeting: (meetingId: string) => void
}

export function MeetingSearch({ onSelectMeeting }: MeetingSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<TranscriptSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return

    setSearching(true)
    setSearched(true)
    try {
      const res = await fetch(`/api/meetings/search?q=${encodeURIComponent(query.trim())}&limit=20`)
      if (res.ok) {
        const data = await res.json()
        setResults(data.results || [])
      }
    } catch {
      // silent
    } finally {
      setSearching(false)
    }
  }, [query])

  const formatTime = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${String(seconds).padStart(2, '0')}`
  }

  // Highlight matching text
  const highlightText = (text: string, searchQuery: string): React.ReactNode => {
    if (!searchQuery.trim()) return text
    const words = searchQuery.trim().split(/\s+/)
    const regex = new RegExp(`(${words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
    const parts = text.split(regex)
    return parts.map((part, i) =>
      regex.test(part)
        ? <mark key={i} style={{ background: C.bgHoverStrong, color: 'var(--text-primary, #E2E8F0)', borderRadius: 8, padding: '0 4px' }}>{part}</mark>
        : part
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Search input */}
      <div className="flex gap-2">
        <div style={{ flex: 1, position: 'relative' }}>
          <svg
            width="16"
            height="16"
            fill="none"
            viewBox="0 0 24 24"
            stroke="var(--text-dim, #475569)"
            strokeWidth={2}
            style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch() }}
            placeholder="Search across all meeting transcripts..."
            style={{
              width: '100%',
              padding: '12px 16px 12px 36px',
              borderRadius: 12,
              background: 'var(--bg-input, rgba(13, 17, 23, 0.6))',
              border: '1px solid var(--glass-border, rgba(255, 255, 255, 0.03))',
              color: 'var(--text-primary, #F1F5F9)',
              fontSize: 14,
              outline: 'none',
              transition: 'border-color 200ms',
            }}
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={!query.trim() || searching}
          style={{
            padding: '12px 20px',
            borderRadius: 12,
            background: query.trim() ? '#F1F5F9' : C.bgHoverStrong,
            border: 'none',
            color: query.trim() ? '#0a0f1a' : 'rgba(0, 0, 0, 0.5)',
            fontSize: 14,
            fontWeight: 500,
            cursor: query.trim() ? 'pointer' : 'not-allowed',
            transition: 'all 200ms',
          }}
        >
          Search
        </button>
      </div>

      {/* Results */}
      {searching && (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-dim, #475569)', fontSize: 14 }}>
          Searching transcripts...
        </div>
      )}

      {!searching && searched && results.length === 0 && (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-dim, #475569)', fontSize: 14 }}>
          No results found for &ldquo;{query}&rdquo;
        </div>
      )}

      {!searching && results.length > 0 && (
        <div style={{
          borderRadius: 16,
          background: 'var(--bg-card-solid, rgba(15, 20, 30, 0.6))',
          backdropFilter: 'var(--glass-blur, blur(20px) saturate(1.2))',
          WebkitBackdropFilter: 'var(--glass-blur, blur(20px) saturate(1.2))',
          border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.03))',
          boxShadow: 'var(--card-shadow, 0 2px 8px rgba(0,0,0,0.3)), var(--card-inset, inset 0 1px 0 rgba(255,255,255,0.06))',
          overflow: 'hidden',
        }}>
          <div style={{
            padding: '12px 16px',
            borderBottom: `1px solid ${C.borderSubtle}`,
            fontSize: 14,
            color: 'var(--text-dim, #475569)',
          }}>
            {results.length} result{results.length !== 1 ? 's' : ''} across transcripts
          </div>
          {results.map((result, i) => (
            <div
              key={i}
              onClick={() => onSelectMeeting(result.meeting_id)}
              style={{
                padding: '12px 16px',
                borderBottom: i < results.length - 1 ? `1px solid ${C.borderSubtle}` : 'none',
                cursor: 'pointer',
                transition: 'background 200ms',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover-bg)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              <div className="flex items-center gap-2 mb-1">
                <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary, #E2E8F0)' }}>
                  {result.meeting_title}
                </span>
                <span style={{ fontSize: 14, color: 'var(--text-dim, #475569)', fontFamily: 'var(--font-mono, monospace)' }}>
                  {formatTime(result.start_time_ms)}
                </span>
                {result.speaker_label && (
                  <span style={{ fontSize: 14, color: 'var(--text-dim, #475569)' }}>
                    &middot; {result.speaker_label}
                  </span>
                )}
              </div>
              <p style={{
                fontSize: 14,
                color: 'var(--text-primary, #F1F5F9)',
                margin: 0,
                lineHeight: 1.5,
              }}>
                {highlightText(result.segment_text, query)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
