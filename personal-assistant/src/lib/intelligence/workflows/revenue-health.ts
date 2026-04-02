/**
 * Revenue Health Monitor — Intelligence Workflow
 *
 * Uses the SEQUENTIAL WDK pattern to monitor revenue health across all clients.
 *
 * Steps execute in order, each feeding into the next:
 *
 * Step 1: Query recent monetary signals from ingested channel data
 *   - Pulls payment events, invoice status changes, revenue-related messages
 *
 * Step 2: Cross-reference with invoice/payment status
 *   - Joins monetary signals with actual invoice records
 *   - Computes per-client revenue metrics
 *
 * Step 3: Generate per-client health scores using generateObject()
 *   - LLM analyzes combined data to produce structured health assessments
 *
 * Step 4: Detect anomalies (overdue payments, scope creep, pricing disputes)
 *   - LLM identifies patterns indicating revenue risk
 *   - Produces severity-ranked anomaly list with recommended actions
 *
 * @module intelligence/workflows/revenue-health
 */

import { z } from 'zod'
import { generateObject } from 'ai'
import { models } from '@/lib/ai'
import { runSequentialWorkflow } from '@/lib/workflows/patterns'
import type {
  WorkflowResult,
  WorkflowConfig,
  RevenueHealthResult,
  ClientHealthScore,
  RevenueAnomaly,
} from './types'

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

const clientHealthArraySchema = z.object({
  clients: z.array(
    z.object({
      contactId: z.string(),
      contactName: z.string(),
      healthScore: z.number().min(0).max(100),
      status: z.enum(['healthy', 'at_risk', 'critical', 'churned']),
      currentRevenue: z.number(),
      previousRevenue: z.number(),
      revenueChangePercent: z.number(),
      issues: z.array(z.string()),
    }),
  ),
  overallHealthScore: z
    .number()
    .min(0)
    .max(100)
    .describe('Aggregate org revenue health'),
})

const anomalyArraySchema = z.object({
  anomalies: z.array(
    z.object({
      type: z.enum([
        'overdue_payment',
        'scope_creep',
        'pricing_dispute',
        'revenue_decline',
        'payment_pattern_change',
      ]),
      severity: z.enum(['low', 'medium', 'high', 'critical']),
      contactId: z.string(),
      contactName: z.string(),
      description: z.string(),
      estimatedImpact: z.number(),
      recommendedAction: z.string(),
    }),
  ),
  totalRevenueAtRisk: z
    .number()
    .describe('Sum of estimated impact across all anomalies'),
})

// ---------------------------------------------------------------------------
// Data Gathering Helpers
// ---------------------------------------------------------------------------

interface MonetarySignal {
  contactId: string
  contactName: string
  eventType: string
  amount: number
  status: string
  occurredAt: string
  channel: string
}

interface InvoiceRecord {
  id: string
  contactId: string
  contactName: string
  total: number
  status: string
  createdAt: string
  dueDate: string | null
  paidDate: string | null
}

/**
 * Query recent monetary signals from the entity timeline.
 * These come from the ingestion pipeline (Track G).
 */
async function queryMonetarySignals(
  config: WorkflowConfig,
): Promise<MonetarySignal[]> {
  const thirtyDaysAgo = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000,
  ).toISOString()

  const { data: events } = await config.supabase
    .from('entity_timeline')
    .select(
      'entity_id, event_type, event_data, channel_source, occurred_at',
    )
    .eq('org_id', config.orgId)
    .eq('entity_type', 'contact')
    .in('event_type', [
      'payment_received',
      'invoice_sent',
      'invoice_overdue',
      'payment_failed',
      'revenue_signal',
    ])
    .gte('occurred_at', thirtyDaysAgo)
    .order('occurred_at', { ascending: false })
    .limit(500)

  if (!events) return []

  // Fetch contact names for the entity IDs
  const contactIds = [...new Set(events.map((e: Record<string, string>) => e.entity_id))]
  const { data: contacts } = await config.supabase
    .from('contacts')
    .select('id, name')
    .eq('org_id', config.orgId)
    .in('id', contactIds)

  const contactMap = new Map(
    (contacts ?? []).map((c: Record<string, string>) => [c.id, c.name as string]),
  )

  return events.map((e: Record<string, unknown>) => {
    const data = (e.event_data ?? {}) as Record<string, unknown>
    return {
      contactId: e.entity_id,
      contactName: contactMap.get(e.entity_id) ?? 'Unknown',
      eventType: e.event_type,
      amount: Number(data.amount ?? 0),
      status: String(data.status ?? e.event_type),
      occurredAt: e.occurred_at,
      channel: e.channel_source ?? 'unknown',
    }
  })
}

