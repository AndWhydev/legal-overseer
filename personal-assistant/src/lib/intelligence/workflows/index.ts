/**
 * Intelligence Workflows — Registry & Barrel Export
 *
 * Four automated intelligence workflows built on WDK patterns:
 *
 * 1. **Lead Research** (PARALLEL + SEQUENTIAL): Research new leads with
 *    concurrent company analysis, contact matching, and fit scoring,
 *    followed by sequential enrichment and outreach drafting.
 *
 * 2. **Revenue Health** (SEQUENTIAL): Monitor revenue health across all
 *    clients with a 4-step pipeline: signal query → invoice cross-ref →
 *    health scoring → anomaly detection.
 *
 * 3. **Relationship Drift** (EVALUATOR): Detect significant changes in
 *    relationship health using an evaluate→improve loop across 7d/30d/90d
 *    signal windows.
 *
 * 4. **Meeting Intelligence** (ORCHESTRATOR): Extract structured meeting
 *    intelligence with a planner that classifies meetings and dispatches
 *    concurrent workers for decisions, action items, commitments, and
 *    relationship dynamics.
 *
 * @module intelligence/workflows
 */

// ---------------------------------------------------------------------------
// Workflow exports
// ---------------------------------------------------------------------------

export { runLeadResearch } from './lead-research'
export { runRevenueHealth } from './revenue-health'
export { runRelationshipDrift } from './relationship-drift'
export { runMeetingIntel } from './meeting-intel'

// ---------------------------------------------------------------------------
// Type exports
// ---------------------------------------------------------------------------

export type {
  // Core types
  WorkflowResult,
  WorkflowConfig,
  WorkflowName,
  WorkflowTrigger,
  WorkflowRegistryEntry,

  // Lead Research types
  LeadResearchResult,
  LeadFitScore,
  CompanyInfo,
  OutreachDraft,
  ExistingContactMatch,

  // Revenue Health types
  RevenueHealthResult,
  ClientHealthScore,
  RevenueAnomaly,

  // Relationship Drift types
  DriftResult,
  DriftAssessment,
  WindowSignals,

  // Meeting Intel types
  MeetingIntelResult,
  MeetingClassification,
  MeetingDecision,
  MeetingActionItem,
  MeetingCommitment,
  RelationshipDynamics,
} from './types'

// ---------------------------------------------------------------------------
// Workflow Registry
// ---------------------------------------------------------------------------

import type { WorkflowName, WorkflowRegistryEntry } from './types'

/**
 * Registry of all intelligence workflows.
 *
 * Used by the cron scheduler and event router to trigger workflows
 * based on their configured triggers (cron schedule, event types,
 * or manual invocation).
 *
 * @example
 * ```ts
 * // Find all workflows triggered by a specific event
 * const eventWorkflows = Array.from(workflowRegistry.values())
 *   .filter(w => w.triggers.includes('event') &&
 *     w.eventTypes?.includes('lead.created'))
 *
 * // Find all cron-triggered workflows
 * const cronWorkflows = Array.from(workflowRegistry.values())
 *   .filter(w => w.triggers.includes('cron'))
 * ```
 */
export const workflowRegistry = new Map<WorkflowName, WorkflowRegistryEntry>([
  [
    'lead-research',
    {
      name: 'lead-research',
      description:
        'Research new leads with concurrent company analysis, contact matching, fit scoring, and outreach drafting',
      triggers: ['event', 'manual'],
      eventTypes: ['lead.created', 'contact.created', 'ingestion.new_contact'],
      pattern: 'parallel',
    },
  ],
  [
    'revenue-health',
    {
      name: 'revenue-health',
      description:
        'Monitor revenue health across all clients: signal query, invoice cross-reference, health scoring, and anomaly detection',
      triggers: ['cron', 'manual'],
      cronSchedule: '0 6 * * *', // Daily at 6am
      pattern: 'sequential',
    },
  ],
  [
    'relationship-drift',
    {
      name: 'relationship-drift',
      description:
        'Detect significant changes in relationship health using evaluator loop across 7d/30d/90d signal windows',
      triggers: ['cron', 'event', 'manual'],
      cronSchedule: '0 7 * * 1', // Weekly on Monday at 7am
      eventTypes: [
        'relationship.score_updated',
        'contact.activity_detected',
      ],
      pattern: 'evaluator',
    },
  ],
  [
    'meeting-intel',
    {
      name: 'meeting-intel',
      description:
        'Extract structured meeting intelligence: decisions, action items, commitments, and relationship dynamics',
      triggers: ['event', 'manual'],
      eventTypes: [
        'meeting.transcript_ready',
        'ingestion.meeting_recorded',
        'calendar.meeting_ended',
      ],
      pattern: 'orchestrator',
    },
  ],
])
