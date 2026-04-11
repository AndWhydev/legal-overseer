'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  IconSearch,
  IconChevronDown,
  IconMail,
  IconPhone,
  IconUsers,
  IconAlertCircle,
  IconUser,
  IconTarget,
  IconHeartHandshake,
  IconBuildingStore,
} from '@tabler/icons-react'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { TabSkeleton } from './tab-skeleton'
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
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@/components/ui/collapsible'
import { useDevOverrides } from '@/lib/dev/dev-overrides'
import { useDrawer } from '@/components/dashboard/drawer-context'
import { ContactDetailPanel } from '@/components/contacts/contact-detail-panel'
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

// Type groups with display metadata (order matters)
const CONTACT_TYPE_GROUPS: { key: string; label: string; icon: React.ElementType }[] = [
  { key: 'client', label: 'Clients', icon: IconUser },
  { key: 'lead', label: 'Leads', icon: IconTarget },
  { key: 'partner', label: 'Partners', icon: IconHeartHandshake },
  { key: 'vendor', label: 'Vendors', icon: IconBuildingStore },
]

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
  const { setDrawer, closeDrawer } = useDrawer()

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

  // Push contact detail into drawer
  useEffect(() => {
    if (selectedContactId) {
      setDrawer(
        <ContactDetailPanel
          entityId={selectedContactId}
          onClose={() => { setSelectedContactId(null); closeDrawer() }}
        />
      )
    }
  }, [selectedContactId, setDrawer, closeDrawer])

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
    return <TabSkeleton variant="cards-grid" />
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
            className="text-base"
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
          className="text-base"
          onClick={() => window.dispatchEvent(new CustomEvent('bb-navigate', { detail: { tab: 'settings-connections' } }))}
        >
          Connect email
        </Button>
      </Empty>
    )
  }

  return (
    <ContactsPageTooltip>
      <div className="flex flex-col gap-5 p-6">
        {/* Stat Bar */}
        <div className="flex flex-wrap rounded-[var(--radius-container)] border border-border bg-card">
          {[
            { label: 'Total', value: contacts.length, active: contacts.length > 0 },
            { label: 'Clients', value: clientCount, active: clientCount > 0 },
            { label: 'Leads', value: leadCount, active: leadCount > 0 },
            { label: 'Partners', value: partnerCount, active: partnerCount > 0 },
          ].map((stat, i, arr) => (
            <React.Fragment key={stat.label}>
              <div className="flex flex-1 flex-col items-center gap-1 px-3 py-3">
                <span className="text-[12px] font-medium tracking-wide text-muted-foreground">{stat.label}</span>
                <span className={`text-base font-semibold tabular-nums ${stat.active ? 'text-foreground' : 'text-muted-foreground/50'}`}>
                  {stat.value}
                </span>
              </div>
              {i < arr.length - 1 && <Separator orientation="vertical" className="self-stretch" />}
            </React.Fragment>
          ))}
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
            <SelectTrigger size="sm" className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="az">A &rarr; Z</SelectItem>
              <SelectItem value="za">Z &rarr; A</SelectItem>
              <SelectItem value="recent">Recent</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Grouped Contacts */}
        {filtered.length === 0 ? (
          <Empty className="py-8">
            <EmptyHeader>
              <EmptyTitle>No matches</EmptyTitle>
              <EmptyDescription>No contacts matching &ldquo;{search}&rdquo;</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="flex flex-col gap-3">
            {CONTACT_TYPE_GROUPS.map((group) => {
              const groupContacts = filtered.filter(
                (c) => (c.type ?? 'client') === group.key,
              )
              if (groupContacts.length === 0) return null
              return (
                <ContactGroup
                  key={group.key}
                  group={group}
                  contacts={groupContacts}
                  onOpenContact={(id) => setSelectedContactId(id)}
                />
              )
            })}
            {/* Ungrouped contacts (types not in CONTACT_TYPE_GROUPS) */}
            {(() => {
              const knownTypes = new Set(CONTACT_TYPE_GROUPS.map((g) => g.key))
              const ungrouped = filtered.filter(
                (c) => !knownTypes.has(c.type ?? 'client'),
              )
              if (ungrouped.length === 0) return null
              return (
                <ContactGroup
                  group={{ key: 'other', label: 'Other', icon: IconUsers }}
                  contacts={ungrouped}
                  onOpenContact={(id) => setSelectedContactId(id)}
                />
              )
            })()}
          </div>
        )}
      </div>
    </ContactsPageTooltip>
  )
}

