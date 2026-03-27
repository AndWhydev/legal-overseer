'use client'

import { useState, useRef, useEffect } from 'react'
import { IconSearch, IconPlus, IconX, IconChevronDown } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'

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
  const [searchExpanded, setSearchExpanded] = useState(false)

  const hasPriorityFilter = filters.priority !== null
  const hasSourceFilter = filters.source !== 'all'

  return (
    <div className="flex shrink-0 items-center gap-2 pb-3">
      {/* Left: Title + count */}
      <h2 className="text-base font-semibold tracking-tight text-foreground">
        Tasks
      </h2>
      <Badge variant="secondary" className="font-mono">
        {totalCount}
      </Badge>

      {/* Overdue badge */}
      {overdueCount > 0 && (
        <Badge
          variant="destructive"
          className="cursor-pointer"
          onClick={onOverdueClick}
        >
          {overdueCount}
        </Badge>
      )}

      <Separator orientation="vertical" className="mx-1 h-4" />

      {/* Priority filter */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant={hasPriorityFilter ? 'secondary' : 'outline'} size="sm" className="gap-1">
            {hasPriorityFilter ? `Priority: ${filters.priority}` : 'Priority'}
            {hasPriorityFilter ? (
              <span
                onClick={(e) => {
                  e.stopPropagation()
                  onFiltersChange({ ...filters, priority: null })
                }}
                className="flex cursor-pointer"
              >
                <IconX data-icon className="size-3" />
              </span>
            ) : (
              <IconChevronDown data-icon className="size-3 opacity-60" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>Filter by priority</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {PRIORITY_OPTIONS.map((opt) => (
            <DropdownMenuItem
              key={opt.label}
              onClick={() => onFiltersChange({ ...filters, priority: opt.value })}
              className={filters.priority === opt.value ? 'bg-accent font-semibold' : ''}
            >
              {opt.label}
              {opt.value && (
                <span className="ml-auto font-mono text-xs text-muted-foreground">
                  {priorityCounts[opt.value] || 0}
                </span>
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Source filter */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant={hasSourceFilter ? 'secondary' : 'outline'} size="sm" className="gap-1">
            {hasSourceFilter ? `Source: ${filters.source}` : 'Source'}
            {hasSourceFilter ? (
              <span
                onClick={(e) => {
                  e.stopPropagation()
                  onFiltersChange({ ...filters, source: 'all' })
                }}
                className="flex cursor-pointer"
              >
                <IconX data-icon className="size-3" />
              </span>
            ) : (
              <IconChevronDown data-icon className="size-3 opacity-60" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>Filter by source</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {SOURCE_OPTIONS.map((opt) => (
            <DropdownMenuItem
              key={opt.value}
              onClick={() => onFiltersChange({ ...filters, source: opt.value })}
              className={filters.source === opt.value ? 'bg-accent font-semibold' : ''}
            >
              {opt.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Search */}
      <div className="relative flex items-center">
        {searchExpanded ? (
          <div className="flex items-center gap-1">
            <IconSearch data-icon className="size-4 text-muted-foreground" />
            <Input
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
              className="h-7 w-48"
              autoFocus
            />
          </div>
        ) : (
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => {
              setSearchExpanded(true)
              setTimeout(() => searchInputRef.current?.focus(), 50)
            }}
          >
            <IconSearch data-icon />
          </Button>
        )}
      </div>

      {/* Create button */}
      <Button variant="outline" size="sm" onClick={onCreateClick} className="gap-1">
        <IconPlus data-icon />
        New
      </Button>
    </div>
  )
}
