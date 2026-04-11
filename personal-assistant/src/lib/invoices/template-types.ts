import type { SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Unified Invoice Template — single source of truth for editor, API, PDF, tool
// ---------------------------------------------------------------------------

export interface InvoiceTemplate {
  // Visual
  logo_base64?: string
  primary_color?: string
  accent_color?: string
  // Business
  company_name?: string
  abn?: string
  gst_registered?: boolean
  address_lines?: string[]
  // Payment
  bank_details?: string
  payment_instructions?: string
  default_payment_terms_days?: number
  // Content
  footer_text?: string
  terms?: string
}

// ---------------------------------------------------------------------------
// Sanitization (shared by API route + tool)
// ---------------------------------------------------------------------------

const ALLOWED_COLORS = /^#[0-9A-Fa-f]{3,6}$/

export function sanitizeTemplate(raw: unknown): InvoiceTemplate {
  if (!raw || typeof raw !== 'object') return {}
  const src = raw as Record<string, unknown>
  const out: InvoiceTemplate = {}

  // Logo — data URI, max ~500 KB base64
  if (typeof src.logo_base64 === 'string' && src.logo_base64.startsWith('data:image/')) {
    if (src.logo_base64.length <= 700_000) {
      out.logo_base64 = src.logo_base64
    }
  }

  // Colors
  if (typeof src.primary_color === 'string' && ALLOWED_COLORS.test(src.primary_color)) {
    out.primary_color = src.primary_color
  }
  if (typeof src.accent_color === 'string' && ALLOWED_COLORS.test(src.accent_color)) {
    out.accent_color = src.accent_color
  }

  // Business details
  if (typeof src.company_name === 'string' && src.company_name.trim()) {
    out.company_name = src.company_name.trim().slice(0, 200)
  }
  if (typeof src.abn === 'string' && src.abn.trim()) {
    out.abn = src.abn.trim().slice(0, 30)
  }
  if (typeof src.gst_registered === 'boolean') {
    out.gst_registered = src.gst_registered
  }
  if (Array.isArray(src.address_lines)) {
    out.address_lines = src.address_lines
      .filter((l): l is string => typeof l === 'string' && l.trim().length > 0)
      .map(l => l.trim().slice(0, 200))
      .slice(0, 5)
  }

  // Payment
  if (typeof src.bank_details === 'string' && src.bank_details.trim()) {
    out.bank_details = src.bank_details.trim().slice(0, 500)
  }
  if (typeof src.payment_instructions === 'string' && src.payment_instructions.trim()) {
    out.payment_instructions = src.payment_instructions.trim().slice(0, 500)
  }
  if (typeof src.default_payment_terms_days === 'number' && src.default_payment_terms_days > 0) {
    out.default_payment_terms_days = Math.min(Math.round(src.default_payment_terms_days), 365)
  }

  // Content
  if (typeof src.footer_text === 'string') {
    out.footer_text = src.footer_text.slice(0, 500)
  }
  if (typeof src.terms === 'string') {
    out.terms = src.terms.slice(0, 5000)
  }

  return out
}

// ---------------------------------------------------------------------------
// Load org template from database
// ---------------------------------------------------------------------------

export async function loadOrgTemplate(
  supabase: SupabaseClient,
  orgId: string,
): Promise<InvoiceTemplate> {
  const { data } = await supabase
    .from('organizations')
    .select('invoice_template')
    .eq('id', orgId)
    .single()

  return sanitizeTemplate(data?.invoice_template)
}

// ---------------------------------------------------------------------------
// Merge partial update into existing template
// ---------------------------------------------------------------------------

export function mergeTemplateUpdate(
  current: InvoiceTemplate,
  update: Partial<InvoiceTemplate> & { remove_logo?: boolean },
): InvoiceTemplate {
  const merged = { ...current }

  if (update.remove_logo) {
    delete merged.logo_base64
  } else if (update.logo_base64 !== undefined) {
    merged.logo_base64 = update.logo_base64
  }

  if (update.primary_color !== undefined) merged.primary_color = update.primary_color
  if (update.accent_color !== undefined) merged.accent_color = update.accent_color
  if (update.company_name !== undefined) merged.company_name = update.company_name
  if (update.abn !== undefined) merged.abn = update.abn
  if (update.gst_registered !== undefined) merged.gst_registered = update.gst_registered
  if (update.address_lines !== undefined) merged.address_lines = update.address_lines
  if (update.bank_details !== undefined) merged.bank_details = update.bank_details
  if (update.payment_instructions !== undefined) merged.payment_instructions = update.payment_instructions
  if (update.default_payment_terms_days !== undefined) merged.default_payment_terms_days = update.default_payment_terms_days
  if (update.footer_text !== undefined) merged.footer_text = update.footer_text
  if (update.terms !== undefined) merged.terms = update.terms

  return merged
}

// ---------------------------------------------------------------------------
// Convert template to InvoicePdfSettings shape (used by invoice-pdf.ts)
// ---------------------------------------------------------------------------

export interface PdfSettingsFromTemplate {
  company_name?: string
  logo_base64?: string
  primary_color?: string
  accent_color?: string
  bank_details?: string
  payment_terms_days?: number
  abn?: string
  gst_registered?: boolean
  address_lines?: string[]
  payment_instructions?: string
  footer_text?: string
  terms?: string
}

export function templateToPdfSettings(t: InvoiceTemplate): PdfSettingsFromTemplate {
  return {
    company_name: t.company_name,
    logo_base64: t.logo_base64,
    primary_color: t.primary_color,
    accent_color: t.accent_color,
    bank_details: t.bank_details,
    payment_terms_days: t.default_payment_terms_days,
    abn: t.abn,
    gst_registered: t.gst_registered,
    address_lines: t.address_lines,
    payment_instructions: t.payment_instructions,
    footer_text: t.footer_text,
    terms: t.terms,
  }
}
