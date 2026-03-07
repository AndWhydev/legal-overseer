import type { ChannelAdapter, ChannelMessage } from './types'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getOrgCredential } from '@/lib/integrations/credentials'

const DEFAULT_CLUELY_BASE = 'https://api.cluely.com/v1'

interface CluelyCredentials {
  api_key: string
  base_url?: string
  workspace_id?: string
}

export interface CluelyError {
  error: string
  details?: string
}

export interface CluelyTranscript {
  id?: string
  call_id?: string
  meeting_id?: string
  title?: string
  meeting_title?: string
  summary?: string
  transcript?: string
  transcript_text?: string
  started_at?: string
  ended_at?: string
  created_at?: string
  updated_at?: string
  participants?: Array<string | { name?: string; email?: string }>
  action_items?: string[]
  [key: string]: unknown
}

interface CluelyListResponse {
  transcripts?: CluelyTranscript[]
  data?: CluelyTranscript[]
  items?: CluelyTranscript[]
}

function normalizeBaseUrl(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value
}

function readStringConfig(config: Record<string, unknown>, key: string): string | undefined {
  const value = config[key]
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

function readNumberConfig(config: Record<string, unknown>, key: string): number | undefined {
  const value = config[key]
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  return undefined
}

function parseDate(value?: string): Date {
  if (!value) return new Date()
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}

function compactText(value: string | undefined): string {
  return (value || '').replace(/\s+/g, ' ').trim()
}

function toParticipantList(participants: CluelyTranscript['participants']): string[] {
  if (!Array.isArray(participants)) return []

  return participants
    .map((participant) => {
      if (typeof participant === 'string') return participant.trim()
      if (participant && typeof participant === 'object') {
        const name = typeof participant.name === 'string' ? participant.name.trim() : ''
        const email = typeof participant.email === 'string' ? participant.email.trim() : ''
        return name || email
      }
      return ''
    })
    .filter(Boolean)
}

function extractTranscripts(payload: unknown): CluelyTranscript[] {
  if (Array.isArray(payload)) return payload as CluelyTranscript[]
  if (!payload || typeof payload !== 'object') return []

  const obj = payload as CluelyListResponse
  if (Array.isArray(obj.transcripts)) return obj.transcripts
  if (Array.isArray(obj.data)) return obj.data
  if (Array.isArray(obj.items)) return obj.items

  return []
}

async function cluelyFetch<T>(
  baseUrl: string,
  apiKey: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  const res = await fetch(`${baseUrl}${cleanPath}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init?.headers as Record<string, string> | undefined),
    },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Cluely API ${res.status}: ${text}`)
  }

  return (await res.json()) as T
}

async function resolveCredentials(
  client: SupabaseClient,
  orgId: string,
): Promise<CluelyCredentials | null> {
  return (await getOrgCredential(client, orgId, 'cluely')) as CluelyCredentials | null
}

function mapTranscriptToMessage(
  transcript: CluelyTranscript,
  index: number,
  workspaceId?: string,
): ChannelMessage {
  const id = transcript.id || transcript.call_id || transcript.meeting_id || `cluely-${index}`
  const receivedAt = parseDate(
    transcript.updated_at || transcript.ended_at || transcript.started_at || transcript.created_at,
  )
  const subject = compactText(transcript.title || transcript.meeting_title) || `Meeting ${id}`
  const summary = compactText(transcript.summary)
  const transcriptText = compactText(transcript.transcript || transcript.transcript_text)
  const actionItems = Array.isArray(transcript.action_items)
    ? transcript.action_items.filter((item): item is string => typeof item === 'string')
    : []
  const participants = toParticipantList(transcript.participants)

  const bodyParts = [
    summary,
    transcriptText ? `Transcript: ${transcriptText.slice(0, 500)}` : '',
    actionItems.length > 0 ? `Action items: ${actionItems.join(' | ')}` : '',
  ].filter(Boolean)
  const body = bodyParts.join('\n\n') || subject

  const isActionable = actionItems.length > 0 || /follow[- ]?up|next step|action item/i.test(body)
  const priority: ChannelMessage['priority'] =
    actionItems.length >= 3 ? 'high' : isActionable ? 'medium' : 'low'

  return {
    id: `cluely-${id}`,
    channel: 'cluely',
    externalId: String(id),
    sender: 'Cluely',
    subject,
    body,
    receivedAt,
    isActionable,
    priority,
    metadata: {
      workspaceId,
      participants,
      actionItems,
      source: 'cluely-api',
      raw: transcript,
    },
  }
}

export async function fetchCluelyTranscripts(
  client: SupabaseClient,
  orgId: string,
  options: { since?: Date; limit?: number } = {},
): Promise<CluelyTranscript[] | CluelyError> {
  try {
    const creds = await resolveCredentials(client, orgId)
    if (!creds?.api_key) return { error: 'No Cluely credentials configured' }

    const baseUrl = normalizeBaseUrl(creds.base_url || DEFAULT_CLUELY_BASE)
    const params = new URLSearchParams()
    if (creds.workspace_id) params.set('workspace_id', creds.workspace_id)
    if (options.since) params.set('updated_after', options.since.toISOString())
    if (options.limit) params.set('limit', String(options.limit))

    const suffix = params.toString() ? `?${params.toString()}` : ''
    const payload = await cluelyFetch<CluelyListResponse | CluelyTranscript[]>(
      baseUrl,
      creds.api_key,
      `/transcripts${suffix}`,
    )
    return extractTranscripts(payload)
  } catch (err) {
    return { error: 'Failed to fetch transcripts', details: String(err) }
  }
}

export const cluelyAdapter: ChannelAdapter = {
  type: 'cluely',
  name: 'Cluely',
  description: 'Ingest meeting transcripts and summaries',
  icon: 'Mic',

  async pull(config, since) {
    const apiKey =
      readStringConfig(config, 'apiKey') ||
      readStringConfig(config, 'api_key') ||
      readStringConfig(config, 'token') ||
      process.env.CLUELY_API_KEY
    if (!apiKey) return []

    const baseUrl = normalizeBaseUrl(
      readStringConfig(config, 'baseUrl') ||
      readStringConfig(config, 'base_url') ||
      process.env.CLUELY_API_BASE_URL ||
      DEFAULT_CLUELY_BASE,
    )

    const workspaceId =
      readStringConfig(config, 'workspaceId') ||
      readStringConfig(config, 'workspace_id') ||
      process.env.CLUELY_WORKSPACE_ID
    const limit = readNumberConfig(config, 'limit')
    const path = readStringConfig(config, 'path') || '/transcripts'

    const params = new URLSearchParams()
    if (workspaceId) params.set('workspace_id', workspaceId)
    if (since) params.set('updated_after', since.toISOString())
    if (limit) params.set('limit', String(limit))

    const suffix = params.toString() ? `?${params.toString()}` : ''

    try {
      const payload = await cluelyFetch<CluelyListResponse | CluelyTranscript[]>(
        baseUrl,
        apiKey,
        `${path}${suffix}`,
      )
      const transcripts = extractTranscripts(payload)
      return transcripts.map((transcript, index) =>
        mapTranscriptToMessage(transcript, index, workspaceId),
      )
    } catch (err) {
      logger.error('[cluely] pull failed:', err)
      return []
    }
  },

  async isAvailable() {
    return Boolean(process.env.CLUELY_API_KEY)
  },
}
