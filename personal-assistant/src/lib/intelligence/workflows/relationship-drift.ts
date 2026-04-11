/**
 * Relationship Drift Detector — Intelligence Workflow
 *
 * Uses the EVALUATOR WDK pattern to detect statistically significant
 * changes in relationship health over time.
 *
 * The evaluator loop:
 *
 * 1. GENERATE: Aggregate relationship signals per contact across
 *    7-day, 30-day, and 90-day time windows (messages, meetings,
 *    sentiment, engagement metrics)
 *
 * 2. EVALUATE: Assess whether there is a statistically significant
 *    change in sentiment or engagement. Score drift severity and
 *    direction (improving / stable / declining / critical).
 *
 * 3. IMPROVE (if needed): If the initial assessment has low confidence,
 *    re-analyze with additional context for a more accurate drift score.
 *
 * 4. Output: Recommended action if drift is detected, with severity
 *    and confidence scores.
 *
 * @module intelligence/workflows/relationship-drift
 */

import { z } from 'zod'
import { generateText, Output } from 'ai'
import { models } from '@/lib/ai'
import { runEvaluatorWorkflow } from '@/lib/workflows/patterns'
import type {
  WorkflowResult,
  WorkflowConfig,
  DriftResult,
  WindowSignals,
  DriftAssessment,
} from './types'

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

const driftEvaluationSchema = z.object({
  qualityScore: z
    .number()
    .min(1)
    .max(10)
    .describe('Quality of the drift analysis (1=poor, 10=excellent)'),
  driftDetected: z.boolean().describe('Whether significant drift was detected'),
  severity: z.number().min(0).max(100).describe('Drift severity score'),
  direction: z
    .enum(['improving', 'stable', 'declining', 'critical'])
    .describe('Direction of the relationship drift'),
  factors: z
    .array(z.string())
    .describe('Key factors contributing to the drift assessment'),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe('Confidence in the assessment'),
  issues: z
    .array(z.string())
    .describe('Issues with the analysis that could be improved'),
  suggestedAction: z
    .string()
    .describe('Recommended action based on the drift analysis'),
})

type DriftEvaluation = z.infer<typeof driftEvaluationSchema>

const actionRecommendationSchema = z.object({
  action: z
    .string()
    .describe('Specific recommended action to take'),
  urgency: z
    .enum(['immediate', 'this_week', 'this_month', 'no_action'])
    .describe('How urgently the action should be taken'),
  reasoning: z
    .string()
    .describe('Why this action is recommended'),
})

// ---------------------------------------------------------------------------
// Data Gathering
// ---------------------------------------------------------------------------

interface TimeWindowData {
  window: '7d' | '30d' | '90d'
  daysBack: number
  events: Array<{
    eventType: string
    eventData: Record<string, unknown>
    channelSource: string
    occurredAt: string
  }>
}

/**
 * Gather relationship signals for a contact across multiple time windows.
 */
async function gatherSignals(
  contactId: string,
  config: WorkflowConfig,
): Promise<{ contactName: string; windows: TimeWindowData[] }> {
  const now = new Date()
  const windowDefs: Array<{ window: '7d' | '30d' | '90d'; daysBack: number }> = [
    { window: '7d', daysBack: 7 },
    { window: '30d', daysBack: 30 },
    { window: '90d', daysBack: 90 },
  ]

  // Get contact name
  const { data: contact } = await config.supabase
    .from('contacts')
    .select('name')
    .eq('id', contactId)
    .eq('org_id', config.orgId)
    .single()

  const contactName = (contact?.name as string) ?? 'Unknown'

  // Fetch all events for the widest window (90d), then filter per window
  const ninetyDaysAgo = new Date(
    now.getTime() - 90 * 24 * 60 * 60 * 1000,
  ).toISOString()

  const { data: allEvents } = await config.supabase
    .from('entity_timeline')
    .select('event_type, event_data, channel_source, occurred_at')
    .eq('org_id', config.orgId)
    .eq('entity_type', 'contact')
    .eq('entity_id', contactId)
    .gte('occurred_at', ninetyDaysAgo)
    .order('occurred_at', { ascending: false })
    .limit(500)

  const events = allEvents ?? []

  const windows: TimeWindowData[] = windowDefs.map((def) => {
    const cutoff = new Date(
      now.getTime() - def.daysBack * 24 * 60 * 60 * 1000,
    )
    return {
      window: def.window,
      daysBack: def.daysBack,
      events: events
        .filter((e: Record<string, string>) => new Date(e.occurred_at) >= cutoff)
        .map((e: Record<string, unknown>) => ({
          eventType: e.event_type as string,
          eventData: (e.event_data ?? {}) as Record<string, unknown>,
          channelSource: (e.channel_source as string) ?? 'unknown',
          occurredAt: e.occurred_at as string,
        })),
    }
  })

  return { contactName, windows }
}

