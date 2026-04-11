import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PaymentPattern {
  contactId: string
  contactName: string
  avgPaymentDays: number
  medianPaymentDays: number
  onTimeRate: number     // % paid within terms (0-1)
  totalInvoices: number
  lastPaymentAt: string | null
}

interface PaidInvoiceRow {
  id: string
  client_contact_id: string
  issued_date: string | null
  due_date: string | null
  paid_date: string | null
  total: number
}

// ---------------------------------------------------------------------------
// Main: Learn Payment Patterns
// ---------------------------------------------------------------------------

/**
 * Analyze historical invoice payment data to learn per-client payment patterns.
 *
 * For each contact with paid invoices, computes:
 * - Average days from issue to payment
 * - Median days from issue to payment
 * - On-time rate (% paid before/on due date)
 * - Total invoice count
 * - Last payment date
 *
 * Returns patterns sorted by total invoices (most data first).
 */
export async function learnPaymentPatterns(
  supabase: SupabaseClient,
  orgId: string,
): Promise<PaymentPattern[]> {
  const tag = `[payment-learner:${orgId.slice(0, 8)}]`

  // Query all paid invoices with issue and paid dates
  const { data: paidInvoices, error } = await supabase
    .from('invoices')
    .select('id, client_contact_id, issued_date, due_date, paid_date, total')
    .eq('org_id', orgId)
    .eq('status', 'paid')
    .not('client_contact_id', 'is', null)
    .not('paid_date', 'is', null)

  if (error) {
    logger.warn(`${tag} Error querying paid invoices: ${error.message}`)
    return []
  }

  if (!paidInvoices || paidInvoices.length === 0) {
    logger.info(`${tag} No paid invoices found for pattern learning`)
    return []
  }

  // Group by contact
  const byContact = new Map<string, PaidInvoiceRow[]>()
  for (const inv of paidInvoices) {
    const contactId = inv.client_contact_id as string
    if (!contactId || !inv.paid_date) continue

    const existing = byContact.get(contactId) ?? []
    existing.push(inv as unknown as PaidInvoiceRow)
    byContact.set(contactId, existing)
  }

  // Fetch contact names in batch
  const contactIds = Array.from(byContact.keys())
  const contactNames = await fetchContactNames(supabase, orgId, contactIds)

  // Compute patterns per contact
  const patterns: PaymentPattern[] = []

  for (const [contactId, invoices] of byContact) {
    const paymentDays: number[] = []
    let onTimeCount = 0
    let lastPaymentAt: string | null = null

    for (const inv of invoices) {
      // Compute days from issued_date (or due_date - terms) to paid_date
      const issueDate = inv.issued_date ?? inv.due_date
      if (!issueDate || !inv.paid_date) continue

      const issuedMs = new Date(issueDate).getTime()
      const paidMs = new Date(inv.paid_date).getTime()
      const days = Math.max(0, Math.round((paidMs - issuedMs) / (1000 * 60 * 60 * 24)))
      paymentDays.push(days)

      // Check if paid on time (before or on due date)
      if (inv.due_date) {
        const dueMs = new Date(inv.due_date).getTime()
        if (paidMs <= dueMs + 24 * 60 * 60 * 1000) { // 1 day grace
          onTimeCount++
        }
      }

      // Track last payment
      if (!lastPaymentAt || inv.paid_date > lastPaymentAt) {
        lastPaymentAt = inv.paid_date
      }
    }

    if (paymentDays.length === 0) continue

    // Calculate statistics
    const avgDays = paymentDays.reduce((a, b) => a + b, 0) / paymentDays.length
    const sorted = [...paymentDays].sort((a, b) => a - b)
    const medianDays = sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)]
    const onTimeRate = paymentDays.length > 0 ? onTimeCount / paymentDays.length : 0

    patterns.push({
      contactId,
      contactName: contactNames.get(contactId) ?? 'Unknown',
      avgPaymentDays: Math.round(avgDays * 10) / 10,
      medianPaymentDays: Math.round(medianDays * 10) / 10,
      onTimeRate: Math.round(onTimeRate * 100) / 100,
      totalInvoices: paymentDays.length,
      lastPaymentAt,
    })
  }

  // Sort by total invoices (most data = most reliable pattern)
  patterns.sort((a, b) => b.totalInvoices - a.totalInvoices)

  logger.info(`${tag} Learned payment patterns for ${patterns.length} contacts from ${paidInvoices.length} invoices`)
  return patterns
}

// ---------------------------------------------------------------------------
// Predict Payment Date
// ---------------------------------------------------------------------------

/**
 * Predict when a specific invoice will be paid based on learned patterns.
 *
 * Uses the contact's historical payment speed. If no history exists,
 * falls back to the invoice's terms (due date).
 *
 * Confidence is based on sample size:
 * - 1-2 invoices: 0.3 (low)
 * - 3-5 invoices: 0.5 (moderate)
 * - 6-10 invoices: 0.7 (good)
 * - 10+: 0.85 (high)
 */
