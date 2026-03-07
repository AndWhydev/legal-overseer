'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { UserPlus, Search, ChevronRight, Mail, Phone } from 'lucide-react'
import { SkeletonKanban } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { useDevOverrides } from '@/lib/dev/dev-overrides'
import { StatusPill, type StatusVariant } from '@/components/ui/status-pill'
import { logger } from '@/lib/core/logger';

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

// ---------------------------------------------------------------------------
// Seed data — activated via dev toolbar
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Type mapping
// ---------------------------------------------------------------------------

const CONTACT_TYPE_VARIANT: Record<string, StatusVariant> = {
  client: 'info',
  lead: 'orange',
  partner: 'purple',
  vendor: 'cyan',
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function ContactsTab() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<'az' | 'za' | 'recent'>('az')

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

  if (loading && !useSeeded) return <SkeletonKanban columns={3} />

  if (error && contacts.length === 0) {
    return (
      <div className="bb-tab-error">
        <p className="bb-tab-error__text">{error}</p>
        <button className="bb-btn bb-btn--ghost bb-btn--sm" onClick={() => { setError(null); setLoading(true); loadContacts().finally(() => setLoading(false)) }}>
          Retry
        </button>
      </div>
    )
  }

  // Stats
  const clientCount = contacts.filter(c => c.type === 'client').length
  const leadCount = contacts.filter(c => c.type === 'lead').length
  const partnerCount = contacts.filter(c => c.type === 'partner').length

  if (contacts.length === 0) {
    return (
      <EmptyState
        icon={<UserPlus size={40} />}
        title="No contacts yet"
        description="Import or add your first contact to get started."
      />
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {/* ── Inline Stats ── */}
      <div className="bb-contacts-stats">
        <StatPill value={contacts.length} label="total" active={contacts.length > 0} />
        <span className="bb-contacts-stats__sep" />
        <StatPill value={clientCount} label="clients" active={clientCount > 0} />
        <span className="bb-contacts-stats__sep" />
        <StatPill value={leadCount} label="leads" active={leadCount > 0} />
        <span className="bb-contacts-stats__sep" />
        <StatPill value={partnerCount} label="partners" />
      </div>

      {/* ── Search + Sort ── */}
      <div className="flex items-center gap-3">
        <div className="bb-contacts-search">
          <Search size={14} className="bb-contacts-search__icon" />
          <input
            type="text"
            placeholder="Search contacts..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bb-contacts-search__input"
          />
        </div>
        <select
          value={sort}
          onChange={e => setSort(e.target.value as 'az' | 'za' | 'recent')}
          className="bb-contacts-sort"
        >
          <option value="az">A → Z</option>
          <option value="za">Z → A</option>
          <option value="recent">Recent</option>
        </select>
      </div>

      {/* ── Contact Grid ── */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<UserPlus size={40} />}
          title="No matches"
          description={`No contacts matching "${search}"`}
        />
      ) : (
        <div className="bb-contacts-grid">
          {filtered.map((contact, index) => (
            <ContactCard key={String(contact.id ?? `${contact.name ?? 'contact'}-${index}`)} contact={contact} />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Stat Pill
// ---------------------------------------------------------------------------

function StatPill({ value, label, active }: { value: number | string; label: string; active?: boolean }) {
  return (
    <span className="bb-contacts-stats__item" data-active={active || undefined}>
      <span className="bb-contacts-stats__value">{value}</span>
      <span className="bb-contacts-stats__label">{label}</span>
    </span>
  )
}

// ---------------------------------------------------------------------------
// Contact Card
// ---------------------------------------------------------------------------

function ContactCard({ contact }: { contact: Contact }) {
  const email = contact.email ?? contact.emails?.[0]
  const phone = contact.phone ?? contact.phones?.[0]
  const contactType = contact.type ?? 'client'
  const tags: string[] = contact.tags ??
    ((contact.profile_data as Record<string, unknown>)?.tags as string[] ?? [])

  const initials = (contact.name || 'U')
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <article className="bb-contacts-card" data-type={contactType}>
      <div className="bb-contacts-card__avatar">{initials}</div>

      <div className="bb-contacts-card__body">
        <div>
          <span className="bb-contacts-card__name">{contact.name ?? 'Unnamed contact'}</span>
          <StatusPill
            variant={CONTACT_TYPE_VARIANT[contactType] ?? 'neutral'}
            label={contactType.charAt(0).toUpperCase() + contactType.slice(1)}
          />
        </div>

        <div className="bb-contacts-card__meta">
          {email && (
            <span className="bb-contacts-card__meta-item">
              <Mail size={11} />
              {email}
            </span>
          )}
          {phone && (
            <span className="bb-contacts-card__meta-item">
              <Phone size={11} />
              {phone}
            </span>
          )}
        </div>

        {tags.length > 0 && (
          <div className="bb-contacts-card__tags">
            {tags.slice(0, 3).map(tag => (
              <span key={tag} className="bb-contacts-card__tag">{tag}</span>
            ))}
            {tags.length > 3 && (
              <span className="bb-contacts-card__tag">+{tags.length - 3}</span>
            )}
          </div>
        )}
      </div>

      <ChevronRight size={16} className="bb-contacts-card__chevron" />
    </article>
  )
}

export default React.memo(ContactsTab)
