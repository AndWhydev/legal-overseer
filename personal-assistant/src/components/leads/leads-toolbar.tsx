'use client'

import { Search, LayoutGrid, List } from 'lucide-react'
import type { LeadFilter, SmartView, LeadViewMode } from '@/lib/leads/types'

interface LeadsToolbarProps {
  filters: LeadFilter
  onFiltersChange: (filters: LeadFilter) => void
  viewMode: LeadViewMode
  onViewModeChange: (mode: LeadViewMode) => void
  onDiscoverClick: () => void
}

const SCORE_OPTIONS = ['all', 'hot', 'warm', 'cold'] as const
const SOURCE_OPTIONS = ['all', 'email', 'whatsapp', 'web', 'slack', 'pcc_discovery'] as const
const STALENESS_OPTIONS = ['all', 'fresh', 'aging', 'stale', 'critical'] as const

const SMART_VIEWS: Array<{ value: SmartView; label: string }> = [
  { value: 'all', label: 'All Leads' },
  { value: 'hot_followup', label: 'Hot — Needs Follow-up' },
  { value: 'stale', label: 'Stale Leads' },
  { value: 'high_value', label: 'High-Value Pipeline' },
  { value: 'pcc_discoveries', label: 'PCC Discoveries' },
]

const selectStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  padding: '6px 10px',
  borderRadius: 8,
  border: '1px solid rgba(255, 255, 255, 0.06)',
  background: 'rgba(10, 14, 23, 0.4)',
  color: '#94A3B8',
  cursor: 'pointer',
  outline: 'none',
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).replace('_', ' ')
}

export function LeadsToolbar({
  filters,
  onFiltersChange,
  viewMode,
  onViewModeChange,
  onDiscoverClick,
}: LeadsToolbarProps) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      flexWrap: 'wrap',
      padding: '4px 0',
    }}>
      {/* Smart View Dropdown */}
      <select
        value={filters.smartView ?? 'all'}
        onChange={(e) => onFiltersChange({ ...filters, smartView: e.target.value as SmartView })}
        style={{ ...selectStyle, fontWeight: 600 }}
      >
        {SMART_VIEWS.map((sv) => (
          <option key={sv.value} value={sv.value}>{sv.label}</option>
        ))}
      </select>

      {/* Separator */}
      <div style={{ width: 1, height: 20, background: 'rgba(255, 255, 255, 0.06)' }} />

      {/* Score Filter */}
      <select
        value={filters.score ?? 'all'}
        onChange={(e) => onFiltersChange({ ...filters, score: e.target.value as LeadFilter['score'] })}
        style={selectStyle}
      >
        {SCORE_OPTIONS.map((o) => (
          <option key={o} value={o}>{o === 'all' ? 'Score' : capitalize(o)}</option>
        ))}
      </select>

      {/* Source Filter */}
      <select
        value={filters.source ?? 'all'}
        onChange={(e) => onFiltersChange({ ...filters, source: e.target.value })}
        style={selectStyle}
      >
        {SOURCE_OPTIONS.map((o) => (
          <option key={o} value={o}>{o === 'all' ? 'Source' : capitalize(o)}</option>
        ))}
      </select>

      {/* Staleness Filter */}
      <select
        value={filters.staleness ?? 'all'}
        onChange={(e) => onFiltersChange({ ...filters, staleness: e.target.value as LeadFilter['staleness'] })}
        style={selectStyle}
      >
        {STALENESS_OPTIONS.map((o) => (
          <option key={o} value={o}>{o === 'all' ? 'Staleness' : capitalize(o)}</option>
        ))}
      </select>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* View Toggle */}
      <div style={{ display: 'flex', borderRadius: 8, border: '1px solid rgba(255, 255, 255, 0.06)', overflow: 'hidden' }}>
        <button
          onClick={() => onViewModeChange('kanban')}
          style={{
            padding: '6px 10px',
            border: 'none',
            background: viewMode === 'kanban' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
            color: viewMode === 'kanban' ? '#F1F5F9' : '#475569',
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
            background: viewMode === 'list' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
            color: viewMode === 'list' ? '#F1F5F9' : '#475569',
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
          background: 'linear-gradient(135deg, var(--bb-cyan, #06B6D4) 0%, var(--bb-blue, #3B82F6) 100%)',
          color: '#fff',
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'opacity 0.15s',
        }}
      >
        <Search style={{ width: 14, height: 14 }} />
        Discover Prospects
      </button>
    </div>
  )
}
