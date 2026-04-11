import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WorkspaceProvider, WorkspaceSession } from '../types'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/core/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

const mockGetDailyWorkspaceCost = vi.fn()
const mockUpdateWorkspaceStatus = vi.fn()
const mockGetWorkspaceSession = vi.fn()

vi.mock('../workspace-store', () => ({
  getDailyWorkspaceCost: (...args: unknown[]) => mockGetDailyWorkspaceCost(...args),
  updateWorkspaceStatus: (...args: unknown[]) => mockUpdateWorkspaceStatus(...args),
  getWorkspaceSession: (...args: unknown[]) => mockGetWorkspaceSession(...args),
}))

import {
  checkWorkspaceBudget,
  completeWorkspace,
  sweepOrphanedWorkspaces,
} from '../lifecycle'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockSupabase(overrides?: {
  selectData?: unknown[]
  selectError?: { message: string } | null
}) {
  const response = {
    data: overrides?.selectData ?? [],
    error: overrides?.selectError ?? null,
  }

  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          lt: vi.fn().mockResolvedValue(response),
        }),
      }),
    }),
  } as unknown as import('@supabase/supabase-js').SupabaseClient
}

function createMockProvider(): WorkspaceProvider {
  return {
    create: vi.fn(),
    exec: vi.fn(),
    uploadFile: vi.fn(),
    downloadFile: vi.fn(),
    listFiles: vi.fn(),
    destroy: vi.fn().mockResolvedValue(undefined),
  }
}

function makeSession(overrides?: Partial<WorkspaceSession>): WorkspaceSession {
  return {
    id: 'ws-test-123',
    orgId: 'org-1',
    sandboxId: 'sandbox-abc',
    status: 'running',
    purpose: 'test task',
    template: 'default',
    startedAt: new Date(Date.now() - 60_000).toISOString(), // 1 min ago
    totalSeconds: 30,
    costUsd: 0.01,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('checkWorkspaceBudget', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('allows when under the default limit', async () => {
    mockGetDailyWorkspaceCost.mockResolvedValue(0.5)
    const supabase = createMockSupabase()

    const result = await checkWorkspaceBudget(supabase, 'org-1')

    expect(result.allowed).toBe(true)
    expect(result.currentCostUsd).toBe(0.5)
    expect(result.limitUsd).toBe(2.0)
    expect(result.remainingUsd).toBe(1.5)
  })

  it('denies when over the default limit', async () => {
    mockGetDailyWorkspaceCost.mockResolvedValue(2.5)
    const supabase = createMockSupabase()

    const result = await checkWorkspaceBudget(supabase, 'org-1')

    expect(result.allowed).toBe(false)
    expect(result.currentCostUsd).toBe(2.5)
    expect(result.remainingUsd).toBe(0)
  })

  it('respects a custom daily limit', async () => {
    mockGetDailyWorkspaceCost.mockResolvedValue(4.0)
    const supabase = createMockSupabase()

    const result = await checkWorkspaceBudget(supabase, 'org-1', { dailyLimitUsd: 5.0 })

    expect(result.allowed).toBe(true)
    expect(result.limitUsd).toBe(5.0)
    expect(result.remainingUsd).toBe(1.0)
  })

  it('denies when exactly at the limit', async () => {
    mockGetDailyWorkspaceCost.mockResolvedValue(2.0)
    const supabase = createMockSupabase()

    const result = await checkWorkspaceBudget(supabase, 'org-1')

    expect(result.allowed).toBe(false)
    expect(result.remainingUsd).toBe(0)
  })
})

describe('completeWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('destroys sandbox and updates DB on happy path', async () => {
    const session = makeSession()
    mockGetWorkspaceSession.mockResolvedValue(session)
    mockUpdateWorkspaceStatus.mockResolvedValue({ ...session, status: 'completed' })

    const supabase = createMockSupabase()
    const provider = createMockProvider()

    await completeWorkspace(supabase, provider, 'ws-test-123', 'completed')

    expect(provider.destroy).toHaveBeenCalledWith('sandbox-abc')
    expect(mockUpdateWorkspaceStatus).toHaveBeenCalledWith(
      supabase,
      'ws-test-123',
      'completed',
      expect.objectContaining({
        completedAt: expect.any(String),
        totalSeconds: expect.any(Number),
        costUsd: expect.any(Number),
      }),
    )
  })

  it('still updates DB when provider destroy fails', async () => {
    const session = makeSession()
    mockGetWorkspaceSession.mockResolvedValue(session)
    mockUpdateWorkspaceStatus.mockResolvedValue({ ...session, status: 'failed' })

    const supabase = createMockSupabase()
    const provider = createMockProvider()
    ;(provider.destroy as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Sandbox already dead'),
    )

    await completeWorkspace(supabase, provider, 'ws-test-123', 'failed')

    // destroy was called and threw
    expect(provider.destroy).toHaveBeenCalledWith('sandbox-abc')
    // but update still happened
    expect(mockUpdateWorkspaceStatus).toHaveBeenCalledWith(
      supabase,
      'ws-test-123',
      'failed',
      expect.objectContaining({
        completedAt: expect.any(String),
      }),
    )
  })

  it('returns early for unknown session', async () => {
    mockGetWorkspaceSession.mockResolvedValue(null)

    const supabase = createMockSupabase()
    const provider = createMockProvider()

    await completeWorkspace(supabase, provider, 'ws-nonexistent', 'completed')

    expect(provider.destroy).not.toHaveBeenCalled()
    expect(mockUpdateWorkspaceStatus).not.toHaveBeenCalled()
  })
})

describe('sweepOrphanedWorkspaces', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('finds and cleans up orphaned workspaces', async () => {
    const orphanRows = [
      { id: 'ws-orphan-1', sandbox_id: 'sb-1', started_at: '2024-01-01T00:00:00Z', total_seconds: 300 },
      { id: 'ws-orphan-2', sandbox_id: 'sb-2', started_at: '2024-01-01T00:00:00Z', total_seconds: 600 },
    ]

    // Mock the Supabase query chain for sweepOrphanedWorkspaces
    const supabase = createMockSupabase({ selectData: orphanRows })
    const provider = createMockProvider()

    // Each orphan calls completeWorkspace -> getWorkspaceSession -> updateWorkspaceStatus
    mockGetWorkspaceSession
      .mockResolvedValueOnce(makeSession({ id: 'ws-orphan-1', sandboxId: 'sb-1' }))
      .mockResolvedValueOnce(makeSession({ id: 'ws-orphan-2', sandboxId: 'sb-2' }))
    mockUpdateWorkspaceStatus.mockResolvedValue(makeSession({ status: 'timeout' }))

    const cleaned = await sweepOrphanedWorkspaces(supabase, provider)

    expect(cleaned).toBe(2)
    expect(provider.destroy).toHaveBeenCalledTimes(2)
  })

  it('returns 0 when no orphans exist', async () => {
    const supabase = createMockSupabase({ selectData: [] })
    const provider = createMockProvider()

    const cleaned = await sweepOrphanedWorkspaces(supabase, provider)

    expect(cleaned).toBe(0)
    expect(provider.destroy).not.toHaveBeenCalled()
  })

  it('throws on query error', async () => {
    const supabase = createMockSupabase({
      selectError: { message: 'connection refused' },
    })
    const provider = createMockProvider()

    await expect(sweepOrphanedWorkspaces(supabase, provider)).rejects.toThrow(
      'Failed to query orphaned workspaces',
    )
  })
})