export async function predictPaymentDate(
  supabase: SupabaseClient,
  orgId: string,
  contactId: string,
  invoiceDate: string,
  termsDays: number,
): Promise<{ predictedDate: string; confidence: number }> {
  const tag = `[payment-learner:${orgId.slice(0, 8)}]`

  // Learn patterns (or use cached)
  const patterns = await learnPaymentPatterns(supabase, orgId)
  const contactPattern = patterns.find((p) => p.contactId === contactId)

  if (!contactPattern || contactPattern.totalInvoices === 0) {
    // No history -- use terms as prediction
    const predictedMs = new Date(invoiceDate).getTime() + termsDays * 24 * 60 * 60 * 1000
    return {
      predictedDate: new Date(predictedMs).toISOString().slice(0, 10),
      confidence: 0.2,
    }
  }

  // Use median payment days (more robust than mean for skewed distributions)
  const predictedDays = contactPattern.medianPaymentDays
  const predictedMs = new Date(invoiceDate).getTime() + predictedDays * 24 * 60 * 60 * 1000
  const predictedDate = new Date(predictedMs).toISOString().slice(0, 10)

  // Confidence based on sample size
  const n = contactPattern.totalInvoices
  let confidence: number
  if (n >= 10) confidence = 0.85
  else if (n >= 6) confidence = 0.7
  else if (n >= 3) confidence = 0.5
  else confidence = 0.3

  logger.info(
    `${tag} Predicted payment for ${contactId.slice(0, 8)}: ` +
    `${predictedDate} (${predictedDays} days, confidence=${confidence}, ` +
    `based on ${n} invoices)`,
  )

  return { predictedDate, confidence }
}

// ---------------------------------------------------------------------------
// Detect Unusual Delays
// ---------------------------------------------------------------------------

/**
 * Detect contacts with unusually delayed payments relative to their pattern.
 *
 * Flags invoices where days-since-issued exceeds the contact's median
 * payment days by more than 50% (or 7 days, whichever is larger).
 */
export async function detectUnusualDelays(
  supabase: SupabaseClient,
  orgId: string,
  patterns: PaymentPattern[],
): Promise<Array<{
  contactId: string
  contactName: string
  invoiceNumber: string
  expectedDays: number
  actualDays: number
  invoiceId: string
}>> {
  const tag = `[payment-learner:${orgId.slice(0, 8)}]`
  const delays: Array<{
    contactId: string
    contactName: string
    invoiceNumber: string
    expectedDays: number
    actualDays: number
    invoiceId: string
  }> = []

  if (patterns.length === 0) return delays

  // Build a map of contact patterns
  const patternMap = new Map(patterns.map((p) => [p.contactId, p]))

  // Query unpaid (sent/viewed/overdue) invoices
  const { data: unpaidInvoices, error } = await supabase
    .from('invoices')
    .select('id, invoice_number, client_contact_id, issued_date, due_date, status')
    .eq('org_id', orgId)
    .in('status', ['sent', 'viewed', 'overdue'])
    .not('client_contact_id', 'is', null)

  if (error || !unpaidInvoices) return delays

  const now = Date.now()

  for (const inv of unpaidInvoices) {
    const contactId = inv.client_contact_id as string
    const pattern = patternMap.get(contactId)
    if (!pattern || pattern.totalInvoices < 2) continue // Need at least 2 invoices for meaningful pattern

    const issueDate = (inv.issued_date ?? inv.due_date) as string
    if (!issueDate) continue

    const actualDays = Math.round((now - new Date(issueDate).getTime()) / (1000 * 60 * 60 * 24))
    const expectedDays = pattern.medianPaymentDays

    // Threshold: 50% over median or 7 days over, whichever is larger
    const threshold = Math.max(expectedDays * 1.5, expectedDays + 7)

    if (actualDays > threshold) {
      delays.push({
        contactId,
        contactName: pattern.contactName,
        invoiceNumber: inv.invoice_number as string,
        expectedDays: Math.round(expectedDays),
        actualDays,
        invoiceId: inv.id as string,
      })
    }
  }

  if (delays.length > 0) {
    logger.info(`${tag} Detected ${delays.length} unusual payment delays`)
  }

  return delays
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Fetch contact names in batch for efficiency.
 */
async function fetchContactNames(
  supabase: SupabaseClient,
  orgId: string,
  contactIds: string[],
): Promise<Map<string, string>> {
  if (contactIds.length === 0) return new Map()

  const { data, error } = await supabase
    .from('contacts')
    .select('id, name')
    .eq('org_id', orgId)
    .in('id', contactIds)

  if (error || !data) return new Map()

  const map = new Map<string, string>()
  for (const row of data) {
    map.set(row.id as string, (row.name as string) ?? 'Unknown')
  }
  return map
}
