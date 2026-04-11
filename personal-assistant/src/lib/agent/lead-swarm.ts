import type { SupabaseClient } from '@supabase/supabase-js'
import type { ChannelMessage } from '@/lib/channels/types'
import { classifyMessage } from './classifier'
import { autoApproveLeadAcknowledgment, escalateHighValueLead, queueLeadAcknowledgment } from './lead-acknowledgment'
import { getAgentThresholds } from './confidence-router'

export type LeadLabel = 'lead' | 'client' | 'spam' | 'personal'
export type LeadScore = 'hot' | 'warm' | 'cold'

export interface LeadClassification {
  label: LeadLabel
  confidence: number
  category: string
  reasoning: string
}

export interface LeadQualificationInput {
  estimatedValue: number | null
  serviceInterest: string[]
  timelineDays: number | null
}

export interface LeadQualification {
  score: LeadScore
  estimatedValue: number | null
  budgetRange: string | null
  serviceInterest: string[]
  timelineDays: number | null
  points: {
    budget: number
    service: number
    timeline: number
    total: number
  }
}

export interface LeadSwarmTickResult {
  processed: number
  created: number
  qualified: number
  hot: number
  autoApproved: number
  failed: number
}

interface ChannelMessageRow {
  id: string
  org_id: string
  channel: string
  sender: string
  sender_email: string | null
  subject: string | null
  body: string
  received_at: string
  metadata: Record<string, unknown> | null
}

const SERVICE_KEYWORDS: Record<string, string[]> = {
  'web-development': ['website', 'web app', 'landing page', 'frontend', 'backend', 'development'],
  'seo': ['seo', 'search ranking', 'organic traffic', 'keyword'],
  'ads': ['ads', 'google ads', 'meta ads', 'campaign', 'ppc'],
  'branding': ['brand', 'logo', 'identity', 'positioning'],
  'automation': ['automation', 'workflow', 'integration', 'zapier', 'crm'],
}

function toChannelMessage(row: ChannelMessageRow): ChannelMessage {
  return {
    id: row.id,
    channel: row.channel as ChannelMessage['channel'],
    externalId: row.id,
    sender: row.sender,
    senderEmail: row.sender_email ?? undefined,
    subject: row.subject ?? undefined,
    body: row.body,
    receivedAt: new Date(row.received_at),
    isActionable: true,
    priority: 'medium',
    metadata: row.metadata ?? {},
  }
}

function mapCategoryToLeadLabel(category: string): LeadLabel {
  if (category === 'lead') return 'lead'
  if (category === 'client') return 'client'
  if (category === 'personal') return 'personal'
  if (category === 'spam' || category === 'newsletter') return 'spam'
  if (category === 'vendor') return 'client'
  return 'personal'
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, Math.round(value * 1000) / 1000))
}

function parseMoneyToNumber(raw: string): number | null {
  const normalized = raw.replace(/[$,\s]/g, '').toLowerCase()
  const match = normalized.match(/^(\d+(?:\.\d+)?)(k|m)?$/)
  if (!match) return null

  const base = Number(match[1])
  if (!Number.isFinite(base)) return null
  if (match[2] === 'k') return base * 1000
  if (match[2] === 'm') return base * 1000000
  return base
}

function extractEstimatedValue(text: string): number | null {
  const moneyMatches = text.match(/\$\s*\d+(?:[.,]\d+)?\s*[kKmM]?/g) ?? []
  if (moneyMatches.length === 0) return null

  for (const token of moneyMatches) {
    const value = parseMoneyToNumber(token)
    if (value !== null) return value
  }

  return null
}

function extractTimelineDays(text: string): number | null {
  const normalized = text.toLowerCase()
  const dayMatch = normalized.match(/(\d{1,3})\s*day/)
  if (dayMatch) return Number(dayMatch[1])

  const weekMatch = normalized.match(/(\d{1,2})\s*week/)
  if (weekMatch) return Number(weekMatch[1]) * 7

  const monthMatch = normalized.match(/(\d{1,2})\s*month/)
  if (monthMatch) return Number(monthMatch[1]) * 30

  if (/\b(asap|urgent|immediately|right away)\b/.test(normalized)) {
    return 7
  }

  return null
}

function extractServiceInterest(text: string): string[] {
  const normalized = text.toLowerCase()
  const services = Object.entries(SERVICE_KEYWORDS)
    .filter(([, keywords]) => keywords.some((keyword) => normalized.includes(keyword)))
    .map(([service]) => service)

  return Array.from(new Set(services))
}

function estimateBudgetRange(estimatedValue: number | null): string | null {
  if (estimatedValue === null) return null
  if (estimatedValue >= 10000) return 'high'
  if (estimatedValue >= 3000) return 'medium'
  return 'low'
}

function isInboundCandidate(message: ChannelMessageRow): boolean {
  const metadata = message.metadata ?? {}
  if (typeof metadata.direction === 'string') {
    return metadata.direction.toLowerCase() !== 'outbound'
  }

  if (typeof metadata.isOutbound === 'boolean') {
    return !metadata.isOutbound
  }

  return true
}

