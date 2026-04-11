'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { IconAlertCircle, IconBrain } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { Empty, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty'
import type {
  MemoryPalaceEntry,
  MemoryCategory,
  MemorySearchResult,
  MemoryPalaceStats,
} from '@/lib/memory-palace/types'
import { MemoryCard } from './memory-card'
import { MemoryStatsBar } from './memory-stats-bar'
import { DecisionLogViewer } from './decision-log-viewer'

// --- Types ---

interface MemoryExplorerProps {
  orgId: string
}

type ViewMode = 'feed' | 'decisions' | 'search'

const CATEGORY_LABELS: Record<MemoryCategory, string> = {
  conversation: 'Conversation',
  decision: 'Decision',
  pattern: 'Pattern',
  fact: 'Fact',
  relationship: 'Relationship',
  pricing: 'Pricing',
  convention: 'Convention',
  fiduciary_constraint: "Fiduciary Constraint",
}

const CATEGORY_COLORS: Record<MemoryCategory, string> = {
  conversation: '#3B82F6',
  decision: '#8B5CF6',
  pattern: '#14B8A6',
  fact: '#22C55E',
  relationship: '#EC4899',
  pricing: '#F59E0B',
  convention: '#F1F5F9',
  fiduciary_constraint: "#DC2626",
}

// --- Component ---

export function MemoryExplorer({ orgId }: MemoryExplorerProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('feed')
  const [memories, setMemories] = useState<MemoryPalaceEntry[]>([])
  const [searchResults, setSearchResults] = useState<MemorySearchResult | null>(null)
  const [stats, setStats] = useState<MemoryPalaceStats | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<MemoryCategory | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load recent memories
  const loadMemories = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const url = `/api/memory-palace/search?q=*&limit=30${activeCategory ? `&category=${activeCategory}` : ''}`
      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed to load memories')
      const data = await res.json()
      setMemories(data.memories ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [activeCategory])

  // Load stats
  const loadStats = useCallback(async () => {
    try {
      const res = await fetch('/api/memory-palace/stats')
      if (res.ok) {
        const data = await res.json()
        setStats(data)
      }
    } catch {
      // stats are non-critical
    }
  }, [])

  // Search
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return
    setLoading(true)
    setViewMode('search')
    try {
      const params = new URLSearchParams({
        q: searchQuery,
        limit: '20',
      })
      if (activeCategory) params.set('category', activeCategory)

      const res = await fetch(`/api/memory-palace/search?${params}`)
      if (!res.ok) throw new Error('Search failed')
      const data = await res.json()
      setSearchResults(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setLoading(false)
    }
  }, [searchQuery, activeCategory])

  useEffect(() => {
    loadMemories()
    loadStats()
  }, [loadMemories, loadStats])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch()
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden">
      {/* Stats Bar */}
      {stats && <MemoryStatsBar stats={stats} />}

      {/* Search + Controls */}
      <div className="flex items-center gap-3 px-1">
        {/* Search Input */}
        <div className="flex-1">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search memories... (e.g., 'pricing WordPress builds')"
            className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring"
          />
        </div>

        {/* View Mode Toggle */}
        <div className="flex gap-0.5 rounded-lg bg-card p-1">
          {(['feed', 'decisions'] as ViewMode[]).map(mode => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`rounded-lg px-4 py-2 text-sm capitalize transition-colors ${
                viewMode === mode
                  ? 'bg-secondary font-medium text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* Category Filters */}
      <div className="flex gap-2 overflow-x-auto px-1">
        <button
          onClick={() => { setActiveCategory(null); setViewMode('feed') }}
          className={`whitespace-nowrap rounded-xl px-3 py-1 text-sm ${
            activeCategory === null
              ? 'bg-secondary font-medium text-foreground'
              : 'bg-secondary text-muted-foreground'
          }`}
        >
          All
        </button>
        {(Object.keys(CATEGORY_LABELS) as MemoryCategory[]).map(cat => (
          <button
            key={cat}
            onClick={() => { setActiveCategory(cat); setViewMode('feed') }}
            className="whitespace-nowrap rounded-xl px-3 py-1 text-sm"
            style={{
              background: activeCategory === cat ? `${CATEGORY_COLORS[cat]}22` : undefined,
              color: activeCategory === cat ? CATEGORY_COLORS[cat] : undefined,
            }}
          >
            {CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <Empty>
          <EmptyMedia variant="icon"><IconAlertCircle size={20} /></EmptyMedia>
          <EmptyTitle>Something went wrong</EmptyTitle>
          <EmptyDescription>{error}</EmptyDescription>
          <EmptyContent>
            <Button variant="outline" size="sm" onClick={() => { setError(null); loadMemories(); }}>Retry</Button>
          </EmptyContent>
        </Empty>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-1">
        {loading && (
          <div className="p-10 text-center text-muted-foreground">
            Loading...
          </div>
        )}

        {!loading && viewMode === 'feed' && (
          <div className="flex flex-col gap-2">
            {memories.length === 0 ? (
              <Empty className="py-16">
                <EmptyMedia variant="icon"><IconBrain size={20} /></EmptyMedia>
                <EmptyTitle>No memories yet</EmptyTitle>
                <EmptyDescription>BitBit will automatically remember important facts, decisions, and patterns as you interact.</EmptyDescription>
              </Empty>
            ) : (
              memories.map(memory => (
                <MemoryCard
                  key={memory.id}
                  memory={memory}
                  categoryColor={CATEGORY_COLORS[memory.category]}
                />
              ))
            )}
          </div>
        )}

        {!loading && viewMode === 'decisions' && (
          <DecisionLogViewer orgId={orgId} />
        )}

        {!loading && viewMode === 'search' && searchResults && (
          <div className="flex flex-col gap-2">
            <div className="py-1 text-sm text-muted-foreground">
              {searchResults.totalCount} result{searchResults.totalCount !== 1 ? 's' : ''} for &quot;{searchQuery}&quot;
            </div>
            {searchResults.memories.map(memory => (
              <MemoryCard
                key={memory.id}
                memory={memory}
                categoryColor={CATEGORY_COLORS[memory.category]}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
