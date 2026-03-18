/**
 * Generate Invoice Tool
 *
 * Single tool that encapsulates the full invoice generation pipeline:
 * 1. Looks up user's business details from semantic_memories (ABN, bank, numbering)
 * 2. Looks up recipient contact details
 * 3. Generates styled HTML invoice via the render API
 * 4. Returns the HTML + metadata for the main agent to present
 *
 * The main agent just calls: generate_invoice({ to, amount, description })
 * and gets back a complete, styled invoice ready to send.
 */

import type Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { generateInvoicePdf } from '../invoice-pdf'
import { logger } from '@/lib/core/logger'

export const invoiceToolDefinition: Anthropic.Tool = {
  name: 'generate_invoice',
  description: 'Generate a professional styled HTML invoice. Automatically looks up your business details (ABN, bank account, invoice numbering) from memory and the recipient from contacts. Returns rendered HTML with a "Save as PDF" button. Use this instead of writing invoices as plain text.',
  input_schema: {
    type: 'object' as const,
    properties: {
      recipient_name: {
        type: 'string',
        description: 'Name of the person/company being invoiced (e.g., "Andy Taleb" or "All Webbed Up")',
      },
      recipient_email: {
        type: 'string',
        description: 'Email address of the recipient',
      },
      amount: {
        type: 'number',
        description: 'Total invoice amount in AUD',
      },
      description: {
        type: 'string',
        description: 'What the invoice is for (e.g., "Club Team Manager - Bug fixes and functionality updates")',
      },
      line_items: {
        type: 'array',
        description: 'Optional: individual line items. If not provided, a single line item is created from the description + amount.',
        items: {
          type: 'object',
          properties: {
            description: { type: 'string' },
            quantity: { type: 'number' },
            unit_price: { type: 'number' },
          },
        },
      },
      project_reference: {
        type: 'string',
        description: 'Optional: project name for the invoice header',
      },
      invoice_number: {
        type: 'string',
        description: 'Optional: specific invoice number. If not provided, auto-generates based on the numbering pattern in memory.',
      },
      payment_terms_days: {
        type: 'number',
        description: 'Payment terms in days (default: 7)',
      },
    },
    required: ['recipient_name', 'recipient_email', 'amount', 'description'],
  },
}

interface InvoiceToolInput {
  recipient_name: string
  recipient_email: string
  amount: number
  description: string
  line_items?: Array<{ description: string; quantity: number; unit_price: number }>
  project_reference?: string
  invoice_number?: string
  payment_terms_days?: number
}

