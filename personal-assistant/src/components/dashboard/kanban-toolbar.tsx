'use client'

import { useState, useRef, useEffect } from 'react'
import { Search, Plus, X, ChevronDown } from 'lucide-react'

export interface FilterState {
  priority: string | null
  source: 'all' | 'bitbit' | 'you'
}

interface KanbanToolbarProps {
  totalCount: number
  overdueCount: number
  priorityCounts: Record<string, number>
  filters: FilterState
  onFiltersChange: (f: FilterState) => void
  searchQuery: string
  onSearchChange: (q: string) => void
  onCreateClick: () => void
  onOverdueClick: () => void
  searchInputRef: React.RefObject<HTMLInputElement | null>
}

const chipBase: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '4px 10px',
  borderRadius: 20,
  background: 'var(--bb-surface)',
  boxShadow: 'var(--card-inset)',
  border: 'none',
  fontSize: 12,
  fontWeight: 500,
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  fontFamily: 'inherit',
  transition: 'background 0.15s, color 0.15s',
  whiteSpace: 'nowrap' as const,
}

const chipActive: React.CSSProperties = {
  background: 'var(--hover-bg-strong)',
  color: 'var(--text-primary)',
}

const menuStyle: React.CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 6px)',
  left: 0,
  minWidth: 140,
  background: 'var(--glass-bg-heavy)',
  backdropFilter: 'var(--glass-blur)',
  WebkitBackdropFilter: 'var(--glass-blur)',
  borderRadius: 14,
  boxShadow: 'var(--card-shadow-hover), var(--card-inset)',
  padding: '6px',
  zIndex: 10,
  overflow: 'hidden',
}

const PRIORITY_OPTIONS = [
  { value: null, label: 'All' },
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
] as const

const SOURCE_OPTIONS = [
  { value: 'all' as const, label: 'All' },
  { value: 'bitbit' as const, label: 'BitBit' },
  { value: 'you' as const, label: 'You' },
]

