/**
 * Intelligence Workflow Types
 *
 * Shared types used across all intelligence workflows built on WDK patterns.
 * Each workflow returns a WorkflowResult<T> with typed data, success status,
 * and execution metrics (duration, tokens, steps completed).
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Core Workflow Types
// ---------------------------------------------------------------------------

/**
 * Standard result wrapper for all intelligence workflows.
 * Provides consistent structure for success/failure, typed data,
 * and execution metrics for monitoring and billing.
 */
export interface WorkflowResult<T> {
  /** Whether the workflow completed successfully */
  success: boolean
  /** Typed workflow output data */
  data: T
  /** Execution metrics for monitoring and billing */
  metrics: {
    /** Total wall-clock duration in milliseconds */
    durationMs: number
    /** Estimated token usage across all LLM calls */
    tokensUsed: number
    /** Number of workflow steps that completed */
    stepsCompleted: number
  }
  /** Error message if success is false */
  error?: string
}

/**
 * Standard configuration passed to all intelligence workflows.
 * Provides org context, database access, and optional dry-run mode.
 */
export interface WorkflowConfig {
  /** Organization ID scoping all queries */
  orgId: string
  /** Supabase client for database access */
  supabase: SupabaseClient
  /** When true, skip writes and return what would have been done */
  dryRun?: boolean
}

// ---------------------------------------------------------------------------
// Lead Research Result Types
// ---------------------------------------------------------------------------

/** Scored lead fit based on company/industry analysis */
export interface LeadFitScore {
  /** Overall fit score 0-100 */
  score: number
  /** Fit assessment */
  assessment: 'excellent' | 'good' | 'moderate' | 'poor'
  /** Reasoning for the score */
  reasoning: string
  /** Key signals that contributed to the score */
  signals: string[]
}

/** Enriched company information for a lead */
export interface CompanyInfo {
  /** Company name */
  name: string
  /** Industry vertical */
  industry: string
  /** Estimated company size */
  estimatedSize: 'startup' | 'small' | 'medium' | 'large' | 'enterprise'
  /** Key facts discovered about the company */
  keyFacts: string[]
  /** Potential needs or pain points */
  potentialNeeds: string[]
}

/** Draft outreach message for initial contact */
export interface OutreachDraft {
  /** Email subject line */
  subject: string
  /** Email body text */
  body: string
  /** Personalization hooks used */
  personalizationHooks: string[]
  /** Suggested send timing */
  suggestedTiming: string
}

/** Existing contact match from the database */
export interface ExistingContactMatch {
  /** Whether a matching contact was found */
  found: boolean
  /** Contact ID if found */
  contactId?: string
  /** Contact name if found */
  contactName?: string
  /** Relationship strength if found */
  relationshipStrength?: number
  /** Previous interaction summary */
  previousInteractions?: string
}

/** Complete result from the lead research workflow */
export interface LeadResearchResult {
  /** Lead information as provided */
  lead: {
    name: string
    email?: string
    company?: string
    source: string
  }
  /** Company information gathered */
  companyInfo: CompanyInfo
  /** Existing contact match check */
  existingContact: ExistingContactMatch
  /** Lead fit score */
  fitScore: LeadFitScore
  /** Draft outreach message */
  outreachDraft: OutreachDraft
  /** Summary of all research */
  summary: string
}

// ---------------------------------------------------------------------------
// Revenue Health Result Types
// ---------------------------------------------------------------------------

/** Per-client health assessment */
export interface ClientHealthScore {
  /** Client contact ID */
  contactId: string
  /** Client name */
  contactName: string
  /** Health score 0-100 */
  healthScore: number
  /** Health status */
  status: 'healthy' | 'at_risk' | 'critical' | 'churned'
  /** Revenue in current period */
  currentRevenue: number
  /** Revenue in previous period */
  previousRevenue: number
  /** Revenue change percentage */
  revenueChangePercent: number
  /** Detected issues */
  issues: string[]
}

/** Detected revenue anomaly */
export interface RevenueAnomaly {
  /** Anomaly type */
  type: 'overdue_payment' | 'scope_creep' | 'pricing_dispute' | 'revenue_decline' | 'payment_pattern_change'
  /** Severity level */
  severity: 'low' | 'medium' | 'high' | 'critical'
  /** Client contact ID */
  contactId: string
  /** Client name */
  contactName: string
  /** Human-readable description */
  description: string
  /** Estimated financial impact */
  estimatedImpact: number
  /** Recommended action */
  recommendedAction: string
}

/** Complete result from the revenue health workflow */
export interface RevenueHealthResult {
  /** Per-client health scores */
  clientScores: ClientHealthScore[]
  /** Detected anomalies */
  anomalies: RevenueAnomaly[]
  /** Overall org revenue health score 0-100 */
  overallHealthScore: number
  /** Total revenue at risk */
  totalRevenueAtRisk: number
  /** Number of clients analyzed */
  clientsAnalyzed: number
  /** Analysis period description */
  analysisPeriod: string
}

