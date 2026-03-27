'use client'

import { useState, useEffect, useCallback } from 'react'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'

interface PortalAccessRow {
  id: string
  email: string
  status: 'invited' | 'active' | 'revoked'
  role: string
  invited_at: string
  last_login_at: string | null
  contacts?: { name: string; emails: string[] } | null
}

interface BrandingData {
  company_name: string
  logo_url: string
  primary_color: string
  accent_color: string
  background_color: string
  welcome_message: string
  support_email: string
}

interface Contact {
  id: string
  name: string
  emails: string[]
}

export function PortalManagement() {
  const [tab, setTab] = useState<'access' | 'branding'>('access')
  const [accessList, setAccessList] = useState<PortalAccessRow[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [branding, setBranding] = useState<BrandingData>({
    company_name: '',
    logo_url: '',
    primary_color: '#2563EB',
    accent_color: '#3B82F6',
    background_color: '#FAFAFA',
    welcome_message: '',
    support_email: '',
  })
  const [loading, setLoading] = useState(true)
  const [inviteForm, setInviteForm] = useState({ contact_id: '', email: '' })
  const [inviting, setInviting] = useState(false)
  const [savingBranding, setSavingBranding] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [accessRes, contactsRes, brandingRes] = await Promise.all([
        fetch('/api/portal/invite'),
        fetch('/api/contacts'),
        fetch('/api/portal/branding'),
      ])

      if (accessRes.ok) {
        const data = await accessRes.json()
        setAccessList(data.access ?? [])
      }
      if (contactsRes.ok) {
        const data = await contactsRes.json()
        setContacts(data.contacts ?? [])
      }
      if (brandingRes.ok) {
        const data = await brandingRes.json()
        if (data.branding) {
          setBranding({
            company_name: data.branding.company_name ?? '',
            logo_url: data.branding.logo_url ?? '',
            primary_color: data.branding.primary_color ?? '#2563EB',
            accent_color: data.branding.accent_color ?? '#3B82F6',
            background_color: data.branding.background_color ?? '#FAFAFA',
            welcome_message: data.branding.welcome_message ?? '',
            support_email: data.branding.support_email ?? '',
          })
        }
      }
    } catch {
      // Handle error
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteForm.contact_id || !inviteForm.email) return

    setInviting(true)
    try {
      const res = await fetch('/api/portal/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inviteForm),
      })

      if (res.ok) {
        setInviteForm({ contact_id: '', email: '' })
        fetchData()
      }
    } catch {
      // Handle error
    } finally {
      setInviting(false)
    }
  }

  const handleRevoke = async (accessId: string) => {
    try {
      await fetch('/api/portal/invite', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_id: accessId }),
      })
      fetchData()
    } catch {
      // Handle error
    }
  }

  const handleSaveBranding = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingBranding(true)
    try {
      await fetch('/api/portal/branding', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(branding),
      })
    } catch {
      // Handle error
    } finally {
      setSavingBranding(false)
    }
  }

  const selectedContact = contacts.find(c => c.id === inviteForm.contact_id)

  if (loading) {
    return (
      <div className="p-10 text-center text-muted-foreground">
        Loading portal settings...
      </div>
    )
  }

  return (
    <div>
      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6">
        {(['access', 'branding'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-lg text-sm capitalize transition-all ${
              tab === t
                ? 'font-medium bg-secondary text-foreground border border-border'
                : 'text-muted-foreground border border-transparent hover:text-foreground'
            }`}
          >
            {t === 'access' ? 'Client Access' : 'Portal Branding'}
          </button>
        ))}
      </div>

      {tab === 'access' && (
        <div>
          {/* Invite Form */}
          <form onSubmit={handleInvite} className="rounded-xl border border-border bg-card p-5 mb-6">
            <h3 className="text-base font-medium text-foreground mb-4">
              Invite Client to Portal
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">Contact</label>
                <Select value={inviteForm.contact_id} onValueChange={v => {
                    const contact = contacts.find(c => c.id === v)
                    setInviteForm({
                      contact_id: v,
                      email: contact?.emails?.[0] ?? '',
                    })
                  }}>
                  <SelectTrigger><SelectValue placeholder="Select contact..." /></SelectTrigger>
                  <SelectContent>
                    {contacts.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">Email</label>
                <input
                  type="email"
                  value={inviteForm.email}
                  onChange={e => setInviteForm(prev => ({ ...prev, email: e.target.value }))}
                  placeholder={selectedContact?.emails?.[0] ?? 'client@example.com'}
                  className="w-full px-4 py-3 rounded-lg border border-border bg-input text-foreground text-sm outline-none transition-colors focus:border-ring"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={inviting || !inviteForm.contact_id || !inviteForm.email}
                  className="w-full px-5 py-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium transition-opacity disabled:opacity-60 disabled:cursor-not-allowed hover:opacity-90"
                >
                  {inviting ? 'Sending...' : 'Send Invite'}
                </button>
              </div>
            </div>
          </form>

          {/* Access List */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-5 py-3 border-b border-border">
              <h3 className="text-base font-medium text-foreground">
                Portal Access ({accessList.length})
              </h3>
            </div>
            {accessList.length === 0 ? (
              <div className="px-5 py-8 text-center text-muted-foreground">
                No clients invited yet
              </div>
            ) : (
              accessList.map((access, i) => (
                <div
                  key={access.id}
                  className={`flex items-center justify-between px-5 py-3 ${
                    i < accessList.length - 1 ? 'border-b border-border' : ''
                  }`}
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {access.contacts?.name ?? access.email}
                    </p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {access.email}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge
                      variant={
                        access.status === 'active' ? 'default' :
                        access.status === 'invited' ? 'secondary' :
                        'destructive'
                      }
                      className="capitalize"
                    >
                      {access.status}
                    </Badge>
                    {access.last_login_at && (
                      <span className="text-sm text-muted-foreground">
                        Last login: {new Date(access.last_login_at).toLocaleDateString('en-AU')}
                      </span>
                    )}
                    {access.status !== 'revoked' && (
                      <button
                        onClick={() => handleRevoke(access.id)}
                        className="px-3 py-2 rounded-lg text-sm text-destructive border border-destructive/50 hover:bg-destructive/10 transition-colors"
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {tab === 'branding' && (
        <form onSubmit={handleSaveBranding} className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-3 border-b border-border">
            <h3 className="text-base font-medium text-foreground">
              Portal Branding
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Customize how your client portal looks
            </p>
          </div>

          <div className="p-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">Company Name</label>
                <input
                  type="text"
                  value={branding.company_name}
                  onChange={e => setBranding(prev => ({ ...prev, company_name: e.target.value }))}
                  placeholder="Your Agency Name"
                  className="w-full px-4 py-3 rounded-lg border border-border bg-input text-foreground text-sm outline-none transition-colors focus:border-ring"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">Logo URL</label>
                <input
                  type="url"
                  value={branding.logo_url}
                  onChange={e => setBranding(prev => ({ ...prev, logo_url: e.target.value }))}
                  placeholder="https://..."
                  className="w-full px-4 py-3 rounded-lg border border-border bg-input text-foreground text-sm outline-none transition-colors focus:border-ring"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">Primary Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={branding.primary_color}
                    onChange={e => setBranding(prev => ({ ...prev, primary_color: e.target.value }))}
                    className="w-10 h-9 border-none rounded-lg cursor-pointer"
                  />
                  <input
                    type="text"
                    value={branding.primary_color}
                    onChange={e => setBranding(prev => ({ ...prev, primary_color: e.target.value }))}
                    className="flex-1 px-4 py-3 rounded-lg border border-border bg-input text-foreground text-sm outline-none transition-colors focus:border-ring"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">Accent Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={branding.accent_color}
                    onChange={e => setBranding(prev => ({ ...prev, accent_color: e.target.value }))}
                    className="w-10 h-9 border-none rounded-lg cursor-pointer"
                  />
                  <input
                    type="text"
                    value={branding.accent_color}
                    onChange={e => setBranding(prev => ({ ...prev, accent_color: e.target.value }))}
                    className="flex-1 px-4 py-3 rounded-lg border border-border bg-input text-foreground text-sm outline-none transition-colors focus:border-ring"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">Support Email</label>
                <input
                  type="email"
                  value={branding.support_email}
                  onChange={e => setBranding(prev => ({ ...prev, support_email: e.target.value }))}
                  placeholder="support@agency.com"
                  className="w-full px-4 py-3 rounded-lg border border-border bg-input text-foreground text-sm outline-none transition-colors focus:border-ring"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">Background Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={branding.background_color}
                    onChange={e => setBranding(prev => ({ ...prev, background_color: e.target.value }))}
                    className="w-10 h-9 border-none rounded-lg cursor-pointer"
                  />
                  <input
                    type="text"
                    value={branding.background_color}
                    onChange={e => setBranding(prev => ({ ...prev, background_color: e.target.value }))}
                    className="flex-1 px-4 py-3 rounded-lg border border-border bg-input text-foreground text-sm outline-none transition-colors focus:border-ring"
                  />
                </div>
              </div>
            </div>

            <div className="mb-5">
              <label className="block text-sm font-medium text-muted-foreground mb-2">Welcome Message</label>
              <textarea
                value={branding.welcome_message}
                onChange={e => setBranding(prev => ({ ...prev, welcome_message: e.target.value }))}
                placeholder="Welcome to your project hub..."
                rows={3}
                className="w-full px-4 py-3 rounded-lg border border-border bg-input text-foreground text-sm outline-none transition-colors focus:border-ring resize-y min-h-20"
              />
            </div>

            {/* Preview */}
            <div className="mb-5">
              <label className="block text-sm font-medium text-muted-foreground mb-2">Preview</label>
              <div
                className="p-6 rounded-xl border border-border"
                style={{ background: branding.background_color || '#FAFAFA' }}
              >
                <div className="flex items-center gap-3 mb-4">
                  {branding.logo_url ? (
                    <img src={branding.logo_url} alt="" className="h-8 object-contain" />
                  ) : (
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-medium"
                      style={{ background: branding.primary_color }}
                    >
                      {(branding.company_name || 'A').charAt(0)}
                    </div>
                  )}
                  <span className="text-base font-medium text-gray-900">
                    {branding.company_name || 'Your Agency'}
                  </span>
                </div>
                <div className="flex gap-3">
                  {['Dashboard', 'Projects', 'Invoices'].map((item, idx) => (
                    <span
                      key={item}
                      className={`px-4 py-2 rounded-lg text-sm ${idx === 0 ? 'font-medium' : ''}`}
                      style={{
                        color: idx === 0 ? branding.primary_color : '#6B7280',
                        background: idx === 0 ? `${branding.primary_color}0D` : 'transparent',
                      }}
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={savingBranding}
              className="px-6 py-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium transition-opacity disabled:opacity-60 disabled:cursor-not-allowed hover:opacity-90"
            >
              {savingBranding ? 'Saving...' : 'Save Branding'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