/**
 * Compute window signal aggregates from raw event data.
 */
function computeWindowSignals(windowData: TimeWindowData): WindowSignals {
  const events = windowData.events

  const messagesSent = events.filter(
    (e) => e.eventType === 'message_sent',
  ).length
  const messagesReceived = events.filter(
    (e) => e.eventType === 'message_received',
  ).length
  const meetings = events.filter(
    (e) =>
      e.eventType === 'task_created' &&
      (e.eventData as Record<string, unknown>).type === 'meeting',
  ).length

  // Compute average sentiment from events that have sentiment data
  const sentimentEvents = events.filter(
    (e) => typeof (e.eventData as Record<string, unknown>).sentiment === 'number',
  )
  const avgSentiment =
    sentimentEvents.length > 0
      ? sentimentEvents.reduce(
          (sum, e) =>
            sum +
            Number((e.eventData as Record<string, unknown>).sentiment ?? 0),
          0,
        ) / sentimentEvents.length
      : 0

  return {
    window: windowData.window,
    messagesSent,
    messagesReceived,
    meetings,
    avgSentiment: Math.round(avgSentiment * 100) / 100,
    totalInteractions: messagesSent + messagesReceived + meetings,
  }
}

// ---------------------------------------------------------------------------
// Main Workflow
// ---------------------------------------------------------------------------

/**
 * Run the relationship drift detector workflow.
 *
 * Uses the EVALUATOR pattern to iteratively assess relationship drift:
 * - Generates an initial drift analysis from aggregated signal data
 * - Evaluates the quality/confidence of the analysis
 * - Improves the analysis if confidence is too low
 * - Produces a final drift assessment with recommended actions
 *
 * @param contactId - Contact ID to analyze for drift
 * @param config - Workflow config with orgId, supabase client, and dryRun flag
 * @returns WorkflowResult containing typed DriftResult
 */
