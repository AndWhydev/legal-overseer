import type Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadOrgTemplate, mergeTemplateUpdate, sanitizeTemplate } from '@/lib/invoices/template-types'
import { logger } from '@/lib/core/logger'

export const templateToolDefinition: Anthropic.Tool = {
  name: 'update_invoice_template',
  description:
    'Update the organization\'s invoice template. All fields are optional — only provide fields you want to change (e.g., "change the color to blue" only needs primary_color). Changes apply to all future invoices.',
  input_schema: {
    type: 'object' as const,
    properties: {
      company_name: {
        type: 'string',
        description: 'Business/company name shown on invoices',
      },
      logo_base64: {
        type: 'string',
        description: 'Logo as a base64 data URI (data:image/png;base64,...). Max 500 KB.',
      },
      remove_logo: {
        type: 'boolean',
        description: 'Set to true to remove the current logo',
      },
      primary_color: {
        type: 'string',
        description: 'Primary brand color as hex (e.g., "#155dfc")',
      },
      accent_color: {
        type: 'string',
        description: 'Secondary accent color as hex (e.g., "#0ea5e9")',
      },
      abn: {
        type: 'string',
        description: 'Australian Business Number',
      },
      gst_registered: {
        type: 'boolean',
        description: 'Whether the business is GST registered (affects tax display)',
      },
      address_lines: {
        type: 'array',
        items: { type: 'string' },
        description: 'Business address lines (e.g., ["123 Agency St", "Sydney NSW 2000"])',
      },
      bank_details: {
        type: 'string',
        description: 'Bank account details for payment (BSB, Account, Name)',
      },
      payment_instructions: {
        type: 'string',
        description: 'Custom payment instructions shown on invoice',
      },
      default_payment_terms_days: {
        type: 'number',
        description: 'Default payment terms in days (e.g., 7, 14, 30)',
      },
      footer_text: {
        type: 'string',
        description: 'Custom footer text on invoices',
      },
      terms: {
        type: 'string',
        description: 'Terms and conditions text',
      },
    },
    required: [] as string[],
  },
}

interface TemplateToolInput {
  company_name?: string
  logo_base64?: string
  remove_logo?: boolean
  primary_color?: string
  accent_color?: string
  abn?: string
  gst_registered?: boolean
  address_lines?: string[]
  bank_details?: string
  payment_instructions?: string
  default_payment_terms_days?: number
  footer_text?: string
  terms?: string
}

export async function handleUpdateInvoiceTemplate(
  input: TemplateToolInput,
  orgId: string,
  supabase: SupabaseClient,
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    // Load current template
    const current = await loadOrgTemplate(supabase, orgId)

    // Merge the incremental update
    const merged = mergeTemplateUpdate(current, input)

    // Sanitize the merged result
    const sanitized = sanitizeTemplate(merged)

    // Save to database
    const { error } = await supabase
      .from('organizations')
      .update({ invoice_template: sanitized })
      .eq('id', orgId)

    if (error) {
      logger.error('[update_invoice_template] Save failed', { error: error.message })
      return { success: false, error: error.message }
    }

    // Build summary of what changed
    const changes: string[] = []
    if (input.company_name) changes.push(`company name → "${input.company_name}"`)
    if (input.logo_base64) changes.push('logo updated')
    if (input.remove_logo) changes.push('logo removed')
    if (input.primary_color) changes.push(`primary color → ${input.primary_color}`)
    if (input.accent_color) changes.push(`accent color → ${input.accent_color}`)
    if (input.abn) changes.push(`ABN → ${input.abn}`)
    if (input.gst_registered !== undefined) changes.push(`GST registered → ${input.gst_registered}`)
    if (input.address_lines) changes.push('address updated')
    if (input.bank_details) changes.push('bank details updated')
    if (input.payment_instructions) changes.push('payment instructions updated')
    if (input.default_payment_terms_days) changes.push(`payment terms → ${input.default_payment_terms_days} days`)
    if (input.footer_text !== undefined) changes.push('footer text updated')
    if (input.terms !== undefined) changes.push('terms updated')

    logger.info('[update_invoice_template] Template updated', { orgId, changes })

    return {
      success: true,
      data: {
        changes,
        template: sanitized,
      },
    }
  } catch (err) {
    logger.error('[update_invoice_template] Failed', { error: err instanceof Error ? err.message : String(err) })
    return { success: false, error: `Template update failed: ${err instanceof Error ? err.message : String(err)}` }
  }
}
