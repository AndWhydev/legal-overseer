'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  IconSearch,
  IconBuilding,
  IconWorld,
  IconUsers,
  IconAlertCircle,
  IconPlus,
  IconChevronRight,
} from '@tabler/icons-react'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { TabSkeleton } from './tab-skeleton'
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
  EmptyContent,
} from '@/components/ui/empty'
import { logger } from '@/lib/core/logger'

interface Company {
  id: string
  name: string
  domainName: {
    primaryLinkLabel: string
    primaryLinkUrl: string
  }
  address: {
    addressCity: string
    addressState: string
    addressCountry: string
  }
  employees: number | null
  idealCustomerProfile: boolean
  createdAt: string
  annualRecurringRevenue: {
    amountMicros: number | null
    currencyCode: string | null
  }
}

function CompaniesTab() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<string>('az')

  const loadCompanies = useCallback(async () => {
    const res = await fetch('/api/twenty/companies')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    setCompanies(json.data?.companies ?? [])
    setError(null)
  }, [])

  useEffect(() => {
    let mounted = true
    async function bootstrap() {
      try {
        await loadCompanies()
      } catch (err) {
        logger.error('[companies-tab] fetch error:', err)
        if (mounted) setError('Failed to load companies')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    void bootstrap()
    return () => { mounted = false }
  }, [loadCompanies])

  const filtered = useMemo(() => {
    let result = companies
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(c =>
        c.name?.toLowerCase().includes(q) ||
        c.domainName?.primaryLinkLabel?.toLowerCase().includes(q) ||
        c.address?.addressCity?.toLowerCase().includes(q)
      )
    }
    return result.sort((a, b) => {
      if (sort === 'za') return (b.name || '').localeCompare(a.name || '')
      if (sort === 'recent') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      return (a.name || '').localeCompare(b.name || '')
    })
  }, [companies, search, sort])

  if (loading) return <TabSkeleton variant="cards-grid" />

  if (error && companies.length === 0) {
    return (
      <Empty className="py-12">
        <EmptyMedia variant="icon"><IconAlertCircle size={20} /></EmptyMedia>
        <EmptyTitle>{"Couldn't load companies"}</EmptyTitle>
        <EmptyDescription>{error}</EmptyDescription>
        <EmptyContent>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setError(null); setLoading(true); loadCompanies().catch(() => setError('Failed to load companies')).finally(() => setLoading(false)) }}
          >
            Retry
          </Button>
        </EmptyContent>
      </Empty>
    )
  }

  if (companies.length === 0) {
    return (
      <Empty className="py-12">
        <EmptyHeader>
          <EmptyMedia variant="icon"><IconBuilding className="size-4" /></EmptyMedia>
          <EmptyTitle>No companies yet</EmptyTitle>
          <EmptyDescription>
            Companies are synced from Twenty CRM. Add your first company to get started.
          </EmptyDescription>
        </EmptyHeader>
        <Button variant="outline" size="sm" disabled>
          <IconPlus className="size-3.5 mr-1.5" />
          Add company
        </Button>
      </Empty>
    )
  }

  const icpCount = companies.filter(c => c.idealCustomerProfile).length

  return (
    <div className="flex flex-col gap-5">
      {/* Stats */}
      <div className="flex items-center gap-3 text-sm">
        <StatPill value={companies.length} label="total" active />
        <Separator orientation="vertical" className="h-4" />
        <StatPill value={icpCount} label="ICP" active={icpCount > 0} />
      </div>

      {/* Search + Sort */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <IconSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          <Input
            type="text"
            placeholder="Search companies..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="az">A &rarr; Z</SelectItem>
            <SelectItem value="za">Z &rarr; A</SelectItem>
            <SelectItem value="recent">Recent</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Company list */}
      {filtered.length === 0 ? (
        <Empty className="py-8">
          <EmptyHeader>
            <EmptyTitle>No matches</EmptyTitle>
            <EmptyDescription>No companies matching &ldquo;{search}&rdquo;</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-1.5">
          {filtered.map(company => (
            <CompanyCard key={company.id} company={company} />
          ))}
        </div>
      )}
    </div>
  )
}

function StatPill({ value, label, active }: { value: number | string; label: string; active?: boolean }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className={`text-sm font-semibold tabular-nums ${active ? 'text-foreground' : 'text-muted-foreground'}`}>
        {value}
      </span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </span>
  )
}

function CompanyCard({ company }: { company: Company }) {
  const domain = company.domainName?.primaryLinkLabel || ''
  const city = company.address?.addressCity || ''
  const initials = (company.name || 'C')
    .split(/\s+/)
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <Card className="py-0 gap-0 transition-all hover:bg-accent/50 hover:-translate-y-px active:translate-y-0">
      <CardContent className="flex items-center gap-3.5 py-3.5">
        <Avatar size="lg">
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-medium text-foreground truncate">
              {company.name}
            </span>
            {company.idealCustomerProfile && (
              <Badge variant="default" className="shrink-0">ICP</Badge>
            )}
          </div>

          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
            {domain && (
              <span className="inline-flex items-center gap-1 truncate">
                <IconWorld className="size-3 shrink-0" />
                {domain}
              </span>
            )}
            {city && (
              <span className="truncate">{city}</span>
            )}
            {company.employees != null && (
              <span className="inline-flex items-center gap-1">
                <IconUsers className="size-3 shrink-0" />
                {company.employees}
              </span>
            )}
          </div>
        </div>

        <IconChevronRight className="size-4 text-muted-foreground shrink-0 opacity-50" />
      </CardContent>
    </Card>
  )
}

export default React.memo(CompaniesTab)
