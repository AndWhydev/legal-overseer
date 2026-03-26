'use client'

import React, { useState, memo } from 'react'
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

// ─── Hoisted Styles ─────────────────────────────────────────────────────────
const toolbarContainer: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '4px 0',
}

const searchWrap: React.CSSProperties = {
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
}

const searchIcon: React.CSSProperties = {
  position: 'absolute',
  left: 12,
  width: 16,
  height: 16,
  color: 'var(--text-dim, #475569)',
  pointerEvents: 'none',
}

const searchInput: React.CSSProperties = {
  width: 200,
  height: 40,
  fontSize: 14,
  padding: '0 12px 0 36px',
  borderRadius: 8,
  border: '1px solid rgba(255, 255, 255, 0.05)',
  background: 'rgba(13, 17, 23, 0.6)',
  color: 'var(--text-primary, #F1F5F9)',
  outline: 'none',
  fontFamily: 'inherit',
  transition: 'border-color 200ms, box-shadow 200ms',
}

const kbdHint: React.CSSProperties = {
  position: 'absolute',
  right: 8,
  fontSize: 14,
  color: 'var(--text-dim, #475569)',
  background: 'rgba(255, 255, 255, 0.06)',
  borderRadius: 8,
  padding: '2px 6px',
  border: '1px solid rgba(255, 255, 255, 0.06)',
  pointerEvents: 'none',
  lineHeight: 1.4,
}

const selectStyle: React.CSSProperties = {
  height: 40,
  fontSize: 14,
  fontWeight: 500,
  padding: '0 12px',
  borderRadius: 8,
  border: '1px solid rgba(255, 255, 255, 0.05)',
  background: 'rgba(13, 17, 23, 0.6)',
  color: 'var(--text-secondary, #94A3B8)',
  cursor: 'pointer',
  outline: 'none',
  appearance: 'none' as const,
}

const divider: React.CSSProperties = {
  width: 1,
  height: 20,
  background: 'rgba(255, 255, 255, 0.06)',
}

const metricsContainer: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  fontSize: 14,
  fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
  color: 'var(--text-dim, #475569)',
  gap: 0,
  whiteSpace: 'nowrap',
}

const metricDot: React.CSSProperties = {
  margin: '0 4px',
  color: 'var(--text-dim, #475569)',
}

const spacer: React.CSSProperties = {
  flex: 1,
}

const viewToggleWrap: React.CSSProperties = {
  display: 'flex',
  borderRadius: 8,
  border: '1px solid rgba(255, 255, 255, 0.06)',
  overflow: 'hidden',
}

const discoverBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  height: 40,
  padding: '0 20px',
  borderRadius: 8,
  border: 'none',
  background: '#FF5A1F',
  color: '#000',
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'all 200ms',
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function getSpeedColor(minutes: number | null): string {
  if (minutes === null) return 'var(--text-dim, #475569)'
  if (minutes <= 5) return '#22c55e'
  if (minutes <= 30) return '#eab308'
  return '#ef4444'
}

function viewBtn(active: boolean): React.CSSProperties {
  return {
    width: 40,
    height: 40,
    padding: 0,
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: active ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
    color: active ? 'var(--text-primary, #F1F5F9)' : 'var(--text-dim, #475569)',
    cursor: 'pointer',
    transition: 'all 200ms',
  }
}

// ─── Component ──────────────────────────────────────────────────────────────
function LeadsToolbarInner({
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
  const speedLabel = speedMinutes !== null ? `${speedMinutes}m` : '--'
  const pipelineValue = analytics ? formatPipelineValue(analytics.totalValue) : '--'
  const conversionRate = analytics ? `${analytics.conversionRate}%` : '--'

  return (
    <div style={toolbarContainer} role="toolbar" aria-label="Lead filters">

      {/* Search Input */}
      <div style={searchWrap}>
        <Search style={searchIcon} aria-hidden="true" />
        <input
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          placeholder="Search leads..."
          aria-label="Search leads"
          style={{
            ...searchInput,
            borderColor: searchFocused ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.05)',
            boxShadow: searchFocused ? '0 0 0 2px rgba(255, 90, 31, 0.15)' : 'none',
          }}
        />
        {!searchFocused && !searchQuery && (
          <kbd style={kbdHint} aria-hidden="true">
            {'\u2318'}K
          </kbd>
        )}
      </div>

      {/* Score Filter */}
      <select
        value={filters.score ?? 'all'}
        onChange={(e) => onFiltersChange({ ...filters, score: e.target.value as LeadFilter['score'] })}
        style={selectStyle}
        aria-label="Filter by score"
      >
        <option value="all">Score</option>
        <option value="hot">Hot</option>
        <option value="warm">Warm</option>
        <option value="cold">Cold</option>
      </select>

      {/* Source Filter — includes Lead Swarm */}
      <select
        value={filters.source ?? 'all'}
        onChange={(e) => onFiltersChange({ ...filters, source: e.target.value })}
        style={selectStyle}
        aria-label="Filter by source"
      >
        <option value="all">Source</option>
        <option value="email">Email</option>
        <option value="whatsapp">WhatsApp</option>
        <option value="web">Web</option>
        <option value="slack">Slack</option>
        <option value="pcc_discovery">Lead Swarm</option>
      </select>

      <div style={divider} aria-hidden="true" />

      {/* Inline Pipeline Metrics */}
      <div style={metricsContainer} aria-label="Pipeline metrics">
        <span>{pipelineValue}</span>
        <span style={metricDot} aria-hidden="true">&middot;</span>
        <span>{conversionRate}</span>
        <span style={metricDot} aria-hidden="true">&middot;</span>
        <span style={{ color: speedColor }}>{speedLabel}</span>
      </div>

      <div style={spacer} />

      {/* View Toggle */}
      <div style={viewToggleWrap} role="radiogroup" aria-label="View mode">
        <button
          role="radio"
          aria-checked={viewMode === 'kanban'}
          aria-label="Kanban view"
          onClick={() => onViewModeChange('kanban')}
          style={viewBtn(viewMode === 'kanban')}
        >
          <LayoutGrid size={16} />
        </button>
        <button
          role="radio"
          aria-checked={viewMode === 'list'}
          aria-label="List view"
          onClick={() => onViewModeChange('list')}
          style={viewBtn(viewMode === 'list')}
        >
          <List size={16} />
        </button>
      </div>

      {/* Discover Button */}
      <button
        onClick={onDiscoverClick}
        style={discoverBtnStyle}
        aria-label="Discover new prospects"
        onMouseEnter={e => { e.currentTarget.style.background = '#FF7A45'; e.currentTarget.style.transform = 'translateY(-1px)' }}
        onMouseLeave={e => { e.currentTarget.style.background = '#FF5A1F'; e.currentTarget.style.transform = 'translateY(0)' }}
      >
        <Search size={16} />
        Discover
      </button>
    </div>
  )
}

export const LeadsToolbar = memo(LeadsToolbarInner)
