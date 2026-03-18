/**
 * Core types for the BitBit platform.
 * All database-backed entities and shared interfaces.
 */

// --- Organizations ---

export interface Organization {
  id: string
  name: string
  slug: string
  plan: 'free' | 'pro' | 'enterprise'
  settings: OrgSettings
  created_at: string
  updated_at: string
}

export interface OrgSettings {
  confidence_thresholds?: ConfidenceThresholds
  notification_channels?: string[]
  timezone?: string
  branding?: {
    logo_url?: string
    primary_color?: string
    company_name?: string
  }
}

// --- Model Routing ---

export interface ConfidenceThresholds {
  act: number    // >= this → auto-execute (default: 0.80)
  ask: number    // >= this → request approval (default: 0.50)
  // below ask → escalate
}

export type ConfidenceDecision = 'act' | 'ask' | 'escalate'

// --- Contacts ---

export interface Contact {
  id: string
  org_id: string
  slug: string
  name: string
  type: 'client' | 'personal' | 'vendor' | 'partner' | 'lead'
  emails: string[]
  phones: string[]
  aliases: string[]
  profile_data: Record<string, unknown>
  communication_patterns: CommunicationPatterns
  lead_score?: 'hot' | 'warm' | 'cold'
  lifetime_value?: number
  last_interaction_at?: string
  preferred_channel?: string
  voice_profile_id?: string
  tags: string[]
  created_at: string
  updated_at: string
}

export interface CommunicationPatterns {
  tone?: string
  formality?: string
  response_speed?: string
  preferred_channel?: string
  typical_topics?: string[]
  greeting_style?: string
  sign_off_style?: string
}

// --- Leads ---

export type LeadStatus = 'new' | 'qualified' | 'booked' | 'converted' | 'lost'
export type LeadScore = 'hot' | 'warm' | 'cold'

