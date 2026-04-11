/**
 * Meeting Intelligence Agent Tools
 *
 * Exposes meeting operations to the agent engine:
 * - Search across meeting transcripts
 * - List meetings by type/status
 * - Get meeting details (summary, action items, transcript)
 */

import Anthropic from '@anthropic-ai/sdk'
import type { AgentToolHandler } from '../tools'
import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'
import {
  listMeetings,
  getMeetingWithDetails,
  searchTranscripts,
} from '@/lib/meetings/meeting-service'
import type { MeetingType, MeetingStatus } from '@/lib/meetings/types'

export const meetingToolDefinitions: Anthropic.Tool[] = [
  {
    name: 'search_meetings',
    description: 'Search across all meeting transcripts for specific topics, discussions, or decisions. Use when the user asks "What did we discuss about X?" or wants to find information from past meetings.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'What to search for in meeting transcripts',
        },
        limit: {
          type: 'number',
          description: 'Max results (default: 10)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'list_meetings',
    description: 'List recent meetings, optionally filtered by type or status. Use when the user asks about their recent meetings or meeting history.',
    input_schema: {
      type: 'object' as const,
      properties: {
        meeting_type: {
          type: 'string',
          enum: ['general', 'standup', 'client_call', 'internal', 'sales', 'onboarding', 'review'],
          description: 'Filter by meeting type',
        },
        status: {
          type: 'string',
          enum: ['pending', 'completed', 'failed'],
          description: 'Filter by processing status',
        },
        limit: {
          type: 'number',
          description: 'Max results (default: 10)',
        },
      },
    },
  },
  {
    name: 'get_meeting_details',
    description: 'Get full details of a specific meeting including summary, action items, transcript segments, and follow-ups. Use when the user asks about a specific meeting.',
    input_schema: {
      type: 'object' as const,
      properties: {
        meeting_id: {
          type: 'string',
          description: 'The meeting ID',
        },
      },
      required: ['meeting_id'],
    },
  },
]

export const meetingToolHandlers: Record<string, AgentToolHandler> = {
  search_meetings: async (
    input: Record<string, unknown>,
    orgId: string,
    supabase: SupabaseClient
  ) => {
    const query = input.query as string
    const limit = (input.limit as number) || 10

    const results = await searchTranscripts(supabase, orgId, query, limit)

    if (results.length === 0) {
      return {
        success: true,
        data: { message: `No meeting transcripts found matching "${query}".`, results: [] },
      }
    }

    return {
      success: true,
      data: {
        results: results.map(r => ({
          meeting_title: r.meeting_title,
          speaker: r.speaker_label,
          timestamp: formatMs(r.start_time_ms),
          text: r.segment_text,
          relevance: r.rank.toFixed(2),
        })),
        total: results.length,
      },
    }
  },

  list_meetings: async (
    input: Record<string, unknown>,
    orgId: string,
    supabase: SupabaseClient
  ) => {
    const { meetings, total } = await listMeetings(supabase, orgId, {
      meeting_type: input.meeting_type as MeetingType | undefined,
      status: input.status as MeetingStatus | undefined,
      limit: (input.limit as number) || 10,
    })

    return {
      success: true,
      data: {
        meetings: meetings.map(m => ({
          id: m.id,
          title: m.title,
          type: m.meeting_type,
          status: m.status,
          duration: m.duration_seconds ? `${Math.floor(m.duration_seconds / 60)}m` : null,
          date: m.created_at,
          sentiment: m.sentiment_label,
          has_summary: !!m.summary,
        })),
        total,
      },
    }
  },

  get_meeting_details: async (
    input: Record<string, unknown>,
    _orgId: string,
    supabase: SupabaseClient
  ) => {
    const meetingId = input.meeting_id as string
    const meeting = await getMeetingWithDetails(supabase, meetingId)

    if (!meeting) {
      return { success: false, error: 'Meeting not found' }
    }

    return {
      success: true,
      data: {
        title: meeting.title,
        type: meeting.meeting_type,
        status: meeting.status,
        duration: meeting.duration_seconds ? `${Math.floor(meeting.duration_seconds / 60)} minutes` : null,
        date: meeting.created_at,
        summary: meeting.summary,
        key_decisions: meeting.key_decisions,
        sentiment: meeting.sentiment_label,
        participants: meeting.participants.map(p => ({
          name: p.name,
          role: p.role,
        })),
        action_items: meeting.action_items.map(ai => ({
          title: ai.title,
          assigned_to: ai.assigned_to,
          due_date: ai.due_date,
          status: ai.status,
          has_task: !!ai.task_id,
        })),
        follow_ups: meeting.follow_ups.map(fu => ({
          type: fu.follow_up_type,
          subject: fu.subject,
          status: fu.status,
        })),
        transcript_segment_count: meeting.transcript_segments.length,
      },
    }
  },
}

function formatMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
