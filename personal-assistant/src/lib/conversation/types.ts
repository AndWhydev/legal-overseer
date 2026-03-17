/**
 * Total Recall — Canonical type definitions
 * Shared across identity resolution, thread management, context assembly,
 * action execution, and compression/memory modules.
 */
import { resolveModel } from '@/lib/agent/model-registry'

// ─── Channel & Identity ─────────────────────────────────────────────────────

export type Channel = 'web' | 'whatsapp' | 'sms' | 'email' | 'slack' | 'imessage' | 'api'

export interface ChannelIdentifier {
  channelType: Exclude<Channel, 'api'>
  channelIdentifier: string
  context?: Record<string, string>
}

export interface ResolvedIdentity {
  userId: string
  orgId: string
  contactId?: string
  displayName?: string
  email?: string
  isAuthenticated: boolean
}

export interface ChannelIdentityRecord {
  id: string
  user_id: string
  org_id: string
  channel_type: Exclude<Channel, 'api'>
  channel_identifier: string
  display_name: string | null
  verified: boolean
  verified_at: string | null
  last_used_at: string
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

// ─── Thread ─────────────────────────────────────────────────────────────────

export type ThreadStatus = 'active' | 'archived' | 'compiled'

export interface ConversationThread {
  id: string
  user_id: string
  org_id: string
  status: ThreadStatus
  title: string | null
  message_count: number
  turn_count: number
  token_estimate: number
  last_channel: Channel
  last_activity_at: string
  archived_at: string | null
  compiled_summary: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface ThreadResolutionResult {
  thread: ConversationThread
  isNew: boolean
  inheritedContext?: string
}

// ─── Message ────────────────────────────────────────────────────────────────

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool_call' | 'tool_result'

export interface ConversationMessageRecord {
  id: string
  thread_id: string
  user_id: string
  org_id: string
  turn_number: number
  role: MessageRole
  channel: Channel
  content: string
  tool_data: ToolData | null
  channel_metadata: ChannelMetadata | null
  token_count: number | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface ToolData {
  name: string
  input?: Record<string, unknown>
  result?: unknown
  success?: boolean
}

export interface ChannelMetadata {
  externalId?: string
  subject?: string
  isVoiceNote?: boolean
  attachments?: Array<{
    type: string
    url: string
    name: string
  }>
}

export interface StoreMessageParams {
  threadId: string
  userId: string
  orgId: string
  role: MessageRole
  channel: Channel
  content: string
  toolData?: ToolData
  channelMetadata?: ChannelMetadata
  tokenCount?: number
  metadata?: Record<string, unknown>
}

// ─── Summaries & Compression ────────────────────────────────────────────────

export type SummaryTier = 'compressed' | 'key_facts' | 'archived'

export interface ThreadSummaryRecord {
  id: string
  thread_id: string
  org_id: string
  tier: SummaryTier
  turn_range_start: number
  turn_range_end: number
  summary_text: string
  token_count: number
  entity_ids: string[]
  key_facts: KeyFact[]
  supersedes: string | null
  model_used: string
  created_at: string
  updated_at: string
}

export interface KeyFact {
  type: 'commitment' | 'decision' | 'financial' | 'deadline' | 'entity_state' | 'action_item'
  text: string
  entityIds: string[]
  confidence: number
  extractedFromTurns: number[]
}

// ─── Context Assembly ───────────────────────────────────────────────────────

export interface ThreadContext {
  threadId: string
  turnCount: number
  recentTurns: ConversationMessageRecord[]
  compressedSummary: string | null
  keyFacts: KeyFact[]
  compiledSummary: string | null
  totalTokens: number
}

export interface CompressionConfig {
  verbatimTurns: number
  verbatimBudget: number
  compressedBudget: number
  keyFactsBudget: number
  compressionThreshold: number
  keyFactsThreshold: number
  summarizationModel: string
}

export const DEFAULT_COMPRESSION_CONFIG: CompressionConfig = {
  verbatimTurns: 10,
  verbatimBudget: 3000,
  compressedBudget: 500,
  keyFactsBudget: 200,
  compressionThreshold: 10,
  keyFactsThreshold: 30,
  summarizationModel: resolveModel('classification'),
}

export interface TokenAllocation {
  systemPrompt: number
  entityContext: number
  recentTurns: number
  compressedHistory: number
  keyFacts: number
  pendingActions: number
  retrievedContext: number
  total: number
  budget: number
  overBudget: boolean
}

// ─── Action Execution ───────────────────────────────────────────────────────

export interface ExecutionResult {
  success: boolean
  transportMessageId?: string
  error?: string
  metadata?: Record<string, unknown>
}

export type ActionType =
  | 'send_email'
  | 'send_sms'
  | 'send_whatsapp'
  | 'create_task'
  | 'invoice_create'
  | 'invoice_send'
  | 'schedule_reminder'

export type TransportHandler = (
  supabase: import('@supabase/supabase-js').SupabaseClient,
  orgId: string,
  payload: Record<string, unknown>
) => Promise<ExecutionResult>

// ─── Unified Pipeline ───────────────────────────────────────────────────────

export interface InboundMessage {
  content: string
  channel: Channel
  channelIdentifier?: ChannelIdentifier
  userId?: string
  orgId?: string
  channelMetadata?: ChannelMetadata
}

export interface PipelineResult {
  threadId: string
  responseContent: string
  toolCalls?: ToolData[]
  channel: Channel
  turnNumber: number
}
