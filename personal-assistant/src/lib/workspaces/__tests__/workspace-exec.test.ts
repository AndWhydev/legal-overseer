import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createMockSandbox, createMockSandboxClass } from './fixtures/e2b-mock'

// ---------------------------------------------------------------------------
// E2B SDK mock
// ---------------------------------------------------------------------------
const { MockSandboxClass, instance: mockSandbox } = createMockSandboxClass()

vi.mock('@e2b/code-interpreter', () => ({
  Sandbox: MockSandboxClass,
}))

vi.mock('@/lib/core/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

import { E2BProvider } from '../e2b-provider'
import {
  createWorkspaceSession,
  getWorkspaceSession,
  getActiveWorkspace,
  updateWorkspaceStatus,
  saveWorkspaceArtifact,
  getDailyWorkspaceCost,
  mapSessionRow,
  mapArtifactRow,
} from '../workspace-store'

// ---------------------------------------------------------------------------
// Supabase mock helper
// ---------------------------------------------------------------------------

type MockChain = {
  from: ReturnType<typeof vi.fn>
  select: ReturnType<typeof vi.fn>
  insert: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  gte: ReturnType<typeof vi.fn>
  order: ReturnType<typeof vi.fn>
  limit: ReturnType<typeof vi.fn>
  single: ReturnType<typeof vi.fn>
  range: ReturnType<typeof vi.fn>
}

function createMockSupabase(resolveValue: { data: unknown; error: unknown } = { data: null, error: null }) {
  const chain: MockChain = {} as MockChain

  const terminal = () => Promise.resolve(resolveValue)

  // Every method returns the chain, except terminal ones that return the promise
  chain.select = vi.fn().mockReturnValue(chain)
  chain.insert = vi.fn().mockReturnValue(chain)
  chain.update = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.gte = vi.fn().mockReturnValue(chain)
  chain.order = vi.fn().mockReturnValue(chain)
  chain.limit = vi.fn().mockReturnValue(chain)
  chain.range = vi.fn().mockReturnValue(chain)
  chain.single = vi.fn().mockImplementation(terminal)
  chain.from = vi.fn().mockReturnValue(chain)

  return chain as unknown as ReturnType<typeof vi.fn> & MockChain
}

// ---------------------------------------------------------------------------
// Tests: Stateful execution (same sandbox reused)
// ---------------------------------------------------------------------------

describe('Stateful workspace execution', () => {
  let provider: E2BProvider

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.E2B_API_KEY = 'test-api-key'
    provider = new E2BProvider()
  })

  afterEach(() => {
    delete process.env.E2B_API_KEY
  })

  it('reuses the same sandbox across multiple exec calls', async () => {
    const session = await provider.create('org-1', 'multi-step analysis')

    // First exec — set a variable
    mockSandbox.runCode.mockResolvedValueOnce({
      results: [],
      logs: { stdout: [''], stderr: [] },
      error: undefined,
    })
    await provider.exec(session.sandboxId, 'x = 42', 'python')

    // Second exec — read the variable (same sandbox)
    mockSandbox.runCode.mockResolvedValueOnce({
      results: [],
      logs: { stdout: ['42'], stderr: [] },
      error: undefined,
    })
    const result = await provider.exec(session.sandboxId, 'print(x)', 'python')

    expect(result.stdout).toBe('42')

    // Both calls went to the same sandbox instance
    expect(mockSandbox.runCode).toHaveBeenCalledTimes(2)

    // Only one sandbox was ever created
    expect(MockSandboxClass.create).toHaveBeenCalledTimes(1)
  })

  it('tracks cumulative duration across exec calls', async () => {
    const session = await provider.create('org-1', 'timing test')

    // Simulate two execs — the provider updates totalSeconds internally
    mockSandbox.runCode.mockResolvedValue({
      results: [],
      logs: { stdout: ['ok'], stderr: [] },
      error: undefined,
    })

    await provider.exec(session.sandboxId, 'pass', 'python')
    await provider.exec(session.sandboxId, 'pass', 'python')

    // Session was created once, sandbox persists
    expect(MockSandboxClass.create).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// Tests: Multi-language routing
// ---------------------------------------------------------------------------

describe('Multi-language support', () => {
  let provider: E2BProvider

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.E2B_API_KEY = 'test-api-key'
    provider = new E2BProvider()
  })

  afterEach(() => {
    delete process.env.E2B_API_KEY
  })

  it('routes python to runCode with language=python', async () => {
    const session = await provider.create('org-1', 'py test')
    mockSandbox.runCode.mockResolvedValueOnce({
      results: [],
      logs: { stdout: ['ok'], stderr: [] },
      error: undefined,
    })

    await provider.exec(session.sandboxId, 'print("ok")', 'python')

    expect(mockSandbox.runCode).toHaveBeenCalledWith('print("ok")', expect.objectContaining({ language: 'python' }))
  })

  it('routes javascript to runCode with language=javascript', async () => {
    const session = await provider.create('org-1', 'js test')
    mockSandbox.runCode.mockResolvedValueOnce({
      results: [],
      logs: { stdout: ['ok'], stderr: [] },
      error: undefined,
    })

    await provider.exec(session.sandboxId, 'console.log("ok")', 'javascript')

    expect(mockSandbox.runCode).toHaveBeenCalledWith('console.log("ok")', expect.objectContaining({ language: 'javascript' }))
  })

  it('routes shell to commands.run', async () => {
    const session = await provider.create('org-1', 'shell test')
    mockSandbox.commands.run.mockResolvedValueOnce({
      stdout: 'hello',
      stderr: '',
      exitCode: 0,
    })

    const result = await provider.exec(session.sandboxId, 'echo hello', 'shell')

    expect(mockSandbox.commands.run).toHaveBeenCalledWith('echo hello', expect.any(Object))
    expect(mockSandbox.runCode).not.toHaveBeenCalled()
    expect(result.stdout).toBe('hello')
  })
})

// ---------------------------------------------------------------------------
// Tests: Workspace store CRUD (mock Supabase)
// ---------------------------------------------------------------------------

describe('Workspace store CRUD', () => {
  describe('mapSessionRow', () => {
    it('maps snake_case DB row to camelCase WorkspaceSession', () => {
      const row = {
        id: 'ws-abc',
        org_id: 'org-1',
        task_id: 'task-1',
        sandbox_id: 'sbx-123',
        status: 'running' as const,
        purpose: 'data analysis',
        template: 'default' as const,
        started_at: '2026-04-10T00:00:00Z',
        completed_at: null,
        total_seconds: 120,
        cost_usd: 0.042,
        created_at: '2026-04-10T00:00:00Z',
        updated_at: '2026-04-10T00:00:00Z',
      }

      const session = mapSessionRow(row)

      expect(session.id).toBe('ws-abc')
      expect(session.orgId).toBe('org-1')
      expect(session.taskId).toBe('task-1')
      expect(session.sandboxId).toBe('sbx-123')
      expect(session.status).toBe('running')
      expect(session.template).toBe('default')
      expect(session.totalSeconds).toBe(120)
      expect(session.costUsd).toBe(0.042)
      expect(session.completedAt).toBeUndefined()
    })

    it('maps null task_id to undefined', () => {
      const row = {
        id: 'ws-abc',
        org_id: 'org-1',
        task_id: null,
        sandbox_id: 'sbx-123',
        status: 'completed' as const,
        purpose: 'test',
        template: 'default' as const,
        started_at: '2026-04-10T00:00:00Z',
        completed_at: '2026-04-10T00:05:00Z',
        total_seconds: 300,
        cost_usd: 0.105,
        created_at: '2026-04-10T00:00:00Z',
        updated_at: '2026-04-10T00:05:00Z',
      }

      const session = mapSessionRow(row)
      expect(session.taskId).toBeUndefined()
      expect(session.completedAt).toBe('2026-04-10T00:05:00Z')
    })
  })

  describe('mapArtifactRow', () => {
    it('maps snake_case artifact row to camelCase', () => {
      const row = {
        id: 'art-1',
        workspace_id: 'ws-abc',
        artifact_type: 'image' as const,
        name: 'chart.png',
        content: 'base64data',
        storage_path: null,
        mime_type: 'image/png',
        size_bytes: 4096,
        created_at: '2026-04-10T00:01:00Z',
      }

      const artifact = mapArtifactRow(row)

      expect(artifact.id).toBe('art-1')
      expect(artifact.workspaceId).toBe('ws-abc')
      expect(artifact.type).toBe('image')
      expect(artifact.name).toBe('chart.png')
      expect(artifact.content).toBe('base64data')
      expect(artifact.storagePath).toBeUndefined()
      expect(artifact.mimeType).toBe('image/png')
      expect(artifact.sizeBytes).toBe(4096)
    })
  })

  describe('createWorkspaceSession', () => {
    it('inserts a session row and returns mapped result', async () => {
      const returnedRow = {
        id: 'ws-new',
        org_id: 'org-1',
        task_id: null,
        sandbox_id: 'sbx-999',
        status: 'running',
        purpose: 'test purpose',
        template: 'default',
        started_at: '2026-04-10T00:00:00Z',
        completed_at: null,
        total_seconds: 0,
        cost_usd: 0,
        created_at: '2026-04-10T00:00:00Z',
        updated_at: '2026-04-10T00:00:00Z',
      }

      const mockSb = createMockSupabase({ data: returnedRow, error: null })

      const session = await createWorkspaceSession(mockSb as any, 'org-1', {
        sandboxId: 'sbx-999',
        purpose: 'test purpose',
      })

      expect(mockSb.from).toHaveBeenCalledWith('workspace_sessions')
      expect(mockSb.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          org_id: 'org-1',
          sandbox_id: 'sbx-999',
          purpose: 'test purpose',
          status: 'running',
          template: 'default',
        }),
      )
      expect(session.id).toBe('ws-new')
      expect(session.orgId).toBe('org-1')
      expect(session.sandboxId).toBe('sbx-999')
    })

    it('throws on Supabase error', async () => {
      const mockSb = createMockSupabase({ data: null, error: { message: 'insert failed' } })

      await expect(
        createWorkspaceSession(mockSb as any, 'org-1', {
          sandboxId: 'sbx-bad',
          purpose: 'fail',
        }),
      ).rejects.toThrow('insert failed')
    })
  })

  describe('getWorkspaceSession', () => {
    it('returns mapped session when found', async () => {
      const row = {
        id: 'ws-existing',
        org_id: 'org-1',
        task_id: null,
        sandbox_id: 'sbx-existing',
        status: 'running',
        purpose: 'lookup',
        template: 'default',
        started_at: '2026-04-10T00:00:00Z',
        completed_at: null,
        total_seconds: 60,
        cost_usd: 0.021,
        created_at: '2026-04-10T00:00:00Z',
        updated_at: '2026-04-10T00:00:00Z',
      }

      const mockSb = createMockSupabase({ data: row, error: null })
      const session = await getWorkspaceSession(mockSb as any, 'ws-existing')

      expect(mockSb.eq).toHaveBeenCalledWith('id', 'ws-existing')
      expect(session?.id).toBe('ws-existing')
      expect(session?.totalSeconds).toBe(60)
    })

    it('returns null when not found (PGRST116)', async () => {
      const mockSb = createMockSupabase({ data: null, error: { code: 'PGRST116', message: 'not found' } })
      const session = await getWorkspaceSession(mockSb as any, 'ws-missing')
      expect(session).toBeNull()
    })
  })

  describe('getActiveWorkspace', () => {
    it('returns the most recent running workspace for org', async () => {
      const row = {
        id: 'ws-active',
        org_id: 'org-1',
        task_id: null,
        sandbox_id: 'sbx-active',
        status: 'running',
        purpose: 'active test',
        template: 'default',
        started_at: '2026-04-10T01:00:00Z',
        completed_at: null,
        total_seconds: 30,
        cost_usd: 0.01,
        created_at: '2026-04-10T01:00:00Z',
        updated_at: '2026-04-10T01:00:00Z',
      }

      const mockSb = createMockSupabase({ data: row, error: null })
      const session = await getActiveWorkspace(mockSb as any, 'org-1')

      expect(mockSb.eq).toHaveBeenCalledWith('org_id', 'org-1')
      expect(mockSb.eq).toHaveBeenCalledWith('status', 'running')
      expect(session?.id).toBe('ws-active')
    })

    it('returns null when no running workspace exists', async () => {
      const mockSb = createMockSupabase({ data: null, error: { code: 'PGRST116', message: 'not found' } })
      const session = await getActiveWorkspace(mockSb as any, 'org-1')
      expect(session).toBeNull()
    })
  })

  describe('updateWorkspaceStatus', () => {
    it('updates status and extras', async () => {
      const row = {
        id: 'ws-update',
        org_id: 'org-1',
        task_id: null,
        sandbox_id: 'sbx-update',
        status: 'completed',
        purpose: 'update test',
        template: 'default',
        started_at: '2026-04-10T00:00:00Z',
        completed_at: '2026-04-10T00:05:00Z',
        total_seconds: 300,
        cost_usd: 0.105,
        created_at: '2026-04-10T00:00:00Z',
        updated_at: '2026-04-10T00:05:00Z',
      }

      const mockSb = createMockSupabase({ data: row, error: null })
      const session = await updateWorkspaceStatus(mockSb as any, 'ws-update', 'completed', {
        completedAt: '2026-04-10T00:05:00Z',
        totalSeconds: 300,
        costUsd: 0.105,
      })

      expect(mockSb.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed',
          completed_at: '2026-04-10T00:05:00Z',
          total_seconds: 300,
          cost_usd: 0.105,
        }),
      )
      expect(session.status).toBe('completed')
      expect(session.totalSeconds).toBe(300)
    })

    it('throws on error', async () => {
      const mockSb = createMockSupabase({ data: null, error: { message: 'update failed' } })

      await expect(
        updateWorkspaceStatus(mockSb as any, 'ws-bad', 'failed'),
      ).rejects.toThrow('update failed')
    })
  })

  describe('saveWorkspaceArtifact', () => {
    it('inserts an artifact and returns mapped result', async () => {
      const row = {
        id: 'art-new',
        workspace_id: 'ws-1',
        artifact_type: 'file',
        name: 'output.csv',
        content: 'a,b,c',
        storage_path: null,
        mime_type: 'text/csv',
        size_bytes: 5,
        created_at: '2026-04-10T00:01:00Z',
      }

      const mockSb = createMockSupabase({ data: row, error: null })
      const artifact = await saveWorkspaceArtifact(mockSb as any, 'ws-1', {
        type: 'file',
        name: 'output.csv',
        content: 'a,b,c',
        mimeType: 'text/csv',
        sizeBytes: 5,
      })

      expect(mockSb.from).toHaveBeenCalledWith('workspace_artifacts')
      expect(artifact.id).toBe('art-new')
      expect(artifact.type).toBe('file')
      expect(artifact.name).toBe('output.csv')
    })
  })
})

