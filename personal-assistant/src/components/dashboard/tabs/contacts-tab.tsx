'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  IconSearch,
  IconChevronRight,
  IconMail,
  IconPhone,
  IconUsers,
  IconAlertCircle,
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
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
  EmptyContent,
} from '@/components/ui/empty'
import { useDevOverrides } from '@/lib/dev/dev-overrides'
import { EntityDetailDrawer } from '@/components/dashboard/entity-detail-drawer'
import { ContactsPageTooltip } from '@/components/onboarding/first-run-guide'
import { logger } from '@/lib/core/logger'

type ContactType = 'client' | 'partner' | 'lead' | 'vendor' | string

interface Contact {
  id?: string | number
  name?: string
  email?: string
  phone?: string
  emails?: string[]
  phones?: string[]
  type?: ContactType
  tags?: string[]
  avatar_url?: string | null
  profile_data?: Record<string, unknown>
}

function normalizeContacts(payload: unknown): Contact[] {
  if (Array.isArray(payload)) return payload as Contact[]
  if (payload && typeof payload === 'object') {
    const maybeContacts = (payload as { contacts?: unknown }).contacts
    if (Array.isArray(maybeContacts)) return maybeContacts as Contact[]
  }
  return []
}

// Seed data -- activated via dev toolbar

const SEED_CONTACTS: Contact[] = [
  {
    id: 'sc1', name: 'Mira Patel', email: 'mira@patelconsulting.com', phone: '+61 412 345 678',
    type: 'client', tags: ['Branding', 'Web Design'],
  },
  {
    id: 'sc2', name: 'James Liu', email: 'james@liuathletics.com.au', phone: '+61 423 456 789',
    type: 'client', tags: ['E-commerce', 'SEO'],
  },
  {
    id: 'sc3', name: 'Sarah Chen', email: 'sarah@designstudio.co', phone: '+61 434 567 890',
    type: 'client', tags: ['UI/UX', 'Brand Strategy', 'Retainer'],
  },
  {
    id: 'sc4', name: 'Tom Bradley', email: 'tom.b@acmecorp.com',
    type: 'lead', tags: ['Social Media'],
  },
  {
    id: 'sc5', name: 'Olivia Park', email: 'olivia@parkassociates.com', phone: '+61 445 678 901',
    type: 'client', tags: ['Copywriting', 'Web Design'],
  },
  {
    id: 'sc6', name: 'Andy Wu', email: 'andy@awudigital.com',
    type: 'partner', tags: ['Brand Refresh', 'Referral'],
  },
  {
    id: 'sc7', name: 'Priya Sharma', email: 'priya@cloudnative.dev', phone: '+61 456 789 012',
    type: 'vendor', tags: ['Hosting', 'DevOps'],
  },
  {
    id: 'sc8', name: 'Marcus Johnson', email: 'marcus@pixelcraft.io',
    type: 'partner', tags: ['Photography', 'Content'],
  },
]

// Type to badge variant mapping
const CONTACT_TYPE_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  client: 'default',
  lead: 'secondary',
  partner: 'outline',
  vendor: 'outline',
}

// Component

