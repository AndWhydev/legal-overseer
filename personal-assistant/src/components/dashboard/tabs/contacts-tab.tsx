'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { SFPersonBadgePlus, SFMagnifyingglass, SFChevronRight, SFEnvelope, SFPhone } from 'sf-symbols-lib'
import { SkeletonKanban } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { useDevOverrides } from '@/lib/dev/dev-overrides'
import { StatusPill, type StatusVariant } from '@/components/ui/status-pill'
import { EntityDetailDrawer } from '@/components/dashboard/entity-detail-drawer'
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
        icon={<SFPersonBadgePlus size={40} />}
        title="No contacts yet"
        description="Import or add your first contact to get started."
      />
    )
  }

  return (
    <>
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

        {/* ── SFMagnifyingglass + Sort ── */}
        <div className="flex items-center gap-3">
          <div className="bb-contacts-search">
            <SFMagnifyingglass size={14} className="bb-contacts-search__icon" />
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
            icon={<SFPersonBadgePlus size={40} />}
            title="No matches"
            description={`No contacts matching "${search}"`}
          />
        ) : (
          <div className="bb-contacts-grid">
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

      <EntityDetailDrawer
        open={selectedContactId !== null}
        onClose={() => setSelectedContactId(null)}
        entityType="contact"
        entityId={selectedContactId ?? ''}
      />
    </>
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

function ContactCard({ contact, onOpen }: { contact: Contact; onOpen: () => void }) {
  const [hovered, setHovered] = useState(false)
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

  const typeColorMap: Record<string, string> = {
    client: '#3B82F6',
    lead: '#F59E0B',
    partner: '#A855F7',
    vendor: '#10B981',
  }

  const typeColor = typeColorMap[contactType] || '#6B7280'

  return (
    <button
      type="button"
      data-type={contactType}
      onClick={onOpen}
      disabled={!canOpen}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label={canOpen ? `Open details for ${contact.name ?? 'contact'}` : `${contact.name ?? 'Contact'} has no detail view`}
      aria-haspopup={canOpen ? 'dialog' : undefined}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        padding: '16px 20px',
        borderRadius: 16,
        background: 'rgba(15, 20, 30, 0.6)',
        backdropFilter: 'blur(20px) saturate(1.2)',
        WebkitBackdropFilter: 'blur(20px) saturate(1.2)',
        border: '1px solid rgba(255, 255, 255, 0.03)',
        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
        cursor: canOpen ? 'pointer' : 'default',
        textAlign: 'left' as const,
        transition: 'all 200ms ease-out',
        transform: hovered ? 'translateY(-1px)' : 'translateY(0)',
        backgroundColor: hovered ? 'rgba(20, 28, 40, 0.7)' : 'rgba(15, 20, 30, 0.6)',
      }}
    >
      {contact.avatar_url ? (
        <img
          src={contact.avatar_url}
          alt={contact.name ?? 'Contact'}
          style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            objectFit: 'cover',
            flexShrink: 0,
          }}
        />
      ) : (
        <div style={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 13,
          fontWeight: 600,
          flexShrink: 0,
          background: `rgba(15, 20, 30, 0.4)`,
          color: 'var(--text-secondary)',
        }}>
          {initials}
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <span style={{
            fontSize: 14,
            fontWeight: 500,
            color: 'var(--text-primary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {contact.name ?? 'Unnamed contact'}
          </span>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '2px 8px',
            borderRadius: 6,
            fontSize: 10,
            fontWeight: 600,
            textTransform: 'uppercase',
            background: `${typeColor}1F`,
            color: typeColor,
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}>
            {contactType.charAt(0).toUpperCase() + contactType.slice(1)}
          </span>
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginTop: '4px',
          flexWrap: 'wrap',
        }}>
          {email && (
            <span style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: 11,
              color: 'var(--text-dim)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              <SFEnvelope size={16} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
              {email}
            </span>
          )}
          {phone && (
            <span style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: 11,
              color: 'var(--text-dim)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              <SFPhone size={16} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
              {phone}
            </span>
          )}
        </div>

        {tags.length > 0 && (
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '4px',
            marginTop: '6px',
          }}>
            {tags.slice(0, 3).map(tag => (
              <span key={tag} style={{
                fontSize: 10,
                fontWeight: 500,
                padding: '2px 8px',
                borderRadius: 6,
                background: 'rgba(255, 255, 255, 0.04)',
                color: 'var(--text-dim)',
              }}>
                {tag}
              </span>
            ))}
            {tags.length > 3 && (
              <span style={{
                fontSize: 10,
                fontWeight: 500,
                padding: '2px 8px',
                borderRadius: 6,
                background: 'rgba(255, 255, 255, 0.04)',
                color: 'var(--text-dim)',
              }}>
                +{tags.length - 3}
              </span>
            )}
          </div>
        )}
      </div>

      <SFChevronRight size={16} style={{
        color: 'var(--text-dim)',
        opacity: hovered ? 0.5 : 0,
        transition: 'opacity 200ms ease-out',
        flexShrink: 0,
      }} />
    </button>
  )
}

export default React.memo(ContactsTab)
