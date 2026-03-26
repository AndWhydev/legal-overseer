'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useToast } from '@/components/ui/toast'
import type { InvoiceTemplate } from '@/lib/invoices/template-types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PRESET_SCHEMES = [
  { label: 'Ocean', primary: '#0EA5E9', accent: '#0284C7' },
  { label: 'Forest', primary: '#22C55E', accent: '#16A34A' },
  { label: 'Graphite', primary: '#334155', accent: '#1E293B' },
  { label: 'Violet', primary: '#8B5CF6', accent: '#7C3AED' },
  { label: 'Rose', primary: '#F43F5E', accent: '#E11D48' },
  { label: 'Slate', primary: '#64748B', accent: '#475569' },
]

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = hex.replace('#', '').match(/^([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!m) return null
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1]
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}

// ─── Live Preview ─────────────────────────────────────────────────────────────

function InvoicePreview({ template, orgName }: { template: InvoiceTemplate; orgName: string }) {
  const primary = template.primary_color ?? '#334155'
  const accent = template.accent_color ?? '#1E293B'
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.5)

  useEffect(() => {
    if (!wrapperRef.current) return
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const availW = entry.contentRect.width
        setScale(Math.min(availW / 595, 1))
      }
    })
    ro.observe(wrapperRef.current)
    return () => ro.disconnect()
  }, [])

  return (
    <div
      ref={wrapperRef}
      style={{
        width: '100%',
        padding: 16,
        height: Math.round(842 * scale) + 32,
        overflow: 'hidden',
        borderRadius: 16,
        background: 'var(--bg-secondary, rgba(0, 0, 0, 0.15))',
        transition: 'height 0.15s ease',
        position: 'relative',
      }}
    >
    <div
      style={{
        width: 595,
        height: 842,
        background: '#ffffff',
        borderRadius: 8,
        overflow: 'hidden',
        boxShadow: '0 4px 24px rgba(0, 0, 0, 0.3), 0 1px 4px rgba(0, 0, 0, 0.2)',
        transformOrigin: 'top left',
        transform: `scale(${scale})`,
        fontSize: 14,
        color: '#1e293b',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        position: 'absolute',
        top: 0,
        left: `calc(50% - ${595 * scale / 2}px)`,
      }}
    >
      {/* Invoice header */}
      <div style={{ background: primary, padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          {template.logo_base64 ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={template.logo_base64} alt="Logo" style={{ height: 32, objectFit: 'contain', maxWidth: 120 }} />
          ) : (
            <span style={{ fontWeight: 500, fontSize: 16, color: '#fff' }}>{orgName}</span>
          )}
        </div>
        <div style={{ textAlign: 'right', color: 'rgba(255,255,255,0.85)' }}>
          <div style={{ fontWeight: 500, fontSize: 16, color: '#fff' }}>INVOICE</div>
          <div style={{ fontSize: 14, marginTop: 2 }}>#INV-0042</div>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '20px 24px', flex: 1 }}>
        {/* Addresses */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>From</div>
            <div style={{ fontWeight: 500 }}>{orgName}</div>
            <div style={{ color: '#64748b', lineHeight: 1.5 }}>{(template.address_lines?.length ? template.address_lines : ['123 Agency St', 'Sydney NSW 2000']).join(', ')}</div>
            {template.abn && <div style={{ color: '#94a3b8', fontSize: 14, marginTop: 2 }}>ABN: {template.abn}</div>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Bill to</div>
            <div style={{ fontWeight: 500 }}>Acme Corp</div>
            <div style={{ color: '#64748b', lineHeight: 1.5 }}>456 Client Ave<br />Melbourne VIC 3000</div>
          </div>
        </div>

        {/* Line items */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${primary}` }}>
              <th style={{ textAlign: 'left', padding: '8px 0', fontSize: 14, fontWeight: 500, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Description</th>
              <th style={{ textAlign: 'right', padding: '8px 0', fontSize: 14, fontWeight: 500, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Qty</th>
              <th style={{ textAlign: 'right', padding: '8px 0', fontSize: 14, fontWeight: 500, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Unit</th>
              <th style={{ textAlign: 'right', padding: '8px 0', fontSize: 14, fontWeight: 500, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {[
              { desc: 'Website redesign', qty: 1, unit: '$3,500.00', total: '$3,500.00' },
              { desc: 'SEO optimisation', qty: 3, unit: '$450.00', total: '$1,350.00' },
              { desc: 'Monthly retainer', qty: 1, unit: '$800.00', total: '$800.00' },
            ].map((row, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '8px 0', color: '#334155' }}>{row.desc}</td>
                <td style={{ padding: '8px 0', textAlign: 'right', color: '#64748b' }}>{row.qty}</td>
                <td style={{ padding: '8px 0', textAlign: 'right', color: '#64748b' }}>{row.unit}</td>
                <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 500 }}>{row.total}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ minWidth: 160 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', color: '#64748b' }}>
              <span>Subtotal</span><span>$5,650.00</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', color: '#64748b' }}>
              <span>GST (10%)</span><span>$565.00</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: `2px solid ${primary}`, marginTop: 4, fontWeight: 500, color: primary }}>
              <span>Total</span><span>$6,215.00</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0', padding: '12px 24px' }}>
        {template.footer_text ? (
          <p style={{ margin: 0, color: '#64748b', fontSize: 14, lineHeight: 1.5 }}>{template.footer_text}</p>
        ) : (
          <p style={{ margin: 0, color: '#94a3b8', fontSize: 14, fontStyle: 'italic' }}>Footer text will appear here.</p>
        )}
        {template.terms && (
          <p style={{ margin: '8px 0 0', color: '#94a3b8', fontSize: 14, lineHeight: 1.4 }}>
            <strong style={{ color: '#64748b' }}>Terms: </strong>
            {template.terms.slice(0, 120)}{template.terms.length > 120 ? '…' : ''}
          </p>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <div style={{ width: 40, height: 3, borderRadius: 8, background: accent }} />
        </div>
      </div>
    </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function InvoiceTemplateEditor() {
  const { toast } = useToast()

  const [template, setTemplate] = useState<InvoiceTemplate>({
    primary_color: '#334155',
    accent_color: '#1E293B',
    company_name: '',
    abn: '',
    gst_registered: false,
    address_lines: [],
    bank_details: '',
    footer_text: '',
    terms: '',
  })
  const [orgName, setOrgName] = useState('Your Company')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Load existing template
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/invoices/template')
        if (res.ok) {
          const data = await res.json() as { template?: InvoiceTemplate }
          if (data.template && Object.keys(data.template).length > 0) {
            setTemplate((prev) => ({ ...prev, ...data.template }))
            if (data.template.logo_base64) setLogoPreview(data.template.logo_base64)
          }
        }
      } catch {
        // non-critical
      } finally {
        setLoading(false)
      }
    }

    // Also load org name from profile
    async function loadProfile() {
      try {
        const res = await fetch('/api/settings')
        if (res.ok) {
          const data = await res.json() as { profile?: { displayName?: string } }
          if (data.profile?.displayName) setOrgName(data.profile.displayName)
        }
      } catch {
        // non-critical
      }
    }

    load()
    loadProfile()
  }, [])

  const handleLogoUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast('error', 'Please upload an image file')
      return
    }
    if (file.size > 500_000) {
      toast('error', 'Logo must be under 500 KB')
      return
    }
    const reader = new FileReader()
    reader.onload = (ev) => {
      const base64 = ev.target?.result as string
      setLogoPreview(base64)
      setTemplate((prev) => ({ ...prev, logo_base64: base64 }))
    }
    reader.readAsDataURL(file)
  }, [toast])

  const removeLogo = useCallback(() => {
    setLogoPreview(null)
    setTemplate((prev) => ({ ...prev, logo_base64: undefined }))
    if (fileRef.current) fileRef.current.value = ''
  }, [])

  const applyPreset = useCallback((primary: string, accent: string) => {
    setTemplate((prev) => ({ ...prev, primary_color: primary, accent_color: accent }))
  }, [])

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/invoices/template', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(template),
      })
      if (!res.ok) {
        const err = await res.json() as { error?: string }
        throw new Error(err.error ?? 'Save failed')
      }
      toast('success', 'Invoice template saved')
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to save template')
    } finally {
      setSaving(false)
    }
  }, [template, toast])

  const cardStyle: React.CSSProperties = {
    background: 'var(--bg-card-solid, rgba(15, 20, 30, 0.6))',
    backdropFilter: 'var(--glass-blur, blur(20px) saturate(1.2))',
    WebkitBackdropFilter: 'var(--glass-blur, blur(20px) saturate(1.2))',
    boxShadow: 'var(--card-shadow, 0 2px 8px rgba(0,0,0,0.3)), var(--card-inset, inset 0 1px 0 rgba(255,255,255,0.06))',
    border: 'none',
    borderRadius: 16,
    padding: '24px',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 14,
    fontWeight: 500,
    color: 'var(--text-secondary, #94A3B8)',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    marginBottom: 8,
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'var(--bg-input, rgba(13, 17, 23, 0.6))',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8,
    padding: '12px 16px',
    fontSize: 14,
    color: '#E2E8F0',
    outline: 'none',
    boxSizing: 'border-box',
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
        <div style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.1)', borderTopColor: '#E2E8F0', animation: 'spin 0.8s linear infinite' }} />
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }}>
      {/* ── Left: Editor ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Logo upload */}
        <div style={cardStyle}>
          <label style={labelStyle}>Logo</label>
          {logoPreview ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoPreview}
                alt="Logo preview"
                style={{ height: 48, objectFit: 'contain', maxWidth: 160, background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: 4 }}
              />
              <button
                onClick={removeLogo}
                style={{
                  fontSize: 14,
                  color: '#EF4444',
                  background: 'rgba(239,68,68,0.1)',
                  border: '1px solid rgba(239,68,68,0.2)',
                  borderRadius: 8,
                  padding: '4px 12px',
                  cursor: 'pointer',
                }}
              >
                Remove
              </button>
            </div>
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              style={{
                width: '100%',
                padding: '20px',
                border: '1px dashed rgba(255,255,255,0.03)',
                borderRadius: 8,
                background: 'rgba(255,255,255,0.02)',
                color: '#64748B',
                fontSize: 14,
                cursor: 'pointer',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 16, marginBottom: 8 }}>+</div>
              Click to upload logo
              <div style={{ fontSize: 14, marginTop: 4, color: '#475569' }}>PNG, JPG, SVG · max 500 KB</div>
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={handleLogoUpload}
            style={{ display: 'none' }}
          />
        </div>

        {/* Business details */}
        <div style={cardStyle}>
          <label style={labelStyle}>Business Details</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ ...labelStyle, marginBottom: 8 }}>Company Name</label>
              <input
                type="text"
                value={template.company_name ?? ''}
                onChange={(e) => setTemplate((prev) => ({ ...prev, company_name: e.target.value }))}
                style={inputStyle}
                placeholder="e.g. Tor Kay Consulting"
                maxLength={200}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ ...labelStyle, marginBottom: 8 }}>ABN</label>
                <input
                  type="text"
                  value={template.abn ?? ''}
                  onChange={(e) => setTemplate((prev) => ({ ...prev, abn: e.target.value }))}
                  style={inputStyle}
                  placeholder="e.g. 12 345 678 901"
                  maxLength={30}
                />
              </div>
              <div>
                <label style={{ ...labelStyle, marginBottom: 8 }}>GST Registered</label>
                <div style={{ display: 'flex', alignItems: 'center', height: 40 }}>
                  <button
                    role="switch"
                    aria-checked={template.gst_registered}
                    aria-label="GST Registered"
                    onClick={() => setTemplate((prev) => ({ ...prev, gst_registered: !prev.gst_registered }))}
                    style={{
                      position: 'relative',
                      display: 'inline-flex',
                      height: 24,
                      width: 44,
                      flexShrink: 0,
                      cursor: 'pointer',
                      borderRadius: 12,
                      transition: 'background-color 200ms ease',
                      border: 'none',
                      background: template.gst_registered ? '#22C55E' : 'var(--toggle-off-bg, rgba(255, 255, 255, 0.1))',
                      outline: 'none',
                    }}
                    onFocus={e => { e.currentTarget.style.boxShadow = '0 0 0 2px rgba(34, 197, 94, 0.3)' }}
                    onBlur={e => { e.currentTarget.style.boxShadow = 'none' }}
                  >
                    <span
                      style={{
                        pointerEvents: 'none',
                        display: 'inline-block',
                        height: 20,
                        width: 20,
                        borderRadius: 9999,
                        background: '#FFFFFF',
                        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.3)',
                        transition: 'transform 200ms ease',
                        transform: template.gst_registered ? 'translateX(20px)' : 'translateX(2px)',
                        marginTop: 2,
                      }}
                    />
                  </button>
                </div>
              </div>
            </div>
            <div>
              <label style={{ ...labelStyle, marginBottom: 8 }}>Address</label>
              <input
                type="text"
                value={(template.address_lines ?? []).join(', ')}
                onChange={(e) => setTemplate((prev) => ({
                  ...prev,
                  address_lines: e.target.value.split(',').map(l => l.trim()).filter(Boolean),
                }))}
                style={inputStyle}
                placeholder="e.g. 123 Agency St, Sydney NSW 2000"
              />
              <p style={{ fontSize: 14, color: '#475569', margin: '4px 0 0' }}>Separate lines with commas</p>
            </div>
            <div>
              <label style={{ ...labelStyle, marginBottom: 8 }}>Bank Details</label>
              <input
                type="text"
                value={template.bank_details ?? ''}
                onChange={(e) => setTemplate((prev) => ({ ...prev, bank_details: e.target.value }))}
                style={inputStyle}
                placeholder="e.g. BSB: 062-000, Account: 1234 5678, Name: Tor Kay"
                maxLength={500}
              />
            </div>
          </div>
        </div>

        {/* Color scheme */}
        <div style={cardStyle}>
          <label style={labelStyle}>Color Scheme</label>

          {/* Preset chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {PRESET_SCHEMES.map((preset) => {
              const active = template.primary_color === preset.primary
              return (
                <button
                  key={preset.label}
                  onClick={() => applyPreset(preset.primary, preset.accent)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 12px',
                    borderRadius: 20,
                    border: active ? `2px solid ${preset.primary}` : '1px solid rgba(255,255,255,0.03)',
                    background: active ? `${preset.primary}22` : 'rgba(255,255,255,0.04)',
                    cursor: 'pointer',
                    fontSize: 14,
                    fontWeight: active ? 500 : 400,
                    color: active ? preset.primary : '#94A3B8',
                    transition: 'all 0.15s',
                  }}
                >
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: preset.primary, flexShrink: 0 }} />
                  {preset.label}
                </button>
              )
            })}
          </div>

          {/* Custom color pickers */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ ...labelStyle, marginBottom: 8 }}>Primary</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 40, height: 40, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--glass-border, rgba(255,255,255,0.03))', flexShrink: 0 }}>
                  <input
                    type="color"
                    value={template.primary_color ?? '#334155'}
                    onChange={(e) => setTemplate((prev) => ({ ...prev, primary_color: e.target.value }))}
                    style={{ width: '100%', height: '100%', padding: 0, border: 'none', cursor: 'pointer' }}
                  />
                </div>
                <input
                  type="text"
                  value={template.primary_color ?? '#334155'}
                  onChange={(e) => setTemplate((prev) => ({ ...prev, primary_color: e.target.value }))}
                  style={{ ...inputStyle, width: 'auto', flex: 1, fontFamily: 'monospace', fontSize: 14, height: 40, padding: '0 16px' }}
                  placeholder="#334155"
                />
              </div>
            </div>
            <div>
              <label style={{ ...labelStyle, marginBottom: 8 }}>Accent</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 40, height: 40, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--glass-border, rgba(255,255,255,0.03))', flexShrink: 0 }}>
                  <input
                    type="color"
                    value={template.accent_color ?? '#1E293B'}
                    onChange={(e) => setTemplate((prev) => ({ ...prev, accent_color: e.target.value }))}
                    style={{ width: '100%', height: '100%', padding: 0, border: 'none', cursor: 'pointer' }}
                  />
                </div>
                <input
                  type="text"
                  value={template.accent_color ?? '#1E293B'}
                  onChange={(e) => setTemplate((prev) => ({ ...prev, accent_color: e.target.value }))}
                  style={{ ...inputStyle, width: 'auto', flex: 1, fontFamily: 'monospace', fontSize: 14, height: 40, padding: '0 16px' }}
                  placeholder="#1E293B"
                />
              </div>
            </div>
          </div>

          {/* Color swatch preview */}
          {(() => {
            const rgb = hexToRgb(template.primary_color ?? '#334155')
            return (
              <div
                style={{
                  marginTop: 12, height: 6, borderRadius: 8,
                  background: rgb
                    ? `linear-gradient(90deg, ${template.primary_color} 0%, ${template.accent_color ?? '#1E293B'} 100%)`
                    : '#334155',
                }}
              />
            )
          })()}
        </div>

        {/* Footer text */}
        <div style={cardStyle}>
          <label style={labelStyle}>Footer Text</label>
          <input
            type="text"
            value={template.footer_text ?? ''}
            onChange={(e) => setTemplate((prev) => ({ ...prev, footer_text: e.target.value }))}
            style={inputStyle}
            placeholder="e.g. Payment due within 14 days. BSB: 062-000 Account: 1234 5678"
            maxLength={500}
          />
          <p style={{ fontSize: 14, color: '#475569', margin: '8px 0 0' }}>
            {(template.footer_text ?? '').length}/500 characters
          </p>
        </div>

        {/* Terms */}
        <div style={cardStyle}>
          <label style={labelStyle}>Terms & Conditions</label>
          <textarea
            value={template.terms ?? ''}
            onChange={(e) => setTemplate((prev) => ({ ...prev, terms: e.target.value }))}
            style={{
              ...inputStyle,
              minHeight: 100,
              resize: 'vertical',
              fontFamily: 'inherit',
              lineHeight: 1.5,
            }}
            placeholder="e.g. Payment is due within 14 days of invoice date. Late payments incur a 2% monthly fee..."
            maxLength={5000}
          />
          <p style={{ fontSize: 14, color: '#475569', margin: '8px 0 0' }}>
            {(template.terms ?? '').length}/5,000 characters
          </p>
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            width: '100%',
            height: 40,
            padding: '0 16px',
            borderRadius: 8,
            border: 'none',
            background: saving ? 'rgba(241,245,249,0.5)' : '#F1F5F9',
            color: 'var(--btn-primary-fg, #0a0f1a)',
            fontWeight: 500,
            fontSize: 14,
            cursor: saving ? 'not-allowed' : 'pointer',
            transition: 'background 0.15s',
          }}
        >
          {saving ? 'Saving…' : 'Save Template'}
        </button>
      </div>

      {/* ── Right: Live Preview ── */}
      <div style={{ position: 'sticky', top: 24, alignSelf: 'start' }}>
        <InvoicePreview template={template} orgName={template.company_name?.trim() || orgName} />
      </div>
    </div>
  )
}
