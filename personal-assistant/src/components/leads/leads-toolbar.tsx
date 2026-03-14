'use client'

import React, { useState } from 'react'
import { Search, LayoutGrid, List } from 'lucide-react'
import type { LeadFilter, LeadViewMode, PipelineAnalytics } from '@/lib/leads/types'
import { formatPipelineValue } from '@/lib/leads/utils'

interface LeadsToolbarProps {
  filters: LeadFilter
  onFiltersChange: (filters: LeadFilter) => void
  viewMode: LeadViewMode
  onViewModeChange: (mode: LeadViewMode) => void
  onDiscoverClick: () => void
  searchQuery: string
  onSearchChange: (query: string) => void
  analytics: PipelineAnalytics | null
  searchInputRef: React.RefObject<HTMLInputElement | null>
}

const selectStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  padding: '6px 10px',
  borderRadius: 8,
  border: '1px solid var(--glass-interactive-border)',
  background: 'var(--glass-pill-bg)',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  outline: 'none',
}

function getSpeedColor(minutes: number | null): string {
  if (minutes === null) return 'var(--text-dim)'
  if (minutes <= 5) return 'var(--bb-green)'
  if (minutes <= 30) return 'var(--bb-amber)'
  return 'var(--bb-red)'
}

export function LeadsToolbar({
  filters,
  onFiltersChange,
  viewMode,
  onViewModeChange,
  onDiscoverClick,
  searchQuery,
  onSearchChange,
  analytics,
  searchInputRef,
}: LeadsToolbarProps) {
  const [searchFocused, setSearchFocused] = useState(false)

  const speedMinutes = analytics?.avgSpeedToLeadMinutes ?? null
  const speedColor = getSpeedColor(speedMinutes)
  const speedLabel = speedMinutes !== null ? `⚡${speedMinutes}m` : '⚡—'

  const pipelineValue = analytics ? formatPipelineValue(analytics.totalValue) : '—'
  const conversionRate = analytics ? `${analytics.conversionRate}%` : '—'

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '4px 0',
    }}>

      {/* Search Input */}
      <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
        <Search style={{
          position: 'absolute',
          left: 8,
          width: 13,
          height: 13,
          color: 'var(--text-dim)',
          pointerEvents: 'none',
        }} />
        <input
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          placeholder="Search leads..."
          style={{
            width: 200,
            fontSize: 12,
            padding: '6px 10px 6px 26px',
            borderRadius: 8,
            border: '1px solid var(--glass-interactive-border)',
            background: 'var(--glass-pill-bg)',
            color: 'var(--text-secondary)',
            outline: 'none',
            fontFamily: 'inherit',
          }}
        />
        {!searchFocused && !searchQuery && (
          <span style={{
            position: 'absolute',
            right: 8,
            fontSize: 10,
            color: 'var(--text-dim)',
            background: 'var(--glass-pill-bg)',
            borderRadius: 4,
            padding: '1px 4px',
            border: '1px solid var(--glass-interactive-border)',
            pointerEvents: 'none',
            lineHeight: 1.4,
          }}>
            ⌘K
          </span>
        )}
      </div>

      {/* Score Filter */}
      <select
        value={filters.score ?? 'all'}
        onChange={(e) => onFiltersChange({ ...filters, score: e.target.value as LeadFilter['score'] })}
        style={selectStyle}
      >
        <option value="all">Score</option>
        <option value="hot">Hot</option>
        <option value="warm">Warm</option>
        <option value="cold">Cold</option>
      </select>

      {/* Source Filter */}
      <select
        value={filters.source ?? 'all'}
        onChange={(e) => onFiltersChange({ ...filters, source: e.target.value })}
        style={selectStyle}
      >
        <option value="all">Source</option>
        <option value="email">Email</option>
        <option value="whatsapp">WhatsApp</option>
        <option value="web">Web</option>
        <option value="slack">Slack</option>
        <option value="pcc_discovery">PCC Discovery</option>
      </select>

      {/* Separator */}
      <div style={{ width: 1, height: 20, background: 'var(--glass-hover-bg)' }} />

      {/* Inline Pipeline Metrics */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        fontSize: 12,
        fontFamily: 'var(--font-mono)',
        color: 'var(--text-dim)',
        gap: 0,
        whiteSpace: 'nowrap',
      }}>
        <span>{pipelineValue}</span>
        <span style={{ margin: '0 4px', color: 'var(--text-dim)' }}>·</span>
        <span>{conversionRate}</span>
        <span style={{ margin: '0 4px', color: 'var(--text-dim)' }}>·</span>
        <span style={{ color: speedColor }}>{speedLabel}</span>
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* View Toggle */}
      <div style={{
        display: 'flex',
        borderRadius: 8,
        border: '1px solid var(--border-subtle)',
        overflow: 'hidden',
      }}>
        <button
          onClick={() => onViewModeChange('kanban')}
          style={{
            padding: '6px 10px',
            border: 'none',
            background: viewMode === 'kanban' ? 'var(--hover-bg-strong)' : 'transparent',
            color: viewMode === 'kanban' ? 'var(--text-primary)' : 'var(--text-dim)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <LayoutGrid style={{ width: 14, height: 14 }} />
        </button>
        <button
          onClick={() => onViewModeChange('list')}
          style={{
            padding: '6px 10px',
            border: 'none',
            background: viewMode === 'list' ? 'var(--hover-bg-strong)' : 'transparent',
            color: viewMode === 'list' ? 'var(--text-primary)' : 'var(--text-dim)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <List style={{ width: 14, height: 14 }} />
        </button>
      </div>

      {/* Discover Button */}
      <button
        onClick={onDiscoverClick}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 16px',
          borderRadius: 10,
          border: 'none',
          background: 'linear-gradient(135deg, var(--bb-cyan) 0%, var(--bb-blue) 100%)',
          color: '#fff',
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'opacity 0.15s',
        }}
      >
        <Search style={{ width: 14, height: 14 }} />
        Discover
      </button>
    </div>
  )
}