export function KanbanToolbar({
  totalCount,
  overdueCount,
  priorityCounts,
  filters,
  onFiltersChange,
  searchQuery,
  onSearchChange,
  onCreateClick,
  onOverdueClick,
  searchInputRef,
}: KanbanToolbarProps) {
  const [openMenu, setOpenMenu] = useState<'priority' | 'source' | null>(null)
  const [hoveredItem, setHoveredItem] = useState<string | null>(null)
  const [searchExpanded, setSearchExpanded] = useState(false)

  useEffect(() => {
    function handleClickOutside() { setOpenMenu(null) }
    if (openMenu) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [openMenu])

  const hasPriorityFilter = filters.priority !== null
  const hasSourceFilter = filters.source !== 'all'

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      paddingBottom: 10,
      flexShrink: 0,
    }}>
      {/* Left: Title + count */}
      <h2 style={{
        fontSize: 15,
        fontWeight: 700,
        color: 'var(--text-primary)',
        letterSpacing: '-0.01em',
        margin: 0,
      }}>
        Tasks
      </h2>
      <span style={{
        fontSize: 11,
        fontWeight: 600,
        color: 'var(--text-dim)',
        background: 'var(--border-subtle)',
        borderRadius: 99,
        padding: '1px 7px',
      }}>
        {totalCount}
      </span>

      {/* Overdue badge */}
      {overdueCount > 0 && (
        <button
          onClick={onOverdueClick}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 18,
            height: 18,
            padding: '0 5px',
            borderRadius: 99,
            background: 'rgba(239, 68, 68, 0.15)',
            border: 'none',
            fontSize: 10,
            fontWeight: 700,
            color: '#f87171',
            cursor: 'pointer',
            fontFamily: 'inherit',
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.25)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)' }}
          title="Overdue tasks"
        >
          {overdueCount}
        </button>
      )}

      {/* Separator */}
      <div style={{ width: 1, height: 16, background: 'var(--border-active)', margin: '0 4px' }} />

      {/* Priority filter */}
      <div style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
        <button
          style={{
            ...chipBase,
            ...(hasPriorityFilter ? chipActive : {}),
          }}
          onClick={() => setOpenMenu(openMenu === 'priority' ? null : 'priority')}
        >
          {hasPriorityFilter ? `Priority: ${filters.priority}` : 'Priority'}
          {hasPriorityFilter ? (
            <span
              onClick={(e) => {
                e.stopPropagation()
                onFiltersChange({ ...filters, priority: null })
              }}
              style={{ display: 'flex', cursor: 'pointer' }}
            >
              <X size={10} />
            </span>
          ) : (
            <ChevronDown size={10} style={{ opacity: 0.6 }} />
          )}
        </button>
        {openMenu === 'priority' && (
          <div style={menuStyle}>
            {PRIORITY_OPTIONS.map((opt) => {
              const isActive = opt.value === filters.priority
              const isHov = hoveredItem === `p-${opt.value}`
              return (
                <button
                  key={opt.label}
                  onClick={() => { onFiltersChange({ ...filters, priority: opt.value }); setOpenMenu(null) }}
                  onMouseEnter={() => setHoveredItem(`p-${opt.value}`)}
                  onMouseLeave={() => setHoveredItem(null)}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '7px 10px',
                    borderRadius: 8,
                    border: 'none',
                    background: isActive ? 'var(--hover-bg-strong)' : isHov ? 'var(--hover-bg)' : 'transparent',
                    color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontSize: 12,
                    fontWeight: isActive ? 600 : 400,
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontFamily: 'inherit',
                    transition: 'background 0.1s',
                  }}
                >
                  {opt.label}
                  {opt.value && (
                    <span style={{ color: 'var(--text-dim)', fontWeight: 400, marginLeft: 4 }}>
                      ({priorityCounts[opt.value] || 0})
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Source filter */}
      <div style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
        <button
          style={{
            ...chipBase,
            ...(hasSourceFilter ? chipActive : {}),
          }}
          onClick={() => setOpenMenu(openMenu === 'source' ? null : 'source')}
        >
          {hasSourceFilter ? `Source: ${filters.source}` : 'Source'}
          {hasSourceFilter ? (
            <span
              onClick={(e) => {
                e.stopPropagation()
                onFiltersChange({ ...filters, source: 'all' })
              }}
              style={{ display: 'flex', cursor: 'pointer' }}
            >
              <X size={10} />
            </span>
          ) : (
            <ChevronDown size={10} style={{ opacity: 0.6 }} />
          )}
        </button>
        {openMenu === 'source' && (
          <div style={menuStyle}>
            {SOURCE_OPTIONS.map((opt) => {
              const isActive = opt.value === filters.source
              const isHov = hoveredItem === `s-${opt.value}`
              return (
                <button
                  key={opt.value}
                  onClick={() => { onFiltersChange({ ...filters, source: opt.value }); setOpenMenu(null) }}
                  onMouseEnter={() => setHoveredItem(`s-${opt.value}`)}
                  onMouseLeave={() => setHoveredItem(null)}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '7px 10px',
                    borderRadius: 8,
                    border: 'none',
                    background: isActive ? 'var(--hover-bg-strong)' : isHov ? 'var(--hover-bg)' : 'transparent',
                    color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontSize: 12,
                    fontWeight: isActive ? 600 : 400,
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontFamily: 'inherit',
                    transition: 'background 0.1s',
                  }}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Search */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        padding: '4px 10px',
        borderRadius: 20,
        background: searchExpanded ? 'var(--bg-secondary)' : 'var(--bb-surface)',
        boxShadow: 'var(--card-inset)',
        transition: 'background 0.15s, width 0.2s ease',
        width: searchExpanded ? 180 : 'auto',
        cursor: searchExpanded ? 'text' : 'pointer',
      }}
        onClick={() => {
          if (!searchExpanded) {
            setSearchExpanded(true)
            setTimeout(() => searchInputRef.current?.focus(), 30)
          }
        }}
      >
        <Search size={12} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
        {searchExpanded ? (
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onBlur={() => { if (!searchQuery) setSearchExpanded(false) }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                onSearchChange('')
                setSearchExpanded(false)
                ;(e.target as HTMLInputElement).blur()
              }
            }}
            placeholder="Search..."
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontSize: 12,
              color: 'var(--text-primary)',
              padding: 0,
              fontFamily: 'inherit',
              minWidth: 0,
            }}
          />
        ) : (
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            <kbd style={{ fontFamily: 'inherit', fontSize: 10 }}>⌘K</kbd>
          </span>
        )}
      </div>

      {/* Create button */}
      <button
        onClick={onCreateClick}
        style={{
          ...chipBase,
          background: 'var(--hover-bg)',
          color: 'var(--text-secondary)',
          padding: '4px 10px',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--border-active)'
          e.currentTarget.style.color = 'var(--text-primary)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'var(--hover-bg)'
          e.currentTarget.style.color = 'var(--text-secondary)'
        }}
      >
        <Plus size={13} />
        New
      </button>
    </div>
  )
}