/**
 * Fetch invoice records for cross-referencing with monetary signals.
 */
async function queryInvoiceRecords(
  config: WorkflowConfig,
): Promise<InvoiceRecord[]> {
  const { data: invoices } = await config.supabase
    .from('invoices')
    .select(
      'id, client_contact_id, total, status, created_at, due_date, paid_date',
    )
    .eq('org_id', config.orgId)
    .order('created_at', { ascending: false })
    .limit(500)

  if (!invoices) return []

  const contactIds = [
    ...new Set(invoices.map((i: Record<string, unknown>) => i.client_contact_id as string).filter(Boolean)),
  ]
  const { data: contacts } = await config.supabase
    .from('contacts')
    .select('id, name')
    .eq('org_id', config.orgId)
    .in('id', contactIds)

  const contactMap = new Map(
    (contacts ?? []).map((c: Record<string, string>) => [c.id, c.name as string]),
  )

  return invoices.map((i: Record<string, unknown>) => ({
    id: i.id,
    contactId: i.client_contact_id as string,
    contactName: contactMap.get(i.client_contact_id as string) ?? 'Unknown',
    total: Number(i.total ?? 0),
    status: i.status as string,
    createdAt: i.created_at as string,
    dueDate: (i.due_date as string) ?? null,
    paidDate: (i.paid_date as string) ?? null,
  }))
}

// ---------------------------------------------------------------------------
// Main Workflow
// ---------------------------------------------------------------------------

/**
 * Run the revenue health monitoring workflow.
 *
 * Executes a 4-step SEQUENTIAL pipeline:
 * 1. Query monetary signals from ingested data
 * 2. Cross-reference with invoice/payment records
 * 3. Generate per-client health scores via LLM
 * 4. Detect revenue anomalies via LLM
 *
 * @param config - Workflow config with orgId, supabase client, and dryRun flag
 * @returns WorkflowResult containing typed RevenueHealthResult
 */