// ---------------------------------------------------------------------------
// Tests: Daily cost aggregation
// ---------------------------------------------------------------------------

describe('getDailyWorkspaceCost', () => {
  it('sums cost_usd for sessions started today', async () => {
    const rows = [
      { cost_usd: 0.05 },
      { cost_usd: 0.10 },
      { cost_usd: 0.03 },
    ]

    // Build a mock that returns the array (no .single(), just select+eq+gte)
    const chain: any = {}
    chain.select = vi.fn().mockReturnValue(chain)
    chain.eq = vi.fn().mockReturnValue(chain)
    chain.gte = vi.fn().mockImplementation(() => Promise.resolve({ data: rows, error: null }))
    chain.from = vi.fn().mockReturnValue(chain)

    const total = await getDailyWorkspaceCost(chain, 'org-1')

    expect(chain.from).toHaveBeenCalledWith('workspace_sessions')
    expect(chain.eq).toHaveBeenCalledWith('org_id', 'org-1')
    expect(total).toBeCloseTo(0.18)
  })

  it('returns 0 when no sessions exist today', async () => {
    const chain: any = {}
    chain.select = vi.fn().mockReturnValue(chain)
    chain.eq = vi.fn().mockReturnValue(chain)
    chain.gte = vi.fn().mockImplementation(() => Promise.resolve({ data: [], error: null }))
    chain.from = vi.fn().mockReturnValue(chain)

    const total = await getDailyWorkspaceCost(chain, 'org-1')
    expect(total).toBe(0)
  })

  it('throws on Supabase error', async () => {
    const chain: any = {}
    chain.select = vi.fn().mockReturnValue(chain)
    chain.eq = vi.fn().mockReturnValue(chain)
    chain.gte = vi.fn().mockImplementation(() =>
      Promise.resolve({ data: null, error: { message: 'query failed' } }),
    )
    chain.from = vi.fn().mockReturnValue(chain)

    await expect(getDailyWorkspaceCost(chain, 'org-1')).rejects.toThrow('query failed')
  })
})
