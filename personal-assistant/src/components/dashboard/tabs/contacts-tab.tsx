'use client';

import React, { useEffect, useState } from 'react';
import { TabSkeleton } from './tab-skeleton';

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

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Contacts</h1>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {contacts.map((contact, index) => {
          const email = contact.email ?? contact.emails?.[0];
          const phone = contact.phone ?? contact.phones?.[0];
          const key = String(contact.id ?? `${contact.name ?? 'contact'}-${index}`);

          return (
            <div key={key} className="bb-glass-card rounded-xl p-4">
              <div className="font-medium">{contact.name ?? 'Unnamed contact'}</div>
              {email && <div className="text-sm text-muted-foreground">{email}</div>}
              {phone && <div className="text-sm text-muted-foreground">{phone}</div>}
            </div>
          );
        })}
        {contacts.length === 0 && <p className="text-muted-foreground">No contacts yet.</p>}
      </div>
    </div>
  );
}

export default React.memo(ContactsTab);
