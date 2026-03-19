/**
 * Meeting Intelligence — Agent Tool Definitions
 *
 * These tools allow the chat agent to interact with meetings:
 * - Search transcripts
 * - List meetings
 * - Get meeting details
 * - Trigger transcription
 */

import type Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AgentToolHandler, ToolResult } from '@/lib/agent/tools'
import {
  listMeetings,
  getMeetingWithDetails,
  searchTranscripts,
  createTasksFromActionItems,
} from './meeting-service'

export const meetingToolDefinitions: Anthropic.Tool[] = [
  {
    name: 'search_meetings',
    description: 'Search across all meeting transcripts by keyword or topic. Returns matching transcript segments with timestamps and meeting context. Use when the user asks about what was discussed in meetings, or wants to find specific conversation topics.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search query — topic, phrase, or keyword to find in transcripts' },
        limit: { type: 'number', description: 'Max results (default 10)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'list_meetings',
    description: 'List recent meetings with their status, duration, and action item counts. Use when the user asks about their meetings or wants an overview.',
    input_schema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', description: 'Max results (default 10)' },
        status: { type: 'string', description: 'Filter by status: ready, transcribed, uploaded, failed' },
      },
    },
  },
  {
    name: 'get_meeting_details',
    description: 'Get full details of a specific meeting including summary, action items, participants, and sentiment. Use when the user asks about a specific meeting.',
    input_schema: {
      type: 'object' as const,
      properties: {
        meeting_id: { type: 'string', description: 'Meeting UUID' },
      },
      required: ['meeting_id'],
    },
  },
  {
    name: 'create_meeting_tasks',
    description: 'Create kanban tasks from a meeting\'s extracted action items. Use when the user wants to turn meeting action items into trackable tasks.',
    input_schema: {
      type: 'object' as const,
      properties: {
        meeting_id: { type: 'string', description: 'Meeting UUID' },
      },
      required: ['meeting_id'],
    },
  },
]

export const meetingToolHandlers: Record<string, AgentToolHandler> = {
  async search_meetings(input, orgId, supabase): Promise<ToolResult> {
    const query = input.query as string
    const limit = (input.limit as number) ?? 10

    const results = await searchTranscripts(supabase, orgId, query, limit)

    return {
      success: true,
      data: {
        results: results.map(r => ({
          meeting_title: r.meeting_title,
          speaker: r.speaker_label,
          text: r.segment_text,
          timestamp: `${Math.floor(r.start_time_ms / 60000)}:${String(Math.floor((r.start_time_ms % 60000) / 1000)).padStart(2, '0')}`,
          meeting_id: r.meeting_id,
        })),
        total: results.length,
      },
    }
  },

  async list_meetings(input, orgId, supabase): Promise<ToolResult> {
    const { meetings, total } = await listMeetings(supabase, orgId, {
      limit: (input.limit as number) ?? 10,
      status: (input.status as 'pending' | 'recording' | 'transcribing' | 'processing' | 'completed' | 'failed') ?? undefined,
    })

    return {
      success: true,
      data: {
        meetings: meetings.map(m => ({
          id: m.id,
          title: m.title,
          status: m.status,
          duration: m.duration_seconds ? `${Math.floor(m.duration_seconds / 60)} min` : null,
          date: m.started_at ?? m.created_at,
          sentiment: m.sentiment_label,
          source: m.source,
        })),
        total,
      },
    }
  },

  async get_meeting_details(input, orgId, supabase): Promise<ToolResult> {
    const meetingId = input.meeting_id as string
    const meeting = await getMeetingWithDetails(supabase, meetingId)

    if (!meeting) return { success: false, error: 'Meeting not found' }

    return {
      success: true,
      data: {
        title: meeting.title,
        status: meeting.status,
        duration: meeting.duration_seconds ? `${Math.floor(meeting.duration_seconds / 60)} min` : null,
        date: meeting.started_at ?? meeting.created_at,
        summary: meeting.summary,
        key_decisions: meeting.key_decisions,
        sentiment: meeting.sentiment_label,
        participants: meeting.participants.map((p: { name: string }) => p.name),
        action_items: meeting.action_items.map((a: { title: string; assigned_to: string | null; due_date: string | null; status: string; task_id: string | null }) => ({
          title: a.title,
          assignee: a.assigned_to,
          due: a.due_date,
          status: a.status,
          has_task: !!a.task_id,
        })),
        segment_count: meeting.transcript_segments?.length ?? 0,
      },
    }
  },

  async create_meeting_tasks(input, orgId, supabase): Promise<ToolResult> {
    const meetingId = input.meeting_id as string
    const count = await createTasksFromActionItems(supabase, meetingId, orgId)

    return {
      success: true,
      data: { tasks_created: count, meeting_id: meetingId },
    }
  },
}
