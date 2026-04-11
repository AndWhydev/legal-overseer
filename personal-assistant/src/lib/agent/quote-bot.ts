import type { SupabaseClient } from '@supabase/supabase-js'
import { createApproval } from './approval-queue'
import { getOrgNotificationConfig } from '@/lib/org/notification-config'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QuoteBotTickResult {
  processed: number
  drafted: number
  failed: number
}

interface LineItem {
  description: string
  type: 'labor' | 'material'
  qty: number
  unit: number
  total: number
}

// ---------------------------------------------------------------------------
// Job-type heuristics for quote generation
// ---------------------------------------------------------------------------

const JOB_DEFAULTS: Record<string, { hourlyRate: number; defaultHours: number; materials: number }> = {
  electrical:  { hourlyRate: 95, defaultHours: 4, materials: 150 },
  plumbing:    { hourlyRate: 100, defaultHours: 3, materials: 120 },
  painting:    { hourlyRate: 75, defaultHours: 8, materials: 200 },
  building:    { hourlyRate: 90, defaultHours: 16, materials: 500 },
  hvac:        { hourlyRate: 105, defaultHours: 6, materials: 300 },
  tiling:      { hourlyRate: 80, defaultHours: 8, materials: 250 },
  landscaping: { hourlyRate: 70, defaultHours: 8, materials: 180 },
  general:     { hourlyRate: 85, defaultHours: 4, materials: 100 },
}

function detectJobType(text: string): string {
  const lower = text.toLowerCase()
  if (/electr|spark|wiring|power\s?point|switch/i.test(lower)) return 'electrical'
  if (/plumb|tap|pipe|drain|toilet|leak/i.test(lower)) return 'plumbing'
  if (/paint|render|coat/i.test(lower)) return 'painting'
  if (/build|construct|frame|extension|reno/i.test(lower)) return 'building'
  if (/hvac|air\s?con|heat|cool|split\s?system/i.test(lower)) return 'hvac'
  if (/tile|tiling|grout/i.test(lower)) return 'tiling'
  if (/landscap|garden|turf|fence|deck/i.test(lower)) return 'landscaping'
  return 'general'
}

function buildLineItems(jobType: string, description: string): LineItem[] {
  const defaults = JOB_DEFAULTS[jobType] ?? JOB_DEFAULTS.general
  const items: LineItem[] = []

  // Labour line
  items.push({
    description: `${jobType.charAt(0).toUpperCase() + jobType.slice(1)} labour`,
    type: 'labor',
    qty: defaults.defaultHours,
    unit: defaults.hourlyRate,
    total: defaults.defaultHours * defaults.hourlyRate,
  })

  // Materials estimate
  items.push({
    description: 'Materials (estimated)',
    type: 'material',
    qty: 1,
    unit: defaults.materials,
    total: defaults.materials,
  })

  // Call-out fee for small jobs
  if (defaults.defaultHours <= 4) {
    items.push({
      description: 'Call-out / travel',
      type: 'labor',
      qty: 1,
      unit: 80,
      total: 80,
    })
  }

  return items
}

// ---------------------------------------------------------------------------
// Scheduler Tick
// ---------------------------------------------------------------------------