function ContactsTab() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<string>('az')
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null)

  const devOverrides = useDevOverrides()
  const useSeeded = devOverrides?.seed_data?.contacts ?? false

  const loadContacts = useCallback(async () => {
    if (useSeeded) return
    const response = await fetch('/api/contacts')
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = await response.json().catch(() => null)
    setContacts(normalizeContacts(data))
    setError(null)
  }, [useSeeded])

  useEffect(() => {
    if (useSeeded) {
      setContacts(SEED_CONTACTS)
      setLoading(false)
      return
    }

    let mounted = true
    async function bootstrap() {
      try {
        await loadContacts()
      } catch (err) {
        logger.error('[contacts-tab] fetch error:', err)
        if (mounted) setError('Failed to load contacts')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    void bootstrap()
    return () => { mounted = false }
  }, [loadContacts, useSeeded])

  // Resolve avatars for contacts that don't have one yet (fire-and-forget)
  useEffect(() => {
    if (useSeeded || loading || contacts.length === 0) return
    const missing = contacts.filter(c => !c.avatar_url && c.id)
    if (missing.length === 0) return

    fetch('/api/contacts/resolve-avatars', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contact_ids: missing.map(c => String(c.id)) }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.resolved > 0) loadContacts()
      })
      .catch(() => {})
  }, [contacts, loading, useSeeded, loadContacts])

  // Auto-retry on error after 3 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError(null)
        setLoading(true)
        loadContacts()
          .catch(() => setError('Failed to load contacts'))
          .finally(() => setLoading(false))
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [error, loadContacts])

  const filtered = useMemo(() => {
    let result = contacts
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(c =>
        c.name?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.phone?.includes(q)
      )
    }
    return result.sort((a, b) => {
      if (sort === 'za') return (b.name || '').localeCompare(a.name || '')
      return (a.name || '').localeCompare(b.name || '')
    })
  }, [contacts, search, sort])

  if (loading && !useSeeded) {
    return (
      <div className="flex flex-col gap-4">
        {/* Stats skeleton */}
        <div className="flex gap-4 mb-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-5 w-16" />
          ))}
        </div>
        {/* Search skeleton */}
        <Skeleton className="h-8 w-full rounded-lg" />
        {/* Card skeletons */}
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  if (error && contacts.length === 0) {
    return (
      <Empty className="py-12">
        <EmptyMedia variant="icon"><IconAlertCircle size={20} /></EmptyMedia>
        <EmptyTitle>{"Couldn't load contacts"}</EmptyTitle>
        <EmptyDescription>{error}</EmptyDescription>
        <EmptyContent>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setError(null); setLoading(true); loadContacts().catch(() => setError('Failed to load contacts')).finally(() => setLoading(false)) }}
          >
            Retry
          </Button>
        </EmptyContent>
      </Empty>
    )
  }

  // Stats
  const clientCount = contacts.filter(c => c.type === 'client').length
  const leadCount = contacts.filter(c => c.type === 'lead').length
  const partnerCount = contacts.filter(c => c.type === 'partner').length

  if (contacts.length === 0) {
    return (
      <Empty className="py-12">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <IconUsers className="size-4" />
          </EmptyMedia>
          <EmptyTitle>No contacts yet</EmptyTitle>
          <EmptyDescription>
            Contacts are automatically created when BitBit processes emails and messages.
            Connect your email to start building your contact book.
          </EmptyDescription>
        </EmptyHeader>
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.dispatchEvent(new CustomEvent('bb-navigate', { detail: { tab: 'settings-connections' } }))}
        >
          Connect email
        </Button>
      </Empty>
    )
  }

  return (
    <>
      <ContactsPageTooltip>
        <div className="flex flex-col gap-5">
          {/* Inline Stats */}
          <div className="flex items-center gap-3 text-sm">
            <StatPill value={contacts.length} label="total" active={contacts.length > 0} />
            <Separator orientation="vertical" className="h-4" />
            <StatPill value={clientCount} label="clients" active={clientCount > 0} />
            <Separator orientation="vertical" className="h-4" />
            <StatPill value={leadCount} label="leads" active={leadCount > 0} />
            <Separator orientation="vertical" className="h-4" />
            <StatPill value={partnerCount} label="partners" />
          </div>

          {/* Search + Sort */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <IconSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
              <Input
                type="text"
                placeholder="Search contacts..."
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

          {/* Contact Grid */}
          {filtered.length === 0 ? (
            <Empty className="py-8">
              <EmptyHeader>
                <EmptyTitle>No matches</EmptyTitle>
                <EmptyDescription>No contacts matching "{search}"</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="flex flex-col gap-2">
              {filtered.map((contact, index) => (
                <ContactCard
                  key={String(contact.id ?? `${contact.name ?? 'contact'}-${index}`)}
                  contact={contact}
                  onOpen={() => {
                    if (contact.id != null) setSelectedContactId(String(contact.id))
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </ContactsPageTooltip>

      <EntityDetailDrawer
        open={selectedContactId !== null}
        onClose={() => setSelectedContactId(null)}
        entityType="contact"
        entityId={selectedContactId ?? ''}
      />
    </>
  )
}

// Stat Pill

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

// Contact Card

function ContactCard({ contact, onOpen }: { contact: Contact; onOpen: () => void }) {
  const email = contact.email ?? contact.emails?.[0]
  const phone = contact.phone ?? contact.phones?.[0]
  const contactType = contact.type ?? 'client'
  const tags: string[] = contact.tags ??
    ((contact.profile_data as Record<string, unknown>)?.tags as string[] ?? [])
  const canOpen = contact.id != null

  const initials = (contact.name || 'U')
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const badgeVariant = CONTACT_TYPE_VARIANT[contactType] || 'outline'

  return (
    <Card
      className="py-0 gap-0 cursor-pointer transition-all hover:bg-accent/50 hover:-translate-y-px active:translate-y-0"
      onClick={canOpen ? onOpen : undefined}
      role={canOpen ? 'button' : undefined}
      tabIndex={canOpen ? 0 : undefined}
      aria-label={canOpen ? `Open details for ${contact.name ?? 'contact'}` : `${contact.name ?? 'Contact'} has no detail view`}
      onKeyDown={(e) => { if (canOpen && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen(); } }}
    >
      <CardContent className="flex items-center gap-3.5 py-3.5">
        <Avatar size="lg">
          {contact.avatar_url && <AvatarImage src={contact.avatar_url} alt={contact.name ?? 'Contact'} />}
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-medium text-foreground truncate">
              {contact.name ?? 'Unnamed contact'}
            </span>
            <Badge variant={badgeVariant} className="capitalize shrink-0">
              {contactType}
            </Badge>
          </div>

          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
            {email && (
              <span className="inline-flex items-center gap-1 truncate">
                <IconMail className="size-3 shrink-0" />
                {email}
              </span>
            )}
            {phone && (
              <span className="inline-flex items-center gap-1 truncate">
                <IconPhone className="size-3 shrink-0" />
                {phone}
              </span>
            )}
          </div>

          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {tags.slice(0, 3).map(tag => (
                <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0">
                  {tag}
                </Badge>
              ))}
              {tags.length > 3 && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  +{tags.length - 3}
                </Badge>
              )}
            </div>
          )}
        </div>

        <IconChevronRight className="size-4 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-50 transition-opacity" />
      </CardContent>
    </Card>
  )
}

export default React.memo(ContactsTab)