export async function runRelationshipDrift(
  contactId: string,
  config: WorkflowConfig,
): Promise<WorkflowResult<DriftResult>> {
  const startTime = Date.now()
  let stepsCompleted = 0
  let tokensEstimate = 0

  try {
    // -----------------------------------------------------------------------
    // Step 1: Gather and aggregate signals
    // -----------------------------------------------------------------------
    const { contactName, windows } = await gatherSignals(contactId, config)
    const windowSignals = windows.map(computeWindowSignals)
    stepsCompleted += 1

    // Build analysis input for the evaluator
    const signalSummary = JSON.stringify(
      {
        contactId,
        contactName,
        signals: windowSignals,
        rawEventCounts: {
          '7d': windows.find((w) => w.window === '7d')?.events.length ?? 0,
          '30d': windows.find((w) => w.window === '30d')?.events.length ?? 0,
          '90d': windows.find((w) => w.window === '90d')?.events.length ?? 0,
        },
      },
      null,
      2,
    )

    // -----------------------------------------------------------------------
    // Step 2: Run evaluator workflow for drift assessment
    // -----------------------------------------------------------------------
    const evaluatorResult = await runEvaluatorWorkflow<DriftEvaluation>({
      input: signalSummary,

      // Initial generation: analyze the signals for drift
      generatorSystem:
        'You are a relationship analytics expert. Analyze communication signal data across time windows (7-day, 30-day, 90-day) to detect drift in relationship health. Look for: declining message frequency, reduced reciprocity, fewer meetings, sentiment changes, and engagement drops. Compare recent (7d) trends against longer baselines (30d, 90d) to detect statistically significant changes.',
      generatorPrompt:
        'Analyze the following relationship signal data for drift patterns. Compare the 7-day window against 30-day and 90-day baselines. Identify whether the relationship is improving, stable, declining, or critical:\n\n{{input}}',
      generatorModel: 'balanced',

      // Evaluation: check quality and confidence of the analysis
      evaluationSchema: driftEvaluationSchema,
      evaluatorSystem:
        'You are a quality assurance analyst for relationship intelligence. Evaluate drift analyses for accuracy, completeness, and actionability. Score the quality and extract structured drift metrics.',
      evaluationPrompt:
        'Evaluate this relationship drift analysis for quality, accuracy, and actionability. Extract structured drift metrics:\n\nOriginal Signal Data:\n{{input}}\n\nDrift Analysis:\n{{output}}',
      evaluatorModel: 'balanced',

      // Accept if quality is 7+ (good enough confidence)
      isAcceptable: (evaluation: DriftEvaluation) =>
        evaluation.qualityScore >= 7 && evaluation.confidence >= 0.6,

      // Improvement: refine the analysis with feedback
      improvementPrompt:
        'Improve this drift analysis based on the evaluation feedback. The evaluation found these issues: {{evaluation}}\n\nOriginal signal data:\n{{input}}\n\nCurrent analysis:\n{{output}}\n\nPlease address the issues and provide a more accurate, higher-confidence drift assessment.',
      improverModel: 'balanced',

      maxIterations: 2,
    })

    stepsCompleted += evaluatorResult.iterations
    tokensEstimate += evaluatorResult.iterations * 2000

    // Extract the best evaluation from history
    const bestEvaluation =
      evaluatorResult.history[evaluatorResult.history.length - 1]?.evaluation

    // -----------------------------------------------------------------------
    // Step 3: Generate recommended action if drift detected
    // -----------------------------------------------------------------------
    let recommendedAction: string | undefined

    if (bestEvaluation?.driftDetected) {
      const { output: actionRec } = await generateText({
        model: models.fast,
        system:
          'You are a relationship management advisor. Based on the drift analysis, recommend a specific, actionable next step to address the relationship drift.',
        output: Output.object({ schema: actionRecommendationSchema }),
        prompt: `Based on this drift analysis, recommend a specific action:\n\nContact: ${contactName}\nDrift Direction: ${bestEvaluation.direction}\nSeverity: ${bestEvaluation.severity}/100\nFactors: ${bestEvaluation.factors.join(', ')}\n\nFull Analysis:\n${evaluatorResult.output}`,
      })

      if (!actionRec) throw new Error('Action recommendation returned null')

      recommendedAction = `[${actionRec.urgency.toUpperCase()}] ${actionRec.action} — ${actionRec.reasoning}`
      stepsCompleted += 1
      tokensEstimate += 500
    }

    // Build final result
    const assessment: DriftAssessment = bestEvaluation
      ? {
          driftDetected: bestEvaluation.driftDetected,
          severity: bestEvaluation.severity,
          direction: bestEvaluation.direction,
          factors: bestEvaluation.factors,
          confidence: bestEvaluation.confidence,
        }
      : {
          driftDetected: false,
          severity: 0,
          direction: 'stable',
          factors: ['Insufficient data for drift analysis'],
          confidence: 0,
        }

    const result: DriftResult = {
      contactId,
      contactName,
      signals: windowSignals,
      assessment,
      recommendedAction,
      comparisonSummary: evaluatorResult.output,
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
        contactId,
        contactName: 'Unknown',
        signals: [],
        assessment: {
          driftDetected: false,
          severity: 0,
          direction: 'stable',
          factors: [`Analysis failed: ${message}`],
          confidence: 0,
        },
        comparisonSummary: `Analysis failed: ${message}`,
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