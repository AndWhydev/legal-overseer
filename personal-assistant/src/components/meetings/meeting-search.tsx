'use client'

import React, { useState, useCallback } from 'react'
import { IconSearch } from '@tabler/icons-react'
import type { TranscriptSearchResult } from '@/lib/meetings/types'

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
        ? <mark key={i} className="rounded bg-primary/20 px-1 text-foreground">{part}</mark>
        : part
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Search input */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <IconSearch
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch() }}
            placeholder="Search across all meeting transcripts..."
            className="w-full rounded-xl border border-border bg-background py-3 pl-9 pr-4 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring"
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={!query.trim() || searching}
          className="rounded-xl bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Search
        </button>
      </div>

      {/* Results */}
      {searching && (
        <div className="p-5 text-center text-sm text-muted-foreground">
          Searching transcripts...
        </div>
      )}

      {!searching && searched && results.length === 0 && (
        <div className="p-5 text-center text-sm text-muted-foreground">
          No results found for &ldquo;{query}&rdquo;
        </div>
      )}

      {!searching && results.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="border-b border-border px-4 py-3 text-sm text-muted-foreground">
            {results.length} result{results.length !== 1 ? 's' : ''} across transcripts
          </div>
          {results.map((result, i) => (
            <div
              key={i}
              onClick={() => onSelectMeeting(result.meeting_id)}
              className={`cursor-pointer px-4 py-3 transition-colors hover:bg-secondary/50 ${
                i < results.length - 1 ? 'border-b border-border' : ''
              }`}
            >
              <div className="mb-1 flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">
                  {result.meeting_title}
                </span>
                <span className="font-mono text-sm text-muted-foreground">
                  {formatTime(result.start_time_ms)}
                </span>
                {result.speaker_label && (
                  <span className="text-sm text-muted-foreground">
                    &middot; {result.speaker_label}
                  </span>
                )}
              </div>
              <p className="text-sm leading-normal text-foreground">
                {highlightText(result.segment_text, query)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
