'use client'

import React, { useState, useEffect, useCallback } from 'react'
import type {
  MemoryPalaceEntry,
  MemoryCategory,
  MemorySearchResult,
  MemoryPalaceStats,
} from '@/lib/memory-palace/types'
import { MemoryCard } from './memory-card'
import { MemoryStatsBar } from './memory-stats-bar'
import { DecisionLogViewer } from './decision-log-viewer'
import { S, C } from '@/lib/styles/design-tokens'

// ─── Types ───────────────────────────────────────────────────────────────────

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
}

const CATEGORY_COLORS: Record<MemoryCategory, string> = {
  conversation: '#3B82F6',
  decision: '#8B5CF6',
  pattern: '#14B8A6',
  fact: '#22C55E',
  relationship: '#EC4899',
  pricing: '#F59E0B',
  convention: '#F1F5F9',
}

// ─── Component ───────────────────────────────────────────────────────────────

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
      const params = new URLSearchParams()
      if (activeCategory) params.set('category', activeCategory)

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
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
      height: '100%',
      overflow: 'hidden',
    }}>
      {/* Stats Bar */}
      {stats && <MemoryStatsBar stats={stats} />}

      {/* Search + Controls */}
      <div style={{
        display: 'flex',
        gap: '12px',
        alignItems: 'center',
        padding: '0 4px',
      }}>
        {/* Search Input */}
        <div style={{
          flex: 1,
          position: 'relative',
        }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search memories... (e.g., 'pricing WordPress builds')"
            style={{
              width: '100%',
              padding: '12px 16px',
              background: 'var(--bg-input, rgba(13, 17, 23, 0.6))',
              border: `1px solid ${C.borderHover}`,
              borderRadius: '8px',
              color: C.textPrimary,
              fontSize: '14px',
              outline: 'none',
            }}
          />
        </div>

        {/* View Mode Toggle */}
        <div style={{
          display: 'flex',
          gap: '2px',
          background: 'var(--bg-card, rgba(15, 20, 30, 0.35))',
          borderRadius: '8px',
          padding: '4px',
        }}>
          {(['feed', 'decisions'] as ViewMode[]).map(mode => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: 'none',
                background: viewMode === mode
                  ? C.bgHoverStrong
                  : 'transparent',
                color: viewMode === mode
                  ? '#E2E8F0'
                  : C.textPlaceholder,
                fontSize: '14px',
                fontWeight: viewMode === mode ? 500 : 400,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                textTransform: 'capitalize',
              }}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* Category Filters */}
      <div style={{
        display: 'flex',
        gap: '8px',
        padding: '0 4px',
        overflowX: 'auto',
      }}>
        <button
          onClick={() => { setActiveCategory(null); setViewMode('feed') }}
          style={{
            padding: '4px 12px',
            borderRadius: '12px',
            border: 'none',
            background: activeCategory === null ? 'var(--hover-bg-strong)' : 'var(--hover-bg)',
            color: activeCategory === null ? '#E2E8F0' : C.textPlaceholder,
            fontSize: '14px',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          All
        </button>
        {(Object.keys(CATEGORY_LABELS) as MemoryCategory[]).map(cat => (
          <button
            key={cat}
            onClick={() => { setActiveCategory(cat); setViewMode('feed') }}
            style={{
              padding: '4px 12px',
              borderRadius: '12px',
              border: 'none',
              background: activeCategory === cat
                ? `${CATEGORY_COLORS[cat]}22`
                : 'var(--hover-bg)',
              color: activeCategory === cat
                ? CATEGORY_COLORS[cat]
                : C.textPlaceholder,
              fontSize: '14px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div style={{
          padding: '12px',
          background: C.statusErrorBg,
          borderRadius: '8px',
          color: '#EF4444',
          fontSize: '14px',
        }}>
          {error}
        </div>
      )}

      {/* Content */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '0 4px',
      }}>
        {loading && (
          <div style={{
            textAlign: 'center',
            padding: '40px',
            color: C.textDim,
          }}>
            Loading...
          </div>
        )}

        {!loading && viewMode === 'feed' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {memories.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '60px 20px',
                color: C.textMuted,
              }}>
                <div style={{ fontSize: '16px', marginBottom: '8px' }}>No memories yet</div>
                <div style={{ fontSize: '14px' }}>
                  BitBit will automatically remember important facts, decisions, and patterns as you interact.
                </div>
              </div>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{
              fontSize: '14px',
              color: C.textDim,
              padding: '4px 0',
            }}>
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
