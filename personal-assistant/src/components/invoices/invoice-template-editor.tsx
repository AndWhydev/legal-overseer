'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useToast } from '@/components/ui/toast'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { IconLoader2, IconUpload, IconTrash } from '@tabler/icons-react'
import type { InvoiceTemplate } from '@/lib/invoices/template-types'

// ---- Helpers ----------------------------------------------------------------

const PRESET_SCHEMES = [
  { label: 'Ocean', primary: '#0EA5E9', accent: '#0284C7' },
  { label: 'Forest', primary: '#22C55E', accent: '#16A34A' },
  { label: 'Graphite', primary: '#334155', accent: '#1E293B' },
  { label: 'Violet', primary: '#8B5CF6', accent: '#7C3AED' },
  { label: 'Rose', primary: '#F43F5E', accent: '#E11D48' },
  { label: 'Slate', primary: '#64748B', accent: '#475569' },
]

// ---- Live Preview -----------------------------------------------------------

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
      className="relative w-full overflow-hidden rounded-xl bg-muted/50 p-4"
      style={{ height: Math.round(842 * scale) + 32, transition: 'height 0.15s ease' }}
    >
      <div
        style={{
          width: 595,
          height: 842,
          transformOrigin: 'top left',
          transform: `scale(${scale})`,
          position: 'absolute',
          top: 0,
          left: `calc(50% - ${595 * scale / 2}px)`,
          background: '#ffffff',
          borderRadius: 8,
          overflow: 'hidden',
          boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
          fontSize: 14,
          color: '#1e293b',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
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
              {template.terms.slice(0, 120)}{template.terms.length > 120 ? '...' : ''}
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

// ---- Main Component ---------------------------------------------------------

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

  if (loading) {
    return (
      <div className="flex h-[200px] items-center justify-center">
        <IconLoader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
      {/* Left: Editor */}
      <div className="flex flex-col gap-4">
        {/* Logo upload */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Logo</CardTitle>
          </CardHeader>
          <CardContent>
            {logoPreview ? (
              <div className="flex items-center gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={logoPreview}
                  alt="Logo preview"
                  className="h-12 max-w-[160px] rounded-lg bg-muted object-contain p-1"
                />
                <Button variant="destructive" size="sm" onClick={removeLogo}>
                  <IconTrash className="size-3.5" />
                  Remove
                </Button>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                className="flex w-full cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 p-6 text-sm text-muted-foreground transition-colors hover:bg-muted/50"
              >
                <IconUpload className="size-5" />
                Click to upload logo
                <span className="text-xs text-muted-foreground/70">PNG, JPG, SVG -- max 500 KB</span>
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={handleLogoUpload}
              className="hidden"
            />
          </CardContent>
        </Card>

        {/* Business details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Business Details</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="space-y-2">
              <Label htmlFor="company_name">Company Name</Label>
              <Input
                id="company_name"
                value={template.company_name ?? ''}
                onChange={(e) => setTemplate((prev) => ({ ...prev, company_name: e.target.value }))}
                placeholder="e.g. Tor Kay Consulting"
                maxLength={200}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="abn">ABN</Label>
                <Input
                  id="abn"
                  value={template.abn ?? ''}
                  onChange={(e) => setTemplate((prev) => ({ ...prev, abn: e.target.value }))}
                  placeholder="e.g. 12 345 678 901"
                  maxLength={30}
                />
              </div>
              <div className="space-y-2">
                <Label>GST Registered</Label>
                <div className="flex h-8 items-center gap-2">
                  <Switch
                    checked={template.gst_registered ?? false}
                    onCheckedChange={(v) => setTemplate((prev) => ({ ...prev, gst_registered: v }))}
                  />
                  <span className="text-sm text-muted-foreground">
                    {template.gst_registered ? 'Yes' : 'No'}
                  </span>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                value={(template.address_lines ?? []).join(', ')}
                onChange={(e) => setTemplate((prev) => ({
                  ...prev,
                  address_lines: e.target.value.split(',').map(l => l.trim()).filter(Boolean),
                }))}
                placeholder="e.g. 123 Agency St, Sydney NSW 2000"
              />
              <p className="text-xs text-muted-foreground">Separate lines with commas</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bank">Bank Details</Label>
              <Input
                id="bank"
                value={template.bank_details ?? ''}
                onChange={(e) => setTemplate((prev) => ({ ...prev, bank_details: e.target.value }))}
                placeholder="e.g. BSB: 062-000, Account: 1234 5678, Name: Tor Kay"
                maxLength={500}
              />
            </div>
          </CardContent>
        </Card>

        {/* Color scheme */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Color Scheme</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              {PRESET_SCHEMES.map((preset) => {
                const active = template.primary_color === preset.primary
                return (
                  <Badge
                    key={preset.label}
                    variant={active ? 'default' : 'outline'}
                    className="cursor-pointer gap-1.5 px-3 py-1"
                    onClick={() => applyPreset(preset.primary, preset.accent)}
                  >
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ background: preset.primary }}
                    />
                    {preset.label}
                  </Badge>
                )
              })}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Primary</Label>
                <div className="flex items-center gap-2">
                  <div className="size-8 shrink-0 overflow-hidden rounded-md border border-border">
                    <input
                      type="color"
                      value={template.primary_color ?? '#334155'}
                      onChange={(e) => setTemplate((prev) => ({ ...prev, primary_color: e.target.value }))}
                      className="size-full cursor-pointer border-none p-0"
                    />
                  </div>
                  <Input
                    value={template.primary_color ?? '#334155'}
                    onChange={(e) => setTemplate((prev) => ({ ...prev, primary_color: e.target.value }))}
                    placeholder="#334155"
                    className="font-mono text-xs"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Accent</Label>
                <div className="flex items-center gap-2">
                  <div className="size-8 shrink-0 overflow-hidden rounded-md border border-border">
                    <input
                      type="color"
                      value={template.accent_color ?? '#1E293B'}
                      onChange={(e) => setTemplate((prev) => ({ ...prev, accent_color: e.target.value }))}
                      className="size-full cursor-pointer border-none p-0"
                    />
                  </div>
                  <Input
                    value={template.accent_color ?? '#1E293B'}
                    onChange={(e) => setTemplate((prev) => ({ ...prev, accent_color: e.target.value }))}
                    placeholder="#1E293B"
                    className="font-mono text-xs"
                  />
                </div>
              </div>
            </div>

            <div
              className="h-1.5 rounded-full"
              style={{
                background: `linear-gradient(90deg, ${template.primary_color ?? '#334155'} 0%, ${template.accent_color ?? '#1E293B'} 100%)`,
              }}
            />
          </CardContent>
        </Card>

        {/* Footer text */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Footer Text</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Input
              value={template.footer_text ?? ''}
              onChange={(e) => setTemplate((prev) => ({ ...prev, footer_text: e.target.value }))}
              placeholder="e.g. Payment due within 14 days. BSB: 062-000 Account: 1234 5678"
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground">
              {(template.footer_text ?? '').length}/500 characters
            </p>
          </CardContent>
        </Card>

        {/* Terms */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Terms & Conditions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Textarea
              value={template.terms ?? ''}
              onChange={(e) => setTemplate((prev) => ({ ...prev, terms: e.target.value }))}
              placeholder="e.g. Payment is due within 14 days of invoice date. Late payments incur a 2% monthly fee..."
              maxLength={5000}
              className="min-h-[100px]"
            />
            <p className="text-xs text-muted-foreground">
              {(template.terms ?? '').length}/5,000 characters
            </p>
          </CardContent>
        </Card>

        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving ? (
            <>
              <IconLoader2 className="size-4 animate-spin" />
              Saving...
            </>
          ) : (
            'Save Template'
          )}
        </Button>
      </div>

      {/* Right: Live Preview */}
      <div className="sticky top-6 self-start">
        <InvoicePreview template={template} orgName={template.company_name?.trim() || orgName} />
      </div>
    </div>
  )
}