export async function handleGenerateInvoice(
  input: InvoiceToolInput,
  orgId: string,
  supabase: SupabaseClient,
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    // Step 1: Look up business details from memory
    const { data: memories } = await supabase
      .from('semantic_memories')
      .select('content')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .or('content.ilike.%BSB%,content.ilike.%ABN%,content.ilike.%invoice-template%,content.ilike.%bank%')
      .order('confidence', { ascending: false })
      .limit(5)

    let abn = ''
    let bankDetails = ''
    let companyName = 'Tor Kay'
    let companyEmail = 'contact@torkay.com'

    for (const mem of memories ?? []) {
      const content = mem.content
      // Skip invoice-html records (they contain rendered HTML, not extractable data)
      if (content.startsWith('[invoice-html:')) continue

      // Extract ABN
      const abnMatch = content.match(/ABN[:\s]+(\d[\d\s]+\d)/i)
      if (abnMatch && !abn) abn = abnMatch[1].replace(/\s/g, ' ').trim()

      // Extract BSB + Account
      const bsbMatch = content.match(/BSB[:\s]+([\d-]+)/i)
      const accMatch = content.match(/Account(?:\s+Number)?[:\s]+(\d+)/i)
      if (bsbMatch && accMatch && !bankDetails) {
        const nameMatch = content.match(/Account\s+Name[:\s]+([^\n]+)/i)
        bankDetails = `BSB: ${bsbMatch[1]}, Account: ${accMatch[1]}${nameMatch ? `, Name: ${nameMatch[1].trim()}` : ''}`
      }

      // Extract company name — only from "User's business" or "FROM" lines, not filenames
      const businessMatch = content.match(/User's business[:\s]+([^\n]+)/i)
      if (businessMatch) companyName = businessMatch[1].trim()
      else {
        const fromMatch = content.match(/^FROM[:\s]+([A-Z][a-z]+ [A-Z][a-z]+)/m)
        if (fromMatch && !fromMatch[1].includes('.pdf')) companyName = fromMatch[1].trim()
      }

      // Extract email
      const emailMatch = content.match(/(?:contact|tor)@[\w.]+\.com\.au/i)
      if (emailMatch) companyEmail = emailMatch[0]
    }

    // Step 2: Auto-generate invoice number if not provided
    let invoiceNumber = input.invoice_number
    if (!invoiceNumber) {
      const now = new Date()
      const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`

      // Determine prefix from recipient
      const recipientLower = (input.recipient_name + ' ' + input.recipient_email).toLowerCase()
      let prefix = 'INV'
      if (recipientLower.includes('webbed') || recipientLower.includes('andy')) prefix = 'AWU'
      else if (recipientLower.includes('steve') || recipientLower.includes('west')) prefix = 'SW'

      // Find the latest invoice number with this prefix
      const { data: existingInvoices } = await supabase
        .from('semantic_memories')
        .select('content')
        .eq('org_id', orgId)
        .eq('is_active', true)
        .ilike('content', `%${prefix}-${yearMonth}%`)
        .limit(5)

      let maxSeq = 0
      for (const inv of existingInvoices ?? []) {
        const seqMatch = inv.content.match(new RegExp(`${prefix}-${yearMonth}-(\\d+)`, 'i'))
        if (seqMatch) maxSeq = Math.max(maxSeq, parseInt(seqMatch[1]))
      }

      invoiceNumber = `${prefix}-${yearMonth}-${String(maxSeq + 1).padStart(3, '0')}`
    }

    // Step 3: Build line items
    const lineItems = input.line_items?.map(li => ({
      description: li.description,
      quantity: li.quantity || 1,
      unit_price: li.unit_price,
      total: (li.quantity || 1) * li.unit_price,
    })) ?? [{
      description: input.description,
      quantity: 1,
      unit_price: input.amount,
      total: input.amount,
    }]

    const subtotal = lineItems.reduce((sum, li) => sum + li.total, 0)
    const tax = 0 // GST handled separately if needed
    const total = subtotal + tax
    const termsDays = input.payment_terms_days ?? 7

    const now = new Date()
    const dueDate = new Date(now)
    dueDate.setDate(dueDate.getDate() + termsDays)

    // Step 4: Generate styled HTML invoice
    const result = generateInvoicePdf(
      {
        invoice_number: invoiceNumber,
        issued_date: now.toISOString().slice(0, 10),
        due_date: dueDate.toISOString().slice(0, 10),
        client_name: input.recipient_name,
        client_email: input.recipient_email,
        items: lineItems,
        subtotal,
        tax,
        total,
        currency: 'AUD',
        payment_terms_days: termsDays,
        project_reference: input.project_reference ?? null,
      },
      {
        company_name: companyName,
        abn: abn || undefined,
        bank_details: bankDetails || undefined,
        payment_terms_days: termsDays,
        gst_registered: false,
        address_lines: ['Brisbane, Queensland'],
      }
    )

    // Step 5: Store the invoice in memory for future reference
    await supabase.from('semantic_memories').insert({
      org_id: orgId,
      content: `[invoice] ${invoiceNumber}: $${total.toFixed(2)} AUD to ${input.recipient_name} (${input.recipient_email}) for ${input.description}. Due: ${dueDate.toISOString().slice(0, 10)}`,
      category: 'financial',
      confidence: 0.95,
      is_active: true,
      decay_rate: 'normal',
    }).then(() => {})

    logger.info('[generate_invoice] Invoice generated', {
      invoiceNumber, total, recipient: input.recipient_name,
    })

    // Step 6: Create a viewable URL by encoding the invoice data as base64
    // The /api/invoices/render endpoint accepts POST with this data
    const invoicePayload = Buffer.from(JSON.stringify({
      invoice: {
        invoice_number: invoiceNumber,
        issued_date: now.toISOString().slice(0, 10),
        due_date: dueDate.toISOString().slice(0, 10),
        client_name: input.recipient_name,
        client_email: input.recipient_email,
        items: lineItems,
        subtotal, tax, total,
        currency: 'AUD',
        payment_terms_days: termsDays,
        project_reference: input.project_reference ?? null,
      },
      settings: {
        company_name: companyName,
        abn: abn || undefined,
        bank_details: bankDetails || undefined,
        payment_terms_days: termsDays,
        gst_registered: false,
        address_lines: ['Brisbane, Queensland'],
      },
    })).toString('base64')

    // Store the invoice HTML in a temporary record so it can be viewed
    const invoiceId = `inv-${Date.now()}`
    await supabase.from('semantic_memories').insert({
      org_id: orgId,
      content: `[invoice-html:${invoiceId}] ${result.html.slice(0, 500)}`,
      category: 'general',
      confidence: 0.5,
      is_active: true,
      decay_rate: 'fast',
    }).then(() => {})

    return {
      success: true,
      data: {
        invoice_number: invoiceNumber,
        total: `$${total.toFixed(2)} AUD`,
        recipient: input.recipient_name,
        recipient_email: input.recipient_email,
        due_date: dueDate.toISOString().slice(0, 10),
        terms: `${termsDays} days`,
        subject: result.subject,
        description: input.description,
        html: result.html,
        view_url: `/api/invoices/render?data=${invoicePayload}`,
        // The frontend renders this as an embedded artifact card automatically.
        // The model should just confirm briefly — no need to describe the invoice contents.
        _render_hint: 'INVOICE_ARTIFACT_RENDERED_IN_UI',
      },
    }
  } catch (err) {
    logger.error('[generate_invoice] Failed', { error: err instanceof Error ? err.message : String(err) })
    return { success: false, error: `Invoice generation failed: ${err instanceof Error ? err.message : String(err)}` }
  }
}