export async function classifyInboundLead(
  supabase: SupabaseClient,
  message: ChannelMessageRow,
  orgId: string,
): Promise<LeadClassification> {
  const classification = await classifyMessage(supabase, toChannelMessage(message), orgId)
  return {
    label: mapCategoryToLeadLabel(classification.category),
    confidence: clampConfidence(classification.significance / 10),
    category: classification.category,
    reasoning: classification.reasoning,
  }
}

export function qualifyLead(input: LeadQualificationInput): LeadQualification {
  const estimatedValue =
    typeof input.estimatedValue === 'number' && Number.isFinite(input.estimatedValue)
      ? Math.max(0, input.estimatedValue)
      : null
  const timelineDays =
    typeof input.timelineDays === 'number' && Number.isFinite(input.timelineDays)
      ? Math.max(0, Math.floor(input.timelineDays))
      : null
  const serviceInterest = Array.from(new Set(input.serviceInterest)).sort()

  const budgetPoints = estimatedValue === null ? 0 : estimatedValue >= 10000 ? 2 : estimatedValue >= 3000 ? 1 : 0
  const servicePoints = serviceInterest.length > 0 ? 2 : 0
  const timelinePoints = timelineDays === null ? 0 : timelineDays <= 14 ? 2 : timelineDays <= 45 ? 1 : 0
  const total = budgetPoints + servicePoints + timelinePoints

  const score: LeadScore = total >= 5 ? 'hot' : total >= 3 ? 'warm' : 'cold'

  return {
    score,
    estimatedValue,
    budgetRange: estimateBudgetRange(estimatedValue),
    serviceInterest,
    timelineDays,
    points: {
      budget: budgetPoints,
      service: servicePoints,
      timeline: timelinePoints,
      total,
    },
  }
}

async function markMessageProcessed(supabase: SupabaseClient, messageId: string): Promise<void> {
  const { error } = await supabase
    .from('channel_messages')
    .update({ processed: true })
    .eq('id', messageId)

  if (error) {
    throw new Error(error.message)
  }
}

export async function runLeadSwarmTick(
  supabase: SupabaseClient,
  orgId: string,
  agentConfigId: string,
): Promise<LeadSwarmTickResult> {
  const result: LeadSwarmTickResult = { processed: 0, created: 0, qualified: 0, hot: 0, autoApproved: 0, failed: 0 }

  const { data, error } = await supabase
    .from('channel_messages')
    .select('id, org_id, channel, sender, sender_email, subject, body, received_at, metadata')
    .eq('org_id', orgId)
    .eq('processed', false)
    .order('received_at', { ascending: true })
    .limit(50)

  if (error || !data) {
    return result
  }

  for (const rawMessage of data as ChannelMessageRow[]) {
    try {
      if (!isInboundCandidate(rawMessage)) {
        await markMessageProcessed(supabase, rawMessage.id)
        result.processed += 1
        continue
      }

      const classification = await classifyInboundLead(supabase, rawMessage, orgId)
      result.processed += 1

      if (classification.label === 'lead') {
        const text = `${rawMessage.subject ?? ''}\n${rawMessage.body}`
        const qualification = qualifyLead({
          estimatedValue: extractEstimatedValue(text),
          serviceInterest: extractServiceInterest(text),
          timelineDays: extractTimelineDays(text),
        })

        const { data: upsertedLead, error: upsertError } = await supabase
          .from('leads')
          .upsert(
            {
              org_id: orgId,
              source_channel: rawMessage.channel,
              source_detail: rawMessage.sender_email ?? rawMessage.sender,
              source_message_id: rawMessage.id,
              status: 'qualified',
              score: qualification.score,
              budget_range: qualification.budgetRange,
              service_interest: qualification.serviceInterest,
              qualified_at: new Date().toISOString(),
              classification_label: classification.label,
              classification_confidence: classification.confidence,
              estimated_value: qualification.estimatedValue,
              timeline_days: qualification.timelineDays,
              ack_status: 'pending',
              metadata: {
                source: 'lead-swarm',
                category: classification.category,
                classificationReasoning: classification.reasoning,
                qualificationPoints: qualification.points,
              },
            },
            { onConflict: 'org_id,source_message_id' },
          )
          .select(
            'id, org_id, source_channel, source_detail, status, ack_status, created_at, estimated_value, service_interest, timeline_days, metadata',
          )
          .single()

        if (upsertError) {
          throw new Error(upsertError.message)
        }

        if (upsertedLead) {
          const thresholds = getAgentThresholds('lead-swarm')
          if (classification.confidence >= thresholds.act) {
            await autoApproveLeadAcknowledgment(supabase, {
              lead: upsertedLead,
              agentConfigId,
            })
            result.autoApproved += 1
          } else {
            await queueLeadAcknowledgment(supabase, {
              lead: upsertedLead,
              agentConfigId,
            })
          }
          await escalateHighValueLead(supabase, upsertedLead, agentConfigId)
        }

        result.created += 1
        result.qualified += 1
        if (qualification.score === 'hot') {
          result.hot += 1
        }
      }

      await markMessageProcessed(supabase, rawMessage.id)
    } catch {
      result.failed += 1
    }
  }

  return result
}