export async function runRevenueHealth(
  config: WorkflowConfig,
): Promise<WorkflowResult<RevenueHealthResult>> {
  const startTime = Date.now()
  let stepsCompleted = 0
  let tokensEstimate = 0

  try {
    // -----------------------------------------------------------------------
    // Step 1: Query monetary signals
    // -----------------------------------------------------------------------
    const monetarySignals = await queryMonetarySignals(config)
    stepsCompleted += 1

    // -----------------------------------------------------------------------
    // Step 2: Cross-reference with invoices
    // -----------------------------------------------------------------------
    const invoiceRecords = await queryInvoiceRecords(config)
    stepsCompleted += 1

    // Build per-client data summary for LLM analysis
    const clientDataMap = new Map<
      string,
      {
        contactId: string
        contactName: string
        signals: MonetarySignal[]
        invoices: InvoiceRecord[]
      }
    >()

    for (const signal of monetarySignals) {
      if (!clientDataMap.has(signal.contactId)) {
        clientDataMap.set(signal.contactId, {
          contactId: signal.contactId,
          contactName: signal.contactName,
          signals: [],
          invoices: [],
        })
      }
      clientDataMap.get(signal.contactId)!.signals.push(signal)
    }

    for (const invoice of invoiceRecords) {
      if (!invoice.contactId) continue
      if (!clientDataMap.has(invoice.contactId)) {
        clientDataMap.set(invoice.contactId, {
          contactId: invoice.contactId,
          contactName: invoice.contactName,
          signals: [],
          invoices: [],
        })
      }
      clientDataMap.get(invoice.contactId)!.invoices.push(invoice)
    }

    const clientSummaries = Array.from(clientDataMap.values())

    // If no data, return early
    if (clientSummaries.length === 0) {
      return {
        success: true,
        data: {
          clientScores: [],
          anomalies: [],
          overallHealthScore: 100,
          totalRevenueAtRisk: 0,
          clientsAnalyzed: 0,
          analysisPeriod: 'Last 30 days',
        },
        metrics: {
          durationMs: Date.now() - startTime,
          tokensUsed: 0,
          stepsCompleted,
        },
      }
    }

    // -----------------------------------------------------------------------
    // Step 3: Generate per-client health scores via LLM
    // -----------------------------------------------------------------------

    // Use the sequential pattern for the LLM analysis chain
    // We pass the data through the sequential steps as JSON context
    const dataContext = JSON.stringify(
      clientSummaries.map((c) => ({
        contactId: c.contactId,
        contactName: c.contactName,
        signalCount: c.signals.length,
        recentSignals: c.signals.slice(0, 10).map((s) => ({
          type: s.eventType,
          amount: s.amount,
          status: s.status,
          date: s.occurredAt,
        })),
        invoiceCount: c.invoices.length,
        invoices: c.invoices.slice(0, 10).map((i) => ({
          total: i.total,
          status: i.status,
          created: i.createdAt,
          dueDate: i.dueDate,
          paidDate: i.paidDate,
        })),
        totalInvoiced: c.invoices.reduce((sum, i) => sum + i.total, 0),
        overdueInvoices: c.invoices.filter((i) => i.status === 'overdue')
          .length,
        paidInvoices: c.invoices.filter((i) => i.status === 'paid').length,
      })),
      null,
      2,
    )

    // Use sequential workflow to chain health scoring → anomaly detection
    const sequentialResult = await runSequentialWorkflow({
      input: dataContext,
      steps: [
        {
          name: 'health-scoring',
          system:
            'You are a revenue analytics expert for a freelance/agency business. Analyze client revenue data and produce health scores. Consider payment history, overdue invoices, revenue trends, and engagement signals. A healthy client pays on time, has growing or stable revenue, and regular engagement.',
          prompt:
            'Analyze the following client revenue data and produce a health assessment. For each client, assess their financial health status:\n\n{{input}}',
          model: 'balanced',
        },
        {
          name: 'anomaly-detection',
          system:
            'You are a revenue risk analyst. Based on the client data and health assessment, identify anomalies that indicate revenue risk: overdue payments, scope creep signals, pricing disputes, revenue declines, or unusual payment patterns. Be specific about the financial impact and recommended actions.',
          prompt:
            'Based on the health assessment and original client data, identify revenue anomalies and risks:\n\nHealth Assessment:\n{{prev}}\n\nOriginal Data:\n{{input}}',
          model: 'balanced',
        },
      ],
    })

    stepsCompleted += 2
    tokensEstimate += 4000

    // -----------------------------------------------------------------------
    // Step 4: Structure the output via generateObject
    // -----------------------------------------------------------------------

    const { object: healthScores } = await generateObject({
      model: models.fast,
      system:
        'Parse the following revenue health analysis into structured client health scores. Use the contact IDs and names from the data.',
      schema: clientHealthArraySchema,
      prompt: `Parse this health analysis into structured scores:\n\nAnalysis: ${sequentialResult.steps[0]?.output ?? ''}\n\nClient Data: ${dataContext}`,
    })

    stepsCompleted += 1
    tokensEstimate += 1500

    const { object: anomalyResult } = await generateObject({
      model: models.fast,
      system:
        'Parse the following anomaly analysis into structured anomaly records. Use contact IDs and names from the data.',
      schema: anomalyArraySchema,
      prompt: `Parse this anomaly analysis into structured records:\n\nAnalysis: ${sequentialResult.steps[1]?.output ?? ''}\n\nClient Data: ${dataContext}`,
    })

    stepsCompleted += 1
    tokensEstimate += 1500

    const result: RevenueHealthResult = {
      clientScores: healthScores.clients as ClientHealthScore[],
      anomalies: anomalyResult.anomalies as RevenueAnomaly[],
      overallHealthScore: healthScores.overallHealthScore,
      totalRevenueAtRisk: anomalyResult.totalRevenueAtRisk,
      clientsAnalyzed: clientSummaries.length,
      analysisPeriod: 'Last 30 days',
    }

    return {
      success: true,
      data: result,
      metrics: {
        durationMs: Date.now() - startTime,
        tokensUsed: tokensEstimate,
        stepsCompleted,
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      data: {
        clientScores: [],
        anomalies: [],
        overallHealthScore: 0,
        totalRevenueAtRisk: 0,
        clientsAnalyzed: 0,
        analysisPeriod: 'Last 30 days',
      },
      metrics: {
        durationMs: Date.now() - startTime,
        tokensUsed: tokensEstimate,
        stepsCompleted,
      },
      error: message,
    }
  }
}