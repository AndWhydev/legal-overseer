'use client'

import React, { memo } from 'react'
import { IconSearch, IconLayoutKanban, IconList } from '@tabler/icons-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
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

const scoreOptions = [
  { value: 'all', label: 'All Scores' },
  { value: 'hot', label: 'Hot' },
  { value: 'warm', label: 'Warm' },
  { value: 'cold', label: 'Cold' },
]

const sourceOptions = [
  { value: 'all', label: 'All Sources' },
  { value: 'email', label: 'Email' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'web', label: 'Web' },
  { value: 'slack', label: 'Slack' },
  { value: 'discovery', label: 'Discovery' },
]

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
  const speedMinutes = analytics?.avgSpeedToLeadMinutes ?? null
  const speedLabel = speedMinutes !== null ? `${speedMinutes}m` : '--'
  const pipelineValue = analytics ? formatPipelineValue(analytics.totalValue) : '--'
  const conversionRate = analytics ? `${analytics.conversionRate}%` : '--'

  return (
    <div className="flex items-center gap-2 py-1" role="toolbar" aria-label="Lead filters">
      {/* Search Input */}
      <InputGroup className="w-52">
        <InputGroupAddon>
          <IconSearch data-icon className="text-muted-foreground" />
        </InputGroupAddon>
        <InputGroupInput
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search leads..."
          aria-label="Search leads"
        />
      </InputGroup>

      {/* Score Filter */}
      <Select
        value={filters.score ?? 'all'}
        onValueChange={(val) => onFiltersChange({ ...filters, score: val as LeadFilter['score'] })}
      >
        <SelectTrigger size="sm">
          <SelectValue placeholder="Score" />
        </SelectTrigger>
        <SelectContent>
          {scoreOptions.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Source Filter */}
      <Select
        value={filters.source ?? 'all'}
        onValueChange={(val) => onFiltersChange({ ...filters, source: val })}
      >
        <SelectTrigger size="sm">
          <SelectValue placeholder="Source" />
        </SelectTrigger>
        <SelectContent>
          {sourceOptions.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Separator orientation="vertical" className="mx-1 h-5" />

      {/* Inline Pipeline Metrics */}
      <div className="flex items-center gap-0 text-sm font-mono text-muted-foreground whitespace-nowrap" aria-label="Pipeline metrics">
        <span>{pipelineValue}</span>
        <span className="mx-1" aria-hidden="true">&middot;</span>
        <span>{conversionRate}</span>
        <span className="mx-1" aria-hidden="true">&middot;</span>
        <span>{speedLabel}</span>
      </div>

      <div className="flex-1" />

      {/* View Toggle */}
      <ToggleGroup
        type="single"
        value={viewMode}
        onValueChange={(val) => { if (val) onViewModeChange(val as LeadViewMode) }}
        size="sm"
      >
        <ToggleGroupItem value="kanban" aria-label="Kanban view">
          <IconLayoutKanban data-icon />
        </ToggleGroupItem>
        <ToggleGroupItem value="list" aria-label="List view">
          <IconList data-icon />
        </ToggleGroupItem>
      </ToggleGroup>

      {/* Discover Button */}
      <Button onClick={onDiscoverClick} aria-label="Discover new prospects">
        <IconSearch data-icon />
        Discover
      </Button>
    </div>
  )
}

export const LeadsToolbar = memo(LeadsToolbarInner)