// Contact Group (collapsible section by type)

function ContactGroup({
  group,
  contacts,
  onOpenContact,
}: {
  group: { key: string; label: string; icon: React.ElementType }
  contacts: Contact[]
  onOpenContact: (id: string) => void
}) {
  const [open, setOpen] = useState(true)
  const Icon = group.icon

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="flex w-full items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5 text-base font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
          <Icon size={15} className="shrink-0" />
          <span>{group.label}</span>
          <Badge variant="secondary" className="ml-0.5 text-[12px] px-1.5 py-0 tabular-nums">
            {contacts.length}
          </Badge>
          <IconChevronDown
            size={14}
            className={`ml-auto shrink-0 transition-transform duration-200 ${open ? '' : '-rotate-90'}`}
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="divide-y divide-border rounded-[var(--radius-container)] border border-border bg-card mt-1.5">
          {contacts.map((contact, index) => (
            <ContactRow
              key={String(contact.id ?? `${contact.name ?? 'contact'}-${index}`)}
              contact={contact}
              onOpen={() => {
                if (contact.id != null) onOpenContact(String(contact.id))
              }}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

// Contact Row (replaces ContactCard)

function ContactRow({ contact, onOpen }: { contact: Contact; onOpen: () => void }) {
  const email = contact.email ?? contact.emails?.[0]
  const phone = contact.phone ?? contact.phones?.[0]
  const contactType = contact.type ?? 'client'
  const rawTags: string[] = contact.tags ??
    ((contact.profile_data as Record<string, unknown>)?.tags as string[] ?? [])
  // Filter out the contact type from tags — it's already shown as a badge
  const knownTypes = new Set(['client', 'lead', 'partner', 'vendor', 'business', 'other'])
  const tags = rawTags.filter(t => !knownTypes.has(t.toLowerCase()))
  const canOpen = contact.id != null

  const initials = (contact.name || 'U')
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const badgeVariant = CONTACT_TYPE_VARIANT[contactType] || 'outline'

  return (
    <div
      className="flex items-center gap-3.5 px-3 py-2.5 cursor-pointer transition-colors hover:bg-secondary"
      onClick={canOpen ? onOpen : undefined}
      role={canOpen ? 'button' : undefined}
      tabIndex={canOpen ? 0 : undefined}
      aria-label={canOpen ? `Open details for ${contact.name ?? 'contact'}` : `${contact.name ?? 'Contact'} has no detail view`}
      onKeyDown={(e) => { if (canOpen && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen() } }}
    >
      <Avatar size="lg">
        {contact.avatar_url && <AvatarImage src={contact.avatar_url} alt={contact.name ?? 'Contact'} />}
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-base font-medium text-foreground truncate">
            {contact.name ?? 'Unnamed contact'}
          </span>
          <Badge variant={badgeVariant} className="capitalize shrink-0 text-[12px]">
            {contactType}
          </Badge>
        </div>

        <div className="flex items-center gap-3 text-[12px] text-muted-foreground flex-wrap">
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
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 shrink-0">
          {tags.slice(0, 3).map(tag => (
            <Badge key={tag} variant="secondary" className="text-[12px] px-1.5 py-0">
              {tag}
            </Badge>
          ))}
          {tags.length > 3 && (
            <Badge variant="secondary" className="text-[12px] px-1.5 py-0">
              +{tags.length - 3}
            </Badge>
          )}
        </div>
      )}
    </div>
  )
}

export default React.memo(ContactsTab)