export async function runQuoteBotTick(
  supabase: SupabaseClient,
  orgId: string,
  configId: string,
): Promise<QuoteBotTickResult> {
  const result: QuoteBotTickResult = { processed: 0, drafted: 0, failed: 0 }

  // 0. Send approved quotes to clients
  const { data: approvedQuotes } = await supabase
    .from('approval_queue')
    .select('id, action_payload')
    .eq('org_id', orgId)
    .eq('action_type', 'quote_review')
    .eq('status', 'approved')
    .limit(20)

  for (const approval of (approvedQuotes || []) as Array<{ id: string; action_payload: Record<string, unknown> }>) {
    try {
      const quoteId = approval.action_payload.quote_id as string
      if (!quoteId) continue

      // Get quote + contact
      const { data: quote } = await supabase
        .from('quotes')
        .select('id, contact_id, grand_total, notes')
        .eq('id', quoteId)
        .single()

      if (quote?.contact_id) {
        const { data: contact } = await supabase
          .from('contacts')
          .select('name, email')
          .eq('id', quote.contact_id)
          .single()

        if (contact?.email) {
          const { sendInvoiceEmail } = await import('@/lib/email/send-invoice')
          const orgConfig = await getOrgNotificationConfig(orgId)
          await sendInvoiceEmail({
            to: contact.email,
            invoiceNumber: `quote-${quoteId}`,
            html: `<p>Hi ${contact.name ?? 'there'},</p>
<p>Thanks for your enquiry. Please find your quote attached.</p>
<p><strong>Total (inc. GST): $${(quote.grand_total as number).toFixed(2)}</strong></p>
<p>This quote is valid for 14 days. Let me know if you'd like to proceed or have any questions.</p>
<p>Cheers</p>`,
            subject: `Your Quote from ${orgConfig.name}`,
          })

          await supabase
            .from('quotes')
            .update({ status: 'sent', sent_at: new Date().toISOString() })
            .eq('id', quoteId)

          result.processed++
        }
      }

      // Mark approval resolved
      await supabase
        .from('approval_queue')
        .update({ status: 'approved', resolved_at: new Date().toISOString() })
        .eq('id', approval.id)
    } catch {
      result.failed++
    }
  }

  // 1. Fetch new leads from inbound channels
  const { data: leads, error } = await supabase
    .from('leads')
    .select('id, title, description, source, contact_id')
    .eq('org_id', orgId)
    .eq('status', 'new')
    .in('source', ['whatsapp', 'facebook', 'website'])
    .limit(20)

  if (error || !leads || leads.length === 0) return result

  for (const lead of leads) {
    result.processed += 1
    try {
      const text = `${lead.title ?? ''} ${lead.description ?? ''}`
      const jobType = detectJobType(text)
      const lineItems = buildLineItems(jobType, text)

      const laborTotal = lineItems.filter((i) => i.type === 'labor').reduce((s, i) => s + i.total, 0)
      const materialsTotal = lineItems.filter((i) => i.type === 'material').reduce((s, i) => s + i.total, 0)
      const subtotal = laborTotal + materialsTotal
      const gst = Math.round(subtotal * 0.1 * 100) / 100
      const grandTotal = subtotal + gst

      // 2. Insert quote
      const { data: quote, error: quoteError } = await supabase
        .from('quotes')
        .insert({
          org_id: orgId,
          contact_id: lead.contact_id,
          lead_id: lead.id,
          status: 'draft',
          line_items: lineItems,
          labor_total: laborTotal,
          materials_total: materialsTotal,
          gst_total: gst,
          grand_total: grandTotal,
          valid_until: new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10),
          notes: `Auto-drafted from enquiry: ${lead.title ?? lead.id}`,
        })
        .select('id')
        .single()

      if (quoteError || !quote) {
        result.failed += 1
        continue
      }

      // 3. Create approval item for tradie to review
      await createApproval(supabase, {
        org_id: orgId,
        agent_config_id: configId,
        action_type: 'quote_review',
        action_payload: {
          quote_id: quote.id,
          lead_id: lead.id,
          job_type: jobType,
          grand_total: grandTotal,
        },
        action_summary: `Review draft quote $${grandTotal.toFixed(0)} for: ${lead.title ?? 'Enquiry'}`,
        confidence_score: 0.6,
        routing_decision: 'ask',
        priority: 'normal',
        context_snapshot: {
          source: 'quote-bot',
          leadId: lead.id,
          quoteId: quote.id,
          jobType,
        },
      })

      // 4. Mark lead as quoted
      await supabase
        .from('leads')
        .update({ status: 'quoted', updated_at: new Date().toISOString() })
        .eq('id', lead.id)

      result.drafted += 1
    } catch {
      result.failed += 1
    }
  }

  return result
}
