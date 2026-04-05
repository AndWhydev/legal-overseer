'use client'

import { IconChevronDown, IconPlus, IconSearch, IconX } from '@tabler/icons-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'

export interface FilterState {
  priority: string | null
  source: 'all' | 'bitbit' | 'you'
  overdueOnly: boolean
}

interface KanbanToolbarProps {
  visibleCount: number
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
  { value: 'all', label: 'All priorities' },
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
] as const

const SOURCE_OPTIONS = [
  { value: 'all', label: 'All sources' },
  { value: 'bitbit', label: 'BitBit' },
  { value: 'you', label: 'You' },
] as const

function formatPriorityLabel(priority: string | null) {
  if (!priority) return 'All priorities'
  return priority.charAt(0).toUpperCase() + priority.slice(1)
}

function formatSourceLabel(source: FilterState['source']) {
  return SOURCE_OPTIONS.find((option) => option.value === source)?.label ?? 'All sources'
}

export function KanbanToolbar({
  visibleCount,
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
  const hasPriorityFilter = filters.priority !== null
  const hasSourceFilter = filters.source !== 'all'
  const hasSearch = searchQuery.trim().length > 0
  const hasAnyFilters = hasPriorityFilter || hasSourceFilter || filters.overdueOnly || hasSearch

  return (
    <div className="flex flex-col gap-4 border-b border-border px-4 py-5 sm:px-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-medium tracking-tight text-foreground">
              Task board
            </h2>
            <Badge variant="outline" className="bg-background font-mono">
              {hasAnyFilters ? `${visibleCount}/${totalCount}` : totalCount}
            </Badge>
            {overdueCount > 0 && (
              <Button
                type="button"
                variant={filters.overdueOnly ? 'destructive' : 'outline'}
                size="sm"
                onClick={onOverdueClick}
                aria-pressed={filters.overdueOnly}
                className="gap-1.5"
              >
                Overdue
                <Badge
                  variant={filters.overdueOnly ? 'secondary' : 'outline'}
                  className="bg-transparent px-1.5 text-sm"
                >
                  {overdueCount}
                </Badge>
              </Button>
            )}
          </div>

          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Move work with confidence, filter down to what needs attention, and keep creation quick
            without turning the board into visual noise.
          </p>

          <p className="text-sm text-muted-foreground">
            {hasAnyFilters
              ? `Showing ${visibleCount} of ${totalCount} tasks.`
              : 'Showing the full board.'}
          </p>
        </div>

        <div className="flex w-full flex-col gap-3 xl:max-w-xl xl:items-end">
          <div className="flex flex-wrap items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant={hasPriorityFilter ? 'secondary' : 'outline'}
                  size="sm"
                  className="gap-2"
                >
                  Priority
                  <span className="truncate text-muted-foreground">
                    {formatPriorityLabel(filters.priority)}
                  </span>
                  <IconChevronDown data-icon className="size-3.5 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel>Filter by priority</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup
                  value={filters.priority ?? 'all'}
                  onValueChange={(value) =>
                    onFiltersChange({
                      ...filters,
                      priority: value === 'all' ? null : value,
                    })
                  }
                >
                  {PRIORITY_OPTIONS.map((option) => (
                    <DropdownMenuRadioItem key={option.value} value={option.value}>
                      {option.label}
                      {option.value !== 'all' && (
                        <span className="ml-auto font-mono text-sm text-muted-foreground">
                          {priorityCounts[option.value] ?? 0}
                        </span>
                      )}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant={hasSourceFilter ? 'secondary' : 'outline'}
                  size="sm"
                  className="gap-2"
                >
                  Source
                  <span className="truncate text-muted-foreground">
                    {formatSourceLabel(filters.source)}
                  </span>
                  <IconChevronDown data-icon className="size-3.5 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                <DropdownMenuLabel>Filter by source</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup
                  value={filters.source}
                  onValueChange={(value) =>
                    onFiltersChange({
                      ...filters,
                      source: value as FilterState['source'],
                    })
                  }
                >
                  {SOURCE_OPTIONS.map((option) => (
                    <DropdownMenuRadioItem key={option.value} value={option.value}>
                      {option.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            {hasAnyFilters && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  onFiltersChange({
                    priority: null,
                    source: 'all',
                    overdueOnly: false,
                  })
                }
                className="gap-1.5 text-muted-foreground"
              >
                <IconX data-icon className="size-3.5" />
                Clear filters
              </Button>
            )}
          </div>

          <div className="flex w-full flex-col gap-2 sm:flex-row xl:w-auto">
            <div className="relative min-w-0 flex-1 sm:min-w-[18rem] xl:min-w-[20rem]">
              <label htmlFor="tasks-search" className="sr-only">
                Search tasks
              </label>
              <IconSearch
                data-icon
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                id="tasks-search"
                ref={searchInputRef}
                value={searchQuery}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="Search titles or notes"
                className="h-9 w-full rounded-xl bg-background pl-9 pr-10"
              />
              {hasSearch && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => {
                    onSearchChange('')
                    searchInputRef.current?.focus()
                  }}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2"
                  aria-label="Clear task search"
                >
                  <IconX data-icon className="size-3.5" />
                </Button>
              )}
            </div>

            <Button type="button" size="lg" onClick={onCreateClick} className="gap-2 rounded-xl px-4">
              <IconPlus data-icon className="size-4" />
              New task
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
