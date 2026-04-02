/**
 * Proactive Agent Layer — Type Definitions
 *
 * Types for the decision engine that determines when BitBit should act
 * autonomously without being asked. Sits on top of Track H intelligence
 * workflows and Track G channel ingestion.
 *
 * @module proactive/types
 */

// ---------------------------------------------------------------------------
// Signal Types
// ---------------------------------------------------------------------------

/**
 * A proactive signal is an atomic piece of intelligence gathered from
 * channels, crons, or intelligence workflows that may warrant action.
 */
export interface ProactiveSignal {
  /** Signal category (e.g., 'invoice_overdue', 'lead_hot', 'sentiment_negative') */
  type: string
  /** Origin system (e.g., 'email_ingestion', 'whatsapp', 'crm_sync', 'urgency_scorer') */
  source: string
  /** How severe/important is this signal? */
  severity: 'critical' | 'high' | 'medium' | 'low'
  /** Arbitrary payload — entity IDs, amounts, text snippets, etc. */
  data: Record<string, unknown>
  /** ISO-8601 timestamp of when the signal was generated */
  timestamp: string
}

// ---------------------------------------------------------------------------
// Action Types
// ---------------------------------------------------------------------------

/** The set of autonomous actions BitBit can take proactively. */
export type ProactiveActionType =
  | 'alert_user'
  | 'draft_message'
  | 'create_task'
  | 'update_contact'
  | 'flag_risk'
  | 'suggest_opportunity'
  | 'send_digest'
  | 'none'

/** Channel through which the proactive action is delivered. */
export type DeliveryChannel =
  | 'chat_whisper'
  | 'email_digest'
  | 'push_notification'
  | 'whatsapp'
  | 'sms'

// ---------------------------------------------------------------------------
// Decision Types
// ---------------------------------------------------------------------------

/**
 * The output of the classifier: should BitBit act, and how?
 */
export interface ProactiveDecision {
  /** Whether the engine decided to take action */
  shouldAct: boolean
  /** What kind of action to take */
  action: ProactiveActionType
  /** Confidence score 0-1 from the LLM classifier */
  confidence: number
  /** Human-readable explanation of why this decision was made */
  reasoning: string
  /** How soon should this be acted on? */
  urgency: 'immediate' | 'today' | 'this_week' | 'whenever'
  /** Preferred delivery channel (optional — executor may override) */
  channel?: DeliveryChannel
  /** Mapped autonomy level: 1=always ask, 2=propose, 3=notify, 4=silent */
  autonomyLevel: 1 | 2 | 3 | 4
}

// ---------------------------------------------------------------------------
// Execution Types
// ---------------------------------------------------------------------------

/** Status of a proactive action through its lifecycle. */
export type ProactiveActionStatus =
  | 'pending'
  | 'approved'
  | 'executed'
  | 'rejected'
  | 'expired'

/**
 * A fully materialised proactive action — the decision plus execution state.
 */
export interface ProactiveAction {
  /** Unique identifier for this action */
  id: string
  /** The decision that triggered this action */
  decision: ProactiveDecision
  /** Current lifecycle status */
  status: ProactiveActionStatus
  /** Action-specific payload (e.g., draft text, task details, contact update) */
  payload: Record<string, unknown>
  /** Org this action belongs to */
  orgId: string
  /** When the action was created */
  createdAt: string
}

// ---------------------------------------------------------------------------
// Configuration Types
// ---------------------------------------------------------------------------

/**
 * Per-org configuration for the proactive engine.
 * Read from the organisations table settings.
 */
export interface OrgProactiveConfig {
  /** Whether proactive intelligence is enabled for this org */
  enabled: boolean
  /** Maximum proactive actions per hour to avoid alert fatigue */
  maxActionsPerHour: number
  /** Minimum confidence to act at L3/L4 */
  minConfidenceForAutoAction: number
  /** Minimum confidence to suggest at L1/L2 */
  minConfidenceForSuggestion: number
  /** Autonomy overrides from the org */
  autonomyOverrides?: Record<string, string>
}

/**
 * Configuration passed to the executor.
 */
export interface ExecutionConfig {
  orgId: string
  agentConfigId: string
  notifyPhone?: string
  notifyEmail?: string
}

/**
 * Result of executing a proactive action.
 */
export interface ExecutionResult {
  success: boolean
  actionId: string
  status: ProactiveActionStatus
  details?: Record<string, unknown>
  error?: string
}