export interface Lead {
  id: string
  org_id: string
  source_channel: string
  source_detail?: string
  contact_id?: string
  status: LeadStatus
  score: LeadScore
  budget_range?: string
  service_interest?: string[]
  qualified_at?: string
  converted_at?: string
  notes?: string
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

// --- Invoices ---

export type InvoiceStatus = 'draft' | 'sent' | 'viewed' | 'overdue' | 'paid' | 'cancelled'

export interface InvoiceLineItem {
  description: string
  quantity: number
  unit_price: number
  total: number
}

export interface Invoice {
  id: string
  org_id: string
  invoice_number: string
  client_contact_id: string
  status: InvoiceStatus
  items: InvoiceLineItem[]
  subtotal: number
  tax: number
  total: number
  currency: string
  issued_date: string
  due_date: string
  paid_date?: string
  payment_method?: string
  stripe_payment_link?: string
  pdf_url?: string
  sent_via?: string
  reminder_count: number
  created_at: string
  updated_at: string
}

// --- Proposals ---

export type ProposalStatus = 'draft' | 'sent' | 'viewed' | 'accepted' | 'declined' | 'expired'

export interface ProposalTier {
  name: string
  price: number
  description: string
  inclusions: string[]
  exclusions: string[]
  recommended: boolean
}

export interface Proposal {
  id: string
  org_id: string
  client_contact_id: string
  title: string
  status: ProposalStatus
  tiers: ProposalTier[]
  selected_tier?: string
  pdf_url?: string
  sent_at?: string
  viewed_at?: string
  responded_at?: string
  follow_up_count: number
  notes?: string
  version: number
  created_at: string
  updated_at: string
}

// --- Agent System ---

export type AgentType =
  | 'lead-swarm'
  | 'invoice-flow'
  | 'channel-triage'
  | 'client-comms'
  | 'proposal-bot'
  | 'ad-script-gen'
  | 'client-onboarding'
  | 'ai-search-optimizer'
  | 'tender-hunter'
  | 'sentry'

export interface AgentConfig {
  id: string
  org_id: string
  agent_type: AgentType
  name: string
  description: string
  enabled: boolean
  policy_rules: Record<string, unknown>
  channel_access: string[]
  model_purpose_override?: string
  confidence_thresholds?: ConfidenceThresholds
  notification_config: NotificationConfig
  schedule?: AgentSchedule
  created_at: string
  updated_at: string
}

export interface NotificationConfig {
  channels: string[]          // 'whatsapp', 'email', 'sms', 'dashboard'
  targets: string[]           // user IDs or phone numbers
  escalation_delay_minutes: number
}

export interface AgentSchedule {
  type: 'continuous' | 'interval' | 'cron'
  interval_seconds?: number
  cron_expression?: string
  active_hours?: { start: string; end: string }
}

export interface AgentRun {
  id: string
  org_id: string
  agent_config_id: string
  trigger_type: 'scheduled' | 'webhook' | 'manual' | 'watch'
  input_summary: string
  output_summary: string
  actions_taken: AgentAction[]
  tools_called: string[]
  model_used: string
  tokens_in: number
  tokens_out: number
  confidence_score: number
  routing_decision: ConfidenceDecision
  duration_ms: number
  error?: string
  approved_by?: string
  approved_at?: string
  created_at: string
}

export interface AgentAction {
  type: string
  description: string
  target?: string
  result: string
  confidence: number
}

// --- Sentry Watches ---

export type WatchStatus = 'active' | 'paused' | 'triggered' | 'expired'

export interface Watch {
  id: string
  org_id: string
  agent_config_id?: string
  watch_type: string
  description: string
  channel: string
  conditions: Record<string, unknown>
  interval_seconds: number
  last_checked_at?: string
  status: WatchStatus
  notification_targets: NotificationConfig
  created_at: string
  updated_at: string
}

// --- Agent Registry Entry ---

export interface AgentRegistryEntry {
  definition: import('./agent-registry').AgentDefinition
  config: AgentConfig
  registered_at: Date
}

// --- Voice Profiles ---

export interface VoiceProfile {
  id: string
  org_id: string
  name: string
  description: string
  tone: string
  formality: 'casual' | 'professional' | 'formal'
  greeting_patterns: string[]
  sign_off_patterns: string[]
  emoji_usage: 'none' | 'minimal' | 'moderate' | 'heavy'
  example_messages: Record<string, string>
  do_patterns: string[]
  dont_patterns: string[]
}

// --- Templates ---

export interface Template {
  id: string
  org_id: string
  name: string
  category: 'email' | 'proposal' | 'invoice' | 'onboarding' | 'follow-up' | 'notification'
  subject_template?: string
  body_template: string
  voice_profile?: string
  channel?: string
  variables: Record<string, string>
  usage_count: number
}

// --- Offer Packages ---

export type OfferStatus = 'active' | 'draft' | 'archived'

export interface OfferPackage {
  id: string
  org_id: string
  name: string
  description: string
  service_type: string
  price_range: string
  inclusions: string[]
  exclusions: string[]
  usp: string[]
  target_audience: string
  status: OfferStatus
}

// --- Channel System ---

export type ChannelType = 'gmail' | 'outlook' | 'imessage' | 'whatsapp' | 'asana' | 'calendly' | 'clickup' | 'stripe' | 'calendar' | 'reminders' | 'facebook' | 'instagram' | 'slack'

export interface ChannelMessage {
  id: string
  channel: ChannelType
  direction: 'inbound' | 'outbound'
  sender: string
  recipient?: string
  subject?: string
  body: string
  timestamp: string
  is_actionable: boolean
  priority: 'critical' | 'high' | 'medium' | 'low'
  contact_id?: string
  metadata: Record<string, unknown>
}

export interface ChannelAdapter {
  type: ChannelType
  name: string
  description: string
  pull: (config: Record<string, unknown>, since?: string) => Promise<ChannelMessage[]>
  send?: (message: Omit<ChannelMessage, 'id' | 'timestamp'>) => Promise<{ success: boolean; id?: string }>
  isAvailable: () => boolean
}

// --- Role System ---

export type RoleType = 'finance' | 'comms' | 'sales'
export type AutonomyLevel = 'observer' | 'copilot' | 'autopilot'

export interface RoleConfig {
  id: string
  org_id: string
  role_type: RoleType
  enabled: boolean
  autonomy_level: AutonomyLevel
  config: Record<string, unknown>
  tick_interval_seconds: number
  daily_budget_cents: number
  created_at: string
  updated_at: string
}

export interface RoleState {
  id: string
  role_config_id: string
  org_id: string
  state: Record<string, unknown>
  version: number
  last_tick_at: string | null
  next_tick_at: string | null
  updated_at: string
}

export type WorkflowStatus = 'pending' | 'active' | 'paused' | 'completed' | 'failed' | 'cancelled'

export interface WorkflowStep {
  step_id: string
  name: string
  status: 'pending' | 'active' | 'completed' | 'failed' | 'skipped'
  result?: unknown
  started_at?: string
  completed_at?: string
}

export interface RoleWorkflow {
  id: string
  role_config_id: string
  org_id: string
  workflow_type: string
  status: WorkflowStatus
  steps: WorkflowStep[]
  current_step: number
  context: Record<string, unknown>
  error?: string
  started_at: string | null
  completed_at: string | null
  next_step_at: string | null
  created_at: string
  updated_at: string
}

export type ActivityType = 'insight' | 'action' | 'escalation' | 'learning' | 'error' | 'workflow_step'

export interface RoleActivity {
  id: string
  role_config_id: string
  org_id: string
  activity_type: ActivityType
  summary: string
  details: Record<string, unknown>
  confidence?: number
  autonomy_mode?: AutonomyLevel
  reasoning?: string
  reversible?: boolean
  created_at: string
}

export interface BISnapshot {
  id: string
  org_id: string
  metric_type: string
  data: Record<string, unknown>
  computed_at: string
  expires_at: string
}
