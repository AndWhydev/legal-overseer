'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useToast } from '@/components/ui/toast'

// ─── Types ────────────────────────────────────────────────────────────────────

interface InvoiceTemplate {
  logo_base64?: string
  primary_color?: string
  accent_color?: string
  footer_text?: string
  terms?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PRESET_SCHEMES = [
  { label: 'Ocean', primary: '#0EA5E9', accent: '#0284C7' },
  { label: 'Forest', primary: '#22C55E', accent: '#16A34A' },
  { label: 'Ember', primary: '#FF5A1F', accent: '#EA580C' },
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
  const primary = template.primary_color ?? '#FF5A1F'
  const accent = template.accent_color ?? '#EA580C'

  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 8,
        overflow: 'hidden',
        boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
        fontSize: 11,
        color: '#1e293b',
        minHeight: 360,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Invoice header */}
      <div style={{ background: primary, padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          {template.logo_base64 ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={template.logo_base64} alt="Logo" style={{ height: 32, objectFit: 'contain', maxWidth: 120 }} />
          ) : (
            <span style={{ fontWeight: 700, fontSize: 16, color: '#fff' }}>{orgName}</span>
          )}
        </div>
        <div style={{ textAlign: 'right', color: 'rgba(255,255,255,0.85)' }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: '#fff' }}>INVOICE</div>
          <div style={{ fontSize: 10, marginTop: 2 }}>#INV-0042</div>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '20px 24px', flex: 1 }}>
        {/* Addresses */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>From</div>
            <div style={{ fontWeight: 600 }}>{orgName}</div>
            <div style={{ color: '#64748b', lineHeight: 1.5 }}>123 Agency St<br />Sydney NSW 2000</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Bill to</div>
            <div style={{ fontWeight: 600 }}>Acme Corp</div>
            <div style={{ color: '#64748b', lineHeight: 1.5 }}>456 Client Ave<br />Melbourne VIC 3000</div>
          </div>
        </div>

        {/* Line items */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${primary}` }}>
              <th style={{ textAlign: 'left', padding: '6px 0', fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Description</th>
              <th style={{ textAlign: 'right', padding: '6px 0', fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Qty</th>
              <th style={{ textAlign: 'right', padding: '6px 0', fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Unit</th>
              <th style={{ textAlign: 'right', padding: '6px 0', fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {[
              { desc: 'Website redesign', qty: 1, unit: '$3,500.00', total: '$3,500.00' },
              { desc: 'SEO optimisation', qty: 3, unit: '$450.00', total: '$1,350.00' },
              { desc: 'Monthly retainer', qty: 1, unit: '$800.00', total: '$800.00' },
            ].map((row, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '7px 0', color: '#334155' }}>{row.desc}</td>
                <td style={{ padding: '7px 0', textAlign: 'right', color: '#64748b' }}>{row.qty}</td>
                <td style={{ padding: '7px 0', textAlign: 'right', color: '#64748b' }}>{row.unit}</td>
                <td style={{ padding: '7px 0', textAlign: 'right', fontWeight: 500 }}>{row.total}</td>
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
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: `2px solid ${primary}`, marginTop: 4, fontWeight: 700, color: primary }}>
              <span>Total</span><span>$6,215.00</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0', padding: '12px 24px' }}>
        {template.footer_text ? (
          <p style={{ margin: 0, color: '#64748b', fontSize: 10, lineHeight: 1.5 }}>{template.footer_text}</p>
        ) : (
          <p style={{ margin: 0, color: '#94a3b8', fontSize: 10, fontStyle: 'italic' }}>Footer text will appear here.</p>
        )}
        {template.terms && (
          <p style={{ margin: '8px 0 0', color: '#94a3b8', fontSize: 9, lineHeight: 1.4 }}>
            <strong style={{ color: '#64748b' }}>Terms: </strong>
            {template.terms.slice(0, 120)}{template.terms.length > 120 ? '…' : ''}
          </p>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <div style={{ width: 40, height: 3, borderRadius: 2, background: accent }} />
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function InvoiceTemplateEditor() {
  const { toast } = useToast()

  const [template, setTemplate] = useState<InvoiceTemplate>({
    primary_color: '#FF5A1F',
    accent_color: '#EA580C',
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
  }, [showToast])

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
      showToast(err instanceof Error ? err.message : 'Failed to save template', 'error')
    } finally {
      setSaving(false)
    }
  }, [template, showToast])

  const cardStyle: React.CSSProperties = {
    background: 'rgba(15, 20, 30, 0.5)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 12,
    padding: '24px',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 12,
    fontWeight: 600,
    color: '#94A3B8',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    marginBottom: 8,
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'rgba(13, 17, 23, 0.6)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8,
    padding: '10px 14px',
    fontSize: 14,
    color: '#E2E8F0',
    outline: 'none',
    boxSizing: 'border-box',
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
        <div style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid rgba(255,90,31,0.3)', borderTopColor: '#FF5A1F', animation: 'spin 0.8s linear infinite' }} />
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
                style={{ height: 48, objectFit: 'contain', maxWidth: 160, background: 'rgba(255,255,255,0.05)', borderRadius: 6, padding: 4 }}
              />
              <button
                onClick={removeLogo}
                style={{
                  fontSize: 12,
                  color: '#EF4444',
                  background: 'rgba(239,68,68,0.1)',
                  border: '1px solid rgba(239,68,68,0.2)',
                  borderRadius: 6,
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
                border: '1px dashed rgba(255,255,255,0.15)',
                borderRadius: 8,
                background: 'rgba(255,255,255,0.02)',
                color: '#64748B',
                fontSize: 13,
                cursor: 'pointer',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 22, marginBottom: 6 }}>+</div>
              Click to upload logo
              <div style={{ fontSize: 11, marginTop: 4, color: '#475569' }}>PNG, JPG, SVG · max 500 KB</div>
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
                    padding: '6px 12px',
                    borderRadius: 20,
                    border: active ? `2px solid ${preset.primary}` : '1px solid rgba(255,255,255,0.1)',
                    background: active ? `${preset.primary}22` : 'rgba(255,255,255,0.04)',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: active ? 600 : 400,
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
              <label style={{ ...labelStyle, marginBottom: 6 }}>Primary</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="color"
                  value={template.primary_color ?? '#FF5A1F'}
                  onChange={(e) => setTemplate((prev) => ({ ...prev, primary_color: e.target.value }))}
                  style={{ width: 36, height: 36, borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', cursor: 'pointer', padding: 2 }}
                />
                <input
                  type="text"
                  value={template.primary_color ?? '#FF5A1F'}
                  onChange={(e) => setTemplate((prev) => ({ ...prev, primary_color: e.target.value }))}
                  style={{ ...inputStyle, width: 'auto', flex: 1, fontFamily: 'monospace', fontSize: 13 }}
                  placeholder="#FF5A1F"
                />
              </div>
            </div>
            <div>
              <label style={{ ...labelStyle, marginBottom: 6 }}>Accent</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="color"
                  value={template.accent_color ?? '#EA580C'}
                  onChange={(e) => setTemplate((prev) => ({ ...prev, accent_color: e.target.value }))}
                  style={{ width: 36, height: 36, borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', cursor: 'pointer', padding: 2 }}
                />
                <input
                  type="text"
                  value={template.accent_color ?? '#EA580C'}
                  onChange={(e) => setTemplate((prev) => ({ ...prev, accent_color: e.target.value }))}
                  style={{ ...inputStyle, width: 'auto', flex: 1, fontFamily: 'monospace', fontSize: 13 }}
                  placeholder="#EA580C"
                />
              </div>
            </div>
          </div>

          {/* Color swatch preview */}
          {(() => {
            const rgb = hexToRgb(template.primary_color ?? '#FF5A1F')
            return (
              <div
                style={{
                  marginTop: 12, height: 6, borderRadius: 3,
                  background: rgb
                    ? `linear-gradient(90deg, ${template.primary_color} 0%, ${template.accent_color ?? '#EA580C'} 100%)`
                    : '#FF5A1F',
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
          <p style={{ fontSize: 11, color: '#475569', margin: '6px 0 0' }}>
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
          <p style={{ fontSize: 11, color: '#475569', margin: '6px 0 0' }}>
            {(template.terms ?? '').length}/5,000 characters
          </p>
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            width: '100%',
            padding: '12px',
            borderRadius: 10,
            border: 'none',
            background: saving ? 'rgba(255,90,31,0.5)' : '#FF5A1F',
            color: '#fff',
            fontWeight: 700,
            fontSize: 14,
            cursor: saving ? 'not-allowed' : 'pointer',
            transition: 'background 0.15s',
          }}
        >
          {saving ? 'Saving…' : 'Save template'}
        </button>
      </div>

      {/* ── Right: Live Preview ── */}
      <div style={{ position: 'sticky', top: 24 }}>
        <p style={{ ...labelStyle, marginBottom: 12 }}>Live Preview</p>
        <InvoicePreview template={template} orgName={orgName} />
        <p style={{ fontSize: 11, color: '#475569', marginTop: 8, textAlign: 'center' }}>
          Preview only · not to scale
        </p>
      </div>
    </div>
  )
}
