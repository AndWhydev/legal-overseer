'use client';

import React, { useEffect, useState } from 'react';
import { TabSkeleton } from './tab-skeleton';
import { TabShell } from '@/components/ui/tab-shell';
import { TabHeader } from '@/components/ui/tab-header';
import { SectionCard } from '@/components/ui/section-card';
import { EmptyState } from '@/components/ui/empty-state';
import { Users, UserPlus, Search, ChevronRight, Mail, Phone } from 'lucide-react';

type Contact = {
  id?: string | number;
  name?: string;
  email?: string;
  phone?: string;
  emails?: string[];
  phones?: string[];
};

function normalizeContacts(payload: unknown): Contact[] {
  if (Array.isArray(payload)) return payload as Contact[];
  if (payload && typeof payload === 'object') {
    const maybeContacts = (payload as { contacts?: unknown }).contacts;
    if (Array.isArray(maybeContacts)) return maybeContacts as Contact[];
  }
  return [];
}

function ContactsTab() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'az' | 'za' | 'recent'>('az');

  useEffect(() => {
    let mounted = true;

    fetch('/api/contacts')
      .then(async (response) => {
        try {
          return await response.json();
        } catch {
          return null;
        }
      })
      .then((data) => {
        if (!mounted) return;
        setContacts(normalizeContacts(data));
      })
      .catch(() => {
        if (!mounted) return;
        setContacts([]);
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  if (loading) return <TabSkeleton />;

  const filtered = contacts
    .filter(c => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        c.name?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.phone?.includes(q)
      );
    })
    .sort((a, b) => {
      if (sort === 'za') return (b.name || '').localeCompare(a.name || '');
      return (a.name || '').localeCompare(b.name || '');
    });

  return (
    <TabShell>
      <TabHeader
        icon={<Users size={22} />}
        iconColor="var(--bb-blue)"
        title="Contacts"
        subtitle={`${contacts.length} contacts`}
        actions={[
          <button
            key="add"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-white"
            style={{ backgroundColor: 'var(--bb-orange)' }}
          >
            <UserPlus size={14} />
            Add Contact
          </button>
        ]}
      />

      {/* Search + Sort */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }} />
          <input
            type="text"
            placeholder="Search contacts..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full rounded-lg py-2 pl-9 pr-3 text-sm border"
            style={{
              background: 'var(--bb-surface)',
              borderColor: 'rgba(255,255,255,0.04)',
              color: 'var(--text-primary)',
            }}
          />
        </div>
        <select
          value={sort}
          onChange={e => setSort(e.target.value as 'az' | 'za' | 'recent')}
          className="rounded-lg px-3 py-2 text-xs border"
          style={{
            background: 'var(--bb-surface)',
            borderColor: 'rgba(255,255,255,0.04)',
            color: 'var(--text-primary)',
          }}
        >
          <option value="az">A → Z</option>
          <option value="za">Z → A</option>
          <option value="recent">Recent</option>
        </select>
      </div>

      {/* Contact Cards */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<UserPlus size={40} />}
          title="No contacts yet"
          description={search ? `No contacts matching "${search}"` : "Import or add your first contact to get started."}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((contact, index) => {
            const email = contact.email ?? contact.emails?.[0];
            const phone = contact.phone ?? contact.phones?.[0];
            const key = String(contact.id ?? `${contact.name ?? 'contact'}-${index}`);
            const initials = (contact.name || 'U')
              .split(' ')
              .map(n => n[0])
              .join('')
              .toUpperCase()
              .slice(0, 2);

            return (
              <SectionCard key={key} className="group cursor-pointer transition-colors hover:border-white/10">
                <div className="flex items-start gap-3">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-full text-xs font-semibold flex-shrink-0"
                    style={{
                      backgroundColor: 'color-mix(in srgb, var(--bb-blue) 15%, transparent)',
                      color: 'var(--bb-blue)',
                    }}
                  >
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                      {contact.name ?? 'Unnamed contact'}
                    </p>
                    {email && (
                      <div className="flex items-center gap-1.5 mt-1">
                        <Mail size={11} style={{ color: 'var(--text-secondary)' }} />
                        <span className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                          {email}
                        </span>
                      </div>
                    )}
                    {phone && (
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Phone size={11} style={{ color: 'var(--text-secondary)' }} />
                        <span className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                          {phone}
                        </span>
                      </div>
                    )}
                  </div>
                  <ChevronRight size={16} className="opacity-0 group-hover:opacity-50 transition-opacity mt-1" style={{ color: 'var(--text-secondary)' }} />
                </div>
              </SectionCard>
            );
          })}
        </div>
      )}
    </TabShell>
  );
}

export default React.memo(ContactsTab);
