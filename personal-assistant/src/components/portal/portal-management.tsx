'use client'

import { useState, useEffect, useCallback } from 'react'

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
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary, #94A3B8)' }}>
        Loading portal settings...
      </div>
    )
  }

  return (
    <div>
      {/* Tabs */}
      <div className="flex items-center gap-1" style={{ marginBottom: 24 }}>
        {(['access', 'branding'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '8px 20px',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: tab === t ? 500 : 400,
              background: tab === t ? 'rgba(255, 255, 255, 0.06)' : 'transparent',
              color: tab === t ? 'var(--text-primary, #F1F5F9)' : 'var(--text-secondary, #94A3B8)',
              border: tab === t ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid transparent',
              cursor: 'pointer',
              transition: 'all 150ms',
              textTransform: 'capitalize',
            }}
          >
            {t === 'access' ? 'Client Access' : 'Portal Branding'}
          </button>
        ))}
      </div>

      {tab === 'access' && (
        <div>
          {/* Invite Form */}
          <form onSubmit={handleInvite} style={{ ...glassCard, padding: 20, marginBottom: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-primary, #F1F5F9)', margin: '0 0 16px' }}>
              Invite Client to Portal
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label style={darkLabelStyle}>Contact</label>
                <select
                  value={inviteForm.contact_id}
                  onChange={e => {
                    const contact = contacts.find(c => c.id === e.target.value)
                    setInviteForm({
                      contact_id: e.target.value,
                      email: contact?.emails?.[0] ?? '',
                    })
                  }}
                  style={darkInputStyle}
                >
                  <option value="">Select contact...</option>
                  {contacts.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={darkLabelStyle}>Email</label>
                <input
                  type="email"
                  value={inviteForm.email}
                  onChange={e => setInviteForm(prev => ({ ...prev, email: e.target.value }))}
                  placeholder={selectedContact?.emails?.[0] ?? 'client@example.com'}
                  style={darkInputStyle}
                />
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={inviting || !inviteForm.contact_id || !inviteForm.email}
                  style={{
                    padding: '12px 20px',
                    borderRadius: 8,
                    background: 'var(--btn-primary-bg, #F1F5F9)',
                    color: 'var(--btn-primary-fg, #0a0f1a)',
                    fontSize: 14,
                    fontWeight: 500,
                    border: 'none',
                    cursor: inviting ? 'wait' : 'pointer',
                    opacity: inviting || !inviteForm.contact_id ? 0.6 : 1,
                    transition: 'opacity 150ms',
                    width: '100%',
                  }}
                >
                  {inviting ? 'Sending...' : 'Send Invite'}
                </button>
              </div>
            </div>
          </form>

          {/* Access List */}
          <div style={glassCard}>
            <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(255, 255, 255, 0.03)' }}>
              <h3 style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-primary, #F1F5F9)', margin: 0 }}>
                Portal Access ({accessList.length})
              </h3>
            </div>
            {accessList.length === 0 ? (
              <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text-dim, #475569)' }}>
                No clients invited yet
              </div>
            ) : (
              accessList.map((access, i) => (
                <div
                  key={access.id}
                  className="flex items-center justify-between"
                  style={{
                    padding: '12px 20px',
                    borderBottom: i < accessList.length - 1 ? '1px solid rgba(255, 255, 255, 0.03)' : 'none',
                  }}
                >
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary, #F1F5F9)', margin: 0 }}>
                      {access.contacts?.name ?? access.email}
                    </p>
                    <p style={{ fontSize: 14, color: 'var(--text-secondary, #94A3B8)', margin: '2px 0 0' }}>
                      {access.email}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 500,
                        padding: '4px 12px',
                        borderRadius: 8,
                        background: access.status === 'active' ? 'rgba(34, 197, 94, 0.12)' : access.status === 'invited' ? 'rgba(234, 179, 8, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                        color: access.status === 'active' ? '#22c55e' : access.status === 'invited' ? '#eab308' : '#ef4444',
                        textTransform: 'capitalize',
                      }}
                    >
                      {access.status}
                    </span>
                    {access.last_login_at && (
                      <span style={{ fontSize: 14, color: 'var(--text-dim, #475569)' }}>
                        Last login: {new Date(access.last_login_at).toLocaleDateString('en-AU')}
                      </span>
                    )}
                    {access.status !== 'revoked' && (
                      <button
                        onClick={() => handleRevoke(access.id)}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 8,
                          background: 'transparent',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          color: '#ef4444',
                          fontSize: 14,
                          cursor: 'pointer',
                          transition: 'all 150ms',
                        }}
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
        <form onSubmit={handleSaveBranding} style={glassCard}>
          <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(255, 255, 255, 0.03)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-primary, #F1F5F9)', margin: 0 }}>
              Portal Branding
            </h3>
            <p style={{ fontSize: 14, color: 'var(--text-secondary, #94A3B8)', margin: '4px 0 0' }}>
              Customize how your client portal looks
            </p>
          </div>

          <div style={{ padding: 20 }}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4" style={{ marginBottom: 20 }}>
              <div>
                <label style={darkLabelStyle}>Company Name</label>
                <input
                  type="text"
                  value={branding.company_name}
                  onChange={e => setBranding(prev => ({ ...prev, company_name: e.target.value }))}
                  placeholder="Your Agency Name"
                  style={darkInputStyle}
                />
              </div>
              <div>
                <label style={darkLabelStyle}>Logo URL</label>
                <input
                  type="url"
                  value={branding.logo_url}
                  onChange={e => setBranding(prev => ({ ...prev, logo_url: e.target.value }))}
                  placeholder="https://..."
                  style={darkInputStyle}
                />
              </div>
              <div>
                <label style={darkLabelStyle}>Primary Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={branding.primary_color}
                    onChange={e => setBranding(prev => ({ ...prev, primary_color: e.target.value }))}
                    style={{ width: 40, height: 36, border: 'none', borderRadius: 8, cursor: 'pointer' }}
                  />
                  <input
                    type="text"
                    value={branding.primary_color}
                    onChange={e => setBranding(prev => ({ ...prev, primary_color: e.target.value }))}
                    style={{ ...darkInputStyle, flex: 1 }}
                  />
                </div>
              </div>
              <div>
                <label style={darkLabelStyle}>Accent Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={branding.accent_color}
                    onChange={e => setBranding(prev => ({ ...prev, accent_color: e.target.value }))}
                    style={{ width: 40, height: 36, border: 'none', borderRadius: 8, cursor: 'pointer' }}
                  />
                  <input
                    type="text"
                    value={branding.accent_color}
                    onChange={e => setBranding(prev => ({ ...prev, accent_color: e.target.value }))}
                    style={{ ...darkInputStyle, flex: 1 }}
                  />
                </div>
              </div>
              <div>
                <label style={darkLabelStyle}>Support Email</label>
                <input
                  type="email"
                  value={branding.support_email}
                  onChange={e => setBranding(prev => ({ ...prev, support_email: e.target.value }))}
                  placeholder="support@agency.com"
                  style={darkInputStyle}
                />
              </div>
              <div>
                <label style={darkLabelStyle}>Background Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={branding.background_color}
                    onChange={e => setBranding(prev => ({ ...prev, background_color: e.target.value }))}
                    style={{ width: 40, height: 36, border: 'none', borderRadius: 8, cursor: 'pointer' }}
                  />
                  <input
                    type="text"
                    value={branding.background_color}
                    onChange={e => setBranding(prev => ({ ...prev, background_color: e.target.value }))}
                    style={{ ...darkInputStyle, flex: 1 }}
                  />
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={darkLabelStyle}>Welcome Message</label>
              <textarea
                value={branding.welcome_message}
                onChange={e => setBranding(prev => ({ ...prev, welcome_message: e.target.value }))}
                placeholder="Welcome to your project hub..."
                rows={3}
                style={{ ...darkInputStyle, resize: 'vertical', minHeight: 80 }}
              />
            </div>

            {/* Preview */}
            <div style={{ marginBottom: 20 }}>
              <label style={darkLabelStyle}>Preview</label>
              <div
                style={{
                  padding: 24,
                  borderRadius: 12,
                  background: branding.background_color || '#FAFAFA',
                  border: '1px solid var(--glass-border, rgba(255, 255, 255, 0.03))',
                }}
              >
                <div className="flex items-center gap-3" style={{ marginBottom: 16 }}>
                  {branding.logo_url ? (
                    <img src={branding.logo_url} alt="" style={{ height: 32, objectFit: 'contain' }} />
                  ) : (
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        background: branding.primary_color,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#FFFFFF',
                        fontSize: 14,
                        fontWeight: 500,
                      }}
                    >
                      {(branding.company_name || 'A').charAt(0)}
                    </div>
                  )}
                  <span style={{ fontSize: 16, fontWeight: 500, color: '#111827' }}>
                    {branding.company_name || 'Your Agency'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  {['Dashboard', 'Projects', 'Invoices'].map((item, idx) => (
                    <span
                      key={item}
                      style={{
                        padding: '8px 16px',
                        borderRadius: 8,
                        fontSize: 14,
                        color: idx === 0 ? branding.primary_color : '#6B7280',
                        background: idx === 0 ? `${branding.primary_color}0D` : 'transparent',
                        fontWeight: idx === 0 ? 500 : 400,
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
              style={{
                padding: '12px 24px',
                borderRadius: 8,
                background: 'var(--btn-primary-bg, #F1F5F9)',
                color: 'var(--btn-primary-fg, #0a0f1a)',
                fontSize: 14,
                fontWeight: 500,
                border: 'none',
                cursor: savingBranding ? 'wait' : 'pointer',
                opacity: savingBranding ? 0.6 : 1,
                transition: 'opacity 150ms',
              }}
            >
              {savingBranding ? 'Saving...' : 'Save Branding'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

const glassCard: React.CSSProperties = {
  borderRadius: 16,
  background: 'var(--bg-card-solid, rgba(15, 20, 30, 0.6))',
  backdropFilter: 'var(--glass-blur, blur(20px) saturate(1.2))',
  WebkitBackdropFilter: 'var(--glass-blur, blur(20px) saturate(1.2))',
  border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.03))',
  boxShadow: 'var(--card-inset, inset 0 1px 0 rgba(255, 255, 255, 0.05))',
  overflow: 'hidden',
}

const darkLabelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 14,
  fontWeight: 500,
  color: 'var(--text-secondary, #94A3B8)',
  marginBottom: 8,
}

const darkInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 16px',
  borderRadius: 8,
  border: '1px solid var(--glass-border, rgba(255, 255, 255, 0.03))',
  fontSize: 14,
  color: 'var(--text-primary, #F1F5F9)',
  background: 'var(--bg-input, rgba(13, 17, 23, 0.6))',
  outline: 'none',
  transition: 'border-color 150ms',
  fontFamily: 'inherit',
}
