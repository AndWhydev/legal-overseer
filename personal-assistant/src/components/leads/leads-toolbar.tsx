'use client'

import React, { useState, memo } from 'react'
import { Search, LayoutGrid, List } from 'lucide-react'
import { GlassToggle } from '@/components/ui/glass-toggle'
import { GlassDropdown } from '@/components/ui/glass-dropdown'
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
  border: 'none',
  background: 'var(--bg-input, rgba(13, 17, 23, 0.6))',
  color: 'var(--text-primary, #F1F5F9)',
  outline: 'none',
  fontFamily: 'inherit',
  transition: 'box-shadow 200ms',
  boxShadow: 'var(--card-inset, inset 0 1px 0 rgba(255, 255, 255, 0.05))',
  backdropFilter: 'var(--glass-blur, blur(20px) saturate(1.2))',
  WebkitBackdropFilter: 'var(--glass-blur, blur(20px) saturate(1.2))',
}


const divider: React.CSSProperties = {
  width: 1,
  height: 20,
  background: 'var(--hover-bg-strong, rgba(255, 255, 255, 0.06))',
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

const discoverBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  height: 40,
  padding: '0 20px',
  borderRadius: 8,
  border: 'none',
  background: 'var(--btn-primary-bg, #F1F5F9)',
  color: 'var(--btn-primary-fg, #0a0f1a)',
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'all 200ms',
  backdropFilter: 'var(--glass-blur, blur(20px) saturate(1.2))',
  WebkitBackdropFilter: 'var(--glass-blur, blur(20px) saturate(1.2))',
  boxShadow: 'var(--card-inset, inset 0 1px 0 rgba(255, 255, 255, 0.05))',
}

// ─── Score Options ──────────────────────────────────────────────────────────
const scoreOptions = [
  { value: 'all', label: 'Score' },
  { value: 'hot', label: 'Hot' },
  { value: 'warm', label: 'Warm' },
  { value: 'cold', label: 'Cold' },
]

const sourceOptions = [
  { value: 'all', label: 'Source' },
  { value: 'email', label: 'Email' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'web', label: 'Web' },
  { value: 'slack', label: 'Slack' },
  { value: 'discovery', label: 'Discovery' },
]

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
          className="bb-glass-input"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          placeholder="Search leads..."
          aria-label="Search leads"
          style={{
            ...searchInput,
          }}
        />
      </div>

      {/* Score Filter */}
      <GlassDropdown
        value={filters.score ?? 'all'}
        options={scoreOptions}
        onChange={(val) => onFiltersChange({ ...filters, score: val as LeadFilter['score'] })}
        placeholder="Score"
      />

      {/* Source Filter */}
      <GlassDropdown
        value={filters.source ?? 'all'}
        options={sourceOptions}
        onChange={(val) => onFiltersChange({ ...filters, source: val })}
        placeholder="Source"
      />

      <div style={divider} aria-hidden="true" />

      {/* Inline Pipeline Metrics */}
      <div style={metricsContainer} aria-label="Pipeline metrics">
        <span>{pipelineValue}</span>
        <span style={metricDot} aria-hidden="true">&middot;</span>
        <span>{conversionRate}</span>
        <span style={metricDot} aria-hidden="true">&middot;</span>
        <span>{speedLabel}</span>
      </div>

      <div style={spacer} />

      {/* View Toggle */}
      <GlassToggle
        size="sm"
        options={[
          { key: 'kanban' as const, label: 'Kanban', icon: <LayoutGrid size={16} /> },
          { key: 'list' as const, label: 'List', icon: <List size={16} /> },
        ]}
        value={viewMode}
        onChange={onViewModeChange}
      />

      {/* Discover Button */}
      <button
        onClick={onDiscoverClick}
        style={discoverBtnStyle}
        aria-label="Discover new prospects"
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--btn-primary-hover, #E2E8F0)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'var(--btn-primary-bg, #F1F5F9)'; e.currentTarget.style.transform = 'translateY(0)' }}
      >
        <Search size={16} />
        Discover
      </button>
    </div>
  )
}

export const LeadsToolbar = memo(LeadsToolbarInner)
