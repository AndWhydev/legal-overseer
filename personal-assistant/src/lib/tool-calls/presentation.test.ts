import { describe, expect, it } from 'vitest'

import {
  extractResultSummary,
  formatToolName,
  getToolCallCategory,
  normalizeToolCallEntry,
} from './presentation'

describe('tool call presentation helpers', () => {
  it('maps common tool names to stable categories', () => {
    expect(getToolCallCategory('send_email')).toBe('gmail')
    expect(getToolCallCategory('search_memory')).toBe('memory')
    expect(getToolCallCategory('create_task')).toBe('tasks')
    expect(getToolCallCategory('spawn_agent')).toBe('handoff')
    expect(getToolCallCategory('resolve_tool')).toBe('retrieve_tools')
  })

  it('formats known tool names into readable verbs', () => {
    expect(formatToolName('search_tasks')).toBe('Searching tasks')
    expect(formatToolName('custom_tool_name')).toBe('Custom Tool Name')
  })

  it('builds normalized entries with stable ids and truncated payloads', () => {
    const entry = normalizeToolCallEntry({
      id: 'call-1',
      name: 'send_email',
      input: { to: 'team@example.com', subject: 'Weekly update' },
      result: { ok: true, delivered: 3 },
      success: true,
      status: 'done',
      elapsedMs: 2400,
    }, 0)

    expect(entry.tool_call_id).toBe('call-1')
    expect(entry.tool_category).toBe('gmail')
    expect(entry.integration_name).toBe('Gmail')
    expect(entry.message).toBe('Sending email to team@example.com')
    expect(entry.inputs).toEqual({ to: 'team@example.com', subject: 'Weekly update' })
    expect(entry.output).toContain('"delivered": 3')
    expect(entry.result_summary).toBe('Sent')
  })

  it('summarizes structured search results by count', () => {
    expect(extractResultSummary('search_tasks', { results: [{ id: 1 }, { id: 2 }] }, true)).toBe('Found 2 results')
    expect(extractResultSummary('search_tasks', { results: [] }, true)).toBe('No results')
  })
})
