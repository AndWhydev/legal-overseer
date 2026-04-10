/**
 * Tool Resolver Tests
 *
 * Tests getTierForTool, buildTierContextBlock, and recordToolOutcome
 * in isolation with mocked dependencies.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/core/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('../reliability-tracker', () => ({
  getReliabilitySummary: vi.fn(),
  formatReliabilityContext: vi.fn(),
  inferServiceName: vi.fn(),
  recordExecution: vi.fn(),
}))

import { getTierForTool, buildTierContextBlock, recordToolOutcome, type TierType } from '../tool-resolver'
import { getReliabilitySummary, formatReliabilityContext, inferServiceName, recordExecution } from '../reliability-tracker'

// ---------------------------------------------------------------------------
// getTierForTool
// ---------------------------------------------------------------------------

describe('getTierForTool', () => {
  it('maps spawn_browser_agent to browser tier', () => {
    expect(getTierForTool('spawn_browser_agent')).toBe('browser')
  })

  it('maps spawn_ephemeral_workspace to workspace tier', () => {
    expect(getTierForTool('spawn_ephemeral_workspace')).toBe('workspace')
  })

  it('maps workspace_exec to workspace tier', () => {
    expect(getTierForTool('workspace_exec')).toBe('workspace')
  })

  it('maps workspace_upload to workspace tier', () => {
    expect(getTierForTool('workspace_upload')).toBe('workspace')
  })

  it('maps workspace_download to workspace tier', () => {
    expect(getTierForTool('workspace_download')).toBe('workspace')
  })

  it('maps workspace_destroy to workspace tier', () => {
    expect(getTierForTool('workspace_destroy')).toBe('workspace')
  })

  it('maps request_human_handoff to human tier', () => {
    expect(getTierForTool('request_human_handoff')).toBe('human')
  })

  it('maps all other tools to api tier', () => {
    const apiTools = [
      'send_gmail',
      'search_contacts',
      'create_task',
      'web_search',
      'send_email',
      'execute_code',
    ]
    for (const tool of apiTools) {
      expect(getTierForTool(tool)).toBe('api' satisfies TierType)
    }
  })
})

// ---------------------------------------------------------------------------
// buildTierContextBlock
// ---------------------------------------------------------------------------

describe('buildTierContextBlock', () => {
  const mockSupabase = {} as never

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns string containing "Available Execution Tiers"', async () => {
    vi.mocked(getReliabilitySummary).mockResolvedValue([])
    vi.mocked(formatReliabilityContext).mockReturnValue('')

    const result = await buildTierContextBlock(mockSupabase, 'org-1')

    expect(result).toContain('Available Execution Tiers')
  })

  it('includes all four tier descriptions', async () => {
    vi.mocked(getReliabilitySummary).mockResolvedValue([])
    vi.mocked(formatReliabilityContext).mockReturnValue('')

    const result = await buildTierContextBlock(mockSupabase, 'org-1')

    expect(result).toContain('API')
    expect(result).toContain('Browser')
    expect(result).toContain('Workspace')
    expect(result).toContain('Human')
  })

  it('includes reliability data when available', async () => {
    vi.mocked(getReliabilitySummary).mockResolvedValue([
      {
        org_id: 'org-1',
        service_name: 'gmail',
        tier: 'api',
        total_executions: 50,
        success_rate: 0.96,
        avg_latency_ms: 200,
        avg_cost_cents: null,
        most_common_error: null,
      },
    ])
    vi.mocked(formatReliabilityContext).mockReturnValue('## Tool Reliability (7-day)\n| gmail | api | 96.0% |')

    const result = await buildTierContextBlock(mockSupabase, 'org-1')

    expect(result).toContain('Tool Reliability (7-day)')
    expect(result).toContain('gmail')
    expect(result).toContain('Use this reliability data')
  })

  it('omits reliability guidance when no data exists', async () => {
    vi.mocked(getReliabilitySummary).mockResolvedValue([])
    vi.mocked(formatReliabilityContext).mockReturnValue('')

    const result = await buildTierContextBlock(mockSupabase, 'org-1')

    expect(result).not.toContain('Use this reliability data')
  })

  it('calls getReliabilitySummary with correct orgId', async () => {
    vi.mocked(getReliabilitySummary).mockResolvedValue([])
    vi.mocked(formatReliabilityContext).mockReturnValue('')

    await buildTierContextBlock(mockSupabase, 'org-42')

    expect(getReliabilitySummary).toHaveBeenCalledWith(mockSupabase, 'org-42')
  })
})

// ---------------------------------------------------------------------------
// recordToolOutcome
// ---------------------------------------------------------------------------

describe('recordToolOutcome', () => {
  const mockSupabase = {} as never

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(inferServiceName).mockReturnValue('gmail')
    vi.mocked(recordExecution).mockResolvedValue(undefined)
  })

  it('calls inferServiceName with tool name and input', () => {
    const input = { to: 'test@example.com' }
    recordToolOutcome(mockSupabase, 'org-1', 'send_gmail', input, true)

    expect(inferServiceName).toHaveBeenCalledWith('send_gmail', input)
  })

  it('calls recordExecution with correct tier for browser tool', () => {
    vi.mocked(inferServiceName).mockReturnValue('example.com')
    recordToolOutcome(mockSupabase, 'org-1', 'spawn_browser_agent', { url: 'https://example.com' }, true, undefined, 5000)

    expect(recordExecution).toHaveBeenCalledWith(mockSupabase, expect.objectContaining({
      org_id: 'org-1',
      service_name: 'example.com',
      tier: 'browser',
      success: true,
      latency_ms: 5000,
      tool_name: 'spawn_browser_agent',
    }))
  })

  it('calls recordExecution with correct tier for workspace tool', () => {
    vi.mocked(inferServiceName).mockReturnValue('workspace')
    recordToolOutcome(mockSupabase, 'org-1', 'spawn_ephemeral_workspace', undefined, true)

    expect(recordExecution).toHaveBeenCalledWith(mockSupabase, expect.objectContaining({
      tier: 'workspace',
      tool_name: 'spawn_ephemeral_workspace',
    }))
  })

  it('calls recordExecution with correct tier for human tool', () => {
    vi.mocked(inferServiceName).mockReturnValue('request_human_handoff')
    recordToolOutcome(mockSupabase, 'org-1', 'request_human_handoff', undefined, false, 'escalated')

    expect(recordExecution).toHaveBeenCalledWith(mockSupabase, expect.objectContaining({
      tier: 'human',
      success: false,
      error_message: 'escalated',
    }))
  })

  it('calls recordExecution with api tier for standard tools', () => {
    recordToolOutcome(mockSupabase, 'org-1', 'send_gmail', undefined, true, undefined, 200)

    expect(recordExecution).toHaveBeenCalledWith(mockSupabase, expect.objectContaining({
      tier: 'api',
      success: true,
      latency_ms: 200,
    }))
  })

  it('passes error message through when provided', () => {
    recordToolOutcome(mockSupabase, 'org-1', 'send_gmail', undefined, false, 'rate_limited', 100)

    expect(recordExecution).toHaveBeenCalledWith(mockSupabase, expect.objectContaining({
      success: false,
      error_message: 'rate_limited',
    }))
  })

  it('sets null for missing optional fields', () => {
    recordToolOutcome(mockSupabase, 'org-1', 'send_gmail', undefined, true)

    expect(recordExecution).toHaveBeenCalledWith(mockSupabase, expect.objectContaining({
      error_message: null,
      latency_ms: null,
    }))
  })

  it('does not throw when recordExecution rejects', () => {
    vi.mocked(recordExecution).mockRejectedValue(new Error('DB down'))

    // Should not throw
    expect(() => {
      recordToolOutcome(mockSupabase, 'org-1', 'send_gmail', undefined, true)
    }).not.toThrow()
  })

  it('does not throw when inferServiceName throws', () => {
    vi.mocked(inferServiceName).mockImplementation(() => {
      throw new Error('Parse error')
    })

    // recordToolOutcome wraps everything in try-catch — never throws
    expect(() => {
      recordToolOutcome(mockSupabase, 'org-1', 'send_gmail', undefined, true)
    }).not.toThrow()
  })
})
