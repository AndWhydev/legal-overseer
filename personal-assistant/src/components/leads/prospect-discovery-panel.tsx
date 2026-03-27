'use client'

import React, { useState, useCallback, useEffect, memo } from 'react'
import { IconSearch } from '@tabler/icons-react'
import { useProspectDiscovery } from '@/hooks/use-prospect-discovery'
import { ProspectCard } from './prospect-card'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Spinner } from '@/components/ui/spinner'

interface ProspectDiscoveryPanelProps {
  open: boolean
  onClose: () => void
}

function ProspectDiscoveryPanelInner({ open, onClose }: ProspectDiscoveryPanelProps) {
  const { job, isSearching, startDiscovery, importProspect, reset } = useProspectDiscovery()
  const [businessType, setBusinessType] = useState('')
  const [location, setLocation] = useState('')
  const [limit, setLimit] = useState(20)

  function handleClose() {
    reset()
    onClose()
  }

  function handleSearch() {
    if (!businessType.trim() || !location.trim()) return
    startDiscovery(businessType.trim(), location.trim(), limit)
  }

  const canSearch = businessType.trim() && location.trim()

  return (
    <Sheet open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose() }}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Discover Prospects</SheetTitle>
          <SheetDescription>
            Search for businesses in your target market.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {/* Search Form */}
          {!job && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="business-type">Business Type</Label>
                <Input
                  id="business-type"
                  type="text"
                  value={businessType}
                  onChange={(e) => setBusinessType(e.target.value)}
                  placeholder="plumber, accountant, buyer's agent"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="location">Location</Label>
                <Input
                  id="location"
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Brisbane, QLD"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="limit">Limit</Label>
                <Input
                  id="limit"
                  type="number"
                  value={limit}
                  onChange={(e) => setLimit(Math.min(50, Math.max(1, Number(e.target.value))))}
                  min={1}
                  max={50}
                  className="w-20"
                />
              </div>

              <Button
                onClick={handleSearch}
                disabled={!canSearch}
                className="w-full"
              >
                <IconSearch data-icon />
                Search
              </Button>
            </div>
          )}

          {/* Progress State */}
          {job && job.status !== 'complete' && job.status !== 'error' && (
            <div className="flex flex-col items-center gap-4 py-10">
              <Spinner className="size-6" />
              <div className="text-center">
                <div className="text-sm font-medium text-foreground">
                  {job.status === 'searching' ? 'Searching...' : job.status === 'enriching' ? 'Enriching...' : 'Scoring...'}
                </div>
                <div className="text-sm text-muted-foreground">{job.message}</div>
              </div>
              <Progress value={job.progress} className="h-1 w-full max-w-xs" />
            </div>
          )}

          {/* Error State */}
          {job?.status === 'error' && (
            <div className="py-6 text-center">
              <div className="mb-3 text-sm text-destructive">{job.error}</div>
              <Button variant="outline" onClick={reset}>
                Try Again
              </Button>
            </div>
          )}

          {/* Results */}
          {job?.status === 'complete' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">
                  {job.results.length} prospects found
                </span>
                <Button variant="ghost" size="sm" onClick={reset}>
                  New Search
                </Button>
              </div>

              {job.results.map((prospect, i) => (
                <ProspectCard key={`${prospect.domain ?? i}`} prospect={prospect} onImport={importProspect} />
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

export const ProspectDiscoveryPanel = memo(ProspectDiscoveryPanelInner)