// ---------------------------------------------------------------------------
// Relationship Drift Result Types
// ---------------------------------------------------------------------------

/** Signal aggregate for a time window */
export interface WindowSignals {
  /** Time window label */
  window: '7d' | '30d' | '90d'
  /** Number of messages sent */
  messagesSent: number
  /** Number of messages received */
  messagesReceived: number
  /** Number of meetings */
  meetings: number
  /** Average sentiment score (-1 to 1) */
  avgSentiment: number
  /** Total interactions */
  totalInteractions: number
}

/** Drift assessment result */
export interface DriftAssessment {
  /** Whether statistically significant drift was detected */
  driftDetected: boolean
  /** Drift severity 0-100 */
  severity: number
  /** Drift direction */
  direction: 'improving' | 'stable' | 'declining' | 'critical'
  /** Key factors contributing to drift */
  factors: string[]
  /** Confidence in the assessment 0-1 */
  confidence: number
}

/** Complete result from the relationship drift workflow */
export interface DriftResult {
  /** Contact ID analyzed */
  contactId: string
  /** Contact name */
  contactName: string
  /** Signal aggregates by time window */
  signals: WindowSignals[]
  /** Drift assessment */
  assessment: DriftAssessment
  /** Recommended action if drift detected */
  recommendedAction?: string
  /** Historical comparison summary */
  comparisonSummary: string
}

// ---------------------------------------------------------------------------
// Meeting Intelligence Result Types
// ---------------------------------------------------------------------------

/** Classification of a meeting */
export interface MeetingClassification {
  /** Meeting type */
  type: 'sales' | 'project' | 'internal' | 'support'
  /** Confidence in classification 0-1 */
  confidence: number
  /** Key topics discussed */
  keyTopics: string[]
}

/** A decision extracted from a meeting */
export interface MeetingDecision {
  /** What was decided */
  decision: string
  /** Who made/approved the decision */
  decidedBy: string[]
  /** Context or rationale */
  context: string
  /** Impact level */
  impact: 'low' | 'medium' | 'high'
}

/** An action item extracted from a meeting */
export interface MeetingActionItem {
  /** Description of the action */
  action: string
  /** Person responsible */
  owner: string
  /** Due date if mentioned */
  dueDate?: string
  /** Priority level */
  priority: 'low' | 'medium' | 'high'
  /** Status */
  status: 'new' | 'in_progress' | 'blocked'
}

/** A commitment or promise made during the meeting */
export interface MeetingCommitment {
  /** What was committed/promised */
  commitment: string
  /** Who made the commitment */
  madeBy: string
  /** Who it was made to */
  madeTo: string
  /** Deadline if mentioned */
  deadline?: string
  /** Type of commitment */
  type: 'deliverable' | 'timeline' | 'budget' | 'resource' | 'other'
}

/** Relationship dynamics assessment between participants */
export interface RelationshipDynamics {
  /** Overall meeting tone */
  overallTone: 'positive' | 'neutral' | 'tense' | 'negative'
  /** Key dynamics observed */
  dynamics: string[]
  /** Power/influence observations */
  influenceNotes: string[]
  /** Engagement level per participant */
  participantEngagement: Array<{
    participant: string
    engagementLevel: 'high' | 'medium' | 'low'
    role: string
  }>
}

/** Complete result from the meeting intelligence workflow */
export interface MeetingIntelResult {
  /** Meeting classification */
  classification: MeetingClassification
  /** Decisions extracted */
  decisions: MeetingDecision[]
  /** Action items extracted */
  actionItems: MeetingActionItem[]
  /** Commitments and promises */
  commitments: MeetingCommitment[]
  /** Relationship dynamics */
  relationshipDynamics: RelationshipDynamics
  /** Executive summary */
  executiveSummary: string
  /** Participant list */
  participants: string[]
}

// ---------------------------------------------------------------------------
// Workflow Registry Types
// ---------------------------------------------------------------------------

/** Available workflow names */
export type WorkflowName =
  | 'lead-research'
  | 'revenue-health'
  | 'relationship-drift'
  | 'meeting-intel'

/** How a workflow can be triggered */
export type WorkflowTrigger = 'cron' | 'event' | 'manual'

/** Workflow registry entry */
export interface WorkflowRegistryEntry {
  /** Workflow name */
  name: WorkflowName
  /** Human-readable description */
  description: string
  /** How this workflow is triggered */
  triggers: WorkflowTrigger[]
  /** Cron schedule if applicable */
  cronSchedule?: string
  /** Event types that trigger this workflow */
  eventTypes?: string[]
  /** WDK pattern used */
  pattern: 'parallel' | 'sequential' | 'evaluator' | 'orchestrator'
}
