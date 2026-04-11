import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// Mock the E2BProvider before importing workspace-tools
const mockCreate = vi.fn()
const mockExec = vi.fn()
const mockUploadFile = vi.fn()
const mockDownloadFile = vi.fn()
const mockListFiles = vi.fn()
const mockDestroy = vi.fn()

vi.mock('@/lib/workspaces/e2b-provider', () => ({
  E2BProvider: vi.fn().mockImplementation(() => ({
    create: mockCreate,
    exec: mockExec,
    uploadFile: mockUploadFile,
    downloadFile: mockDownloadFile,
    listFiles: mockListFiles,
    destroy: mockDestroy,
  })),
}))

vi.mock('@/lib/core/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

import { workspaceToolDefinitions, workspaceToolHandlers } from '../workspace-tools'

const mockSupabase = {} as SupabaseClient

describe('workspace tool definitions', () => {
  it('defines all 5 workspace tools', () => {
    const toolNames = workspaceToolDefinitions.map(t => t.name)
    expect(toolNames).toContain('spawn_ephemeral_workspace')
    expect(toolNames).toContain('workspace_exec')
    expect(toolNames).toContain('workspace_upload')
    expect(toolNames).toContain('workspace_download')
    expect(toolNames).toContain('workspace_destroy')
    expect(toolNames).toHaveLength(5)
  })

  it('spawn_ephemeral_workspace requires purpose', () => {
    const tool = workspaceToolDefinitions.find(t => t.name === 'spawn_ephemeral_workspace')!
    expect(tool.input_schema.required).toContain('purpose')
  })

  it('workspace_exec requires workspace_id and code', () => {
    const tool = workspaceToolDefinitions.find(t => t.name === 'workspace_exec')!
    expect(tool.input_schema.required).toContain('workspace_id')
    expect(tool.input_schema.required).toContain('code')
  })

  it('workspace_upload requires workspace_id, path, and content', () => {
    const tool = workspaceToolDefinitions.find(t => t.name === 'workspace_upload')!
    expect(tool.input_schema.required).toContain('workspace_id')
    expect(tool.input_schema.required).toContain('path')
    expect(tool.input_schema.required).toContain('content')
  })

  it('workspace_download requires workspace_id and path', () => {
    const tool = workspaceToolDefinitions.find(t => t.name === 'workspace_download')!
    expect(tool.input_schema.required).toContain('workspace_id')
    expect(tool.input_schema.required).toContain('path')
  })

  it('workspace_destroy requires workspace_id', () => {
    const tool = workspaceToolDefinitions.find(t => t.name === 'workspace_destroy')!
    expect(tool.input_schema.required).toContain('workspace_id')
  })

  it('all tools have descriptions', () => {
    for (const tool of workspaceToolDefinitions) {
      expect(tool.description).toBeTruthy()
      expect(tool.description.length).toBeGreaterThan(20)
    }
  })

  it('all tools have valid input schemas with type=object', () => {
    for (const tool of workspaceToolDefinitions) {
      expect(tool.input_schema.type).toBe('object')
      expect(tool.input_schema.properties).toBeTruthy()
    }
  })
})

describe('workspace tool handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('spawn_ephemeral_workspace', () => {
    it('creates a workspace and returns session data', async () => {
      mockCreate.mockResolvedValueOnce({
        id: 'ws-123',
        orgId: 'org-1',
        sandboxId: 'sb-abc',
        status: 'running',
        template: 'default',
        startedAt: '2026-04-10T00:00:00Z',
        totalSeconds: 0,
        costUsd: 0,
        purpose: 'data analysis',
      })

      const result = await workspaceToolHandlers.spawn_ephemeral_workspace(
        { purpose: 'data analysis' },
        'org-1',
        mockSupabase,
      )

      expect(result.success).toBe(true)
      expect(result.data).toMatchObject({
        workspace_id: 'sb-abc',
        session_id: 'ws-123',
        status: 'running',
      })
      expect(mockCreate).toHaveBeenCalledWith('org-1', 'data analysis', { template: 'default' })
    })

    it('returns error when purpose is empty', async () => {
      const result = await workspaceToolHandlers.spawn_ephemeral_workspace(
        { purpose: '' },
        'org-1',
        mockSupabase,
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('purpose')
    })

    it('returns error when provider.create fails', async () => {
      mockCreate.mockRejectedValueOnce(new Error('E2B_API_KEY not set'))

      const result = await workspaceToolHandlers.spawn_ephemeral_workspace(
        { purpose: 'test' },
        'org-1',
        mockSupabase,
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('E2B_API_KEY')
    })
  })

  describe('workspace_exec', () => {
    it('executes code and returns stdout/stderr', async () => {
      mockExec.mockResolvedValueOnce({
        stdout: '42\n',
        stderr: '',
        exitCode: 0,
      })

      const result = await workspaceToolHandlers.workspace_exec(
        { workspace_id: 'sb-abc', code: 'print(42)', language: 'python' },
        'org-1',
        mockSupabase,
      )

      expect(result.success).toBe(true)
      expect(result.data).toMatchObject({
        stdout: '42\n',
        stderr: '',
        exit_code: 0,
      })
      expect(mockExec).toHaveBeenCalledWith('sb-abc', 'print(42)', 'python')
    })

    it('defaults language to python when not specified', async () => {
      mockExec.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
        exitCode: 0,
      })

      await workspaceToolHandlers.workspace_exec(
        { workspace_id: 'sb-abc', code: 'print(1)' },
        'org-1',
        mockSupabase,
      )

      expect(mockExec).toHaveBeenCalledWith('sb-abc', 'print(1)', 'python')
    })

    it('returns error on non-zero exit code', async () => {
      mockExec.mockResolvedValueOnce({
        stdout: '',
        stderr: 'NameError',
        exitCode: 1,
        error: "NameError: name 'x' is not defined",
      })

      const result = await workspaceToolHandlers.workspace_exec(
        { workspace_id: 'sb-abc', code: 'print(x)' },
        'org-1',
        mockSupabase,
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('NameError')
    })

    it('returns error when workspace_id is missing', async () => {
      const result = await workspaceToolHandlers.workspace_exec(
        { code: 'print(1)' },
        'org-1',
        mockSupabase,
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('workspace_id')
    })

    it('returns error when code is empty', async () => {
      const result = await workspaceToolHandlers.workspace_exec(
        { workspace_id: 'sb-abc', code: '' },
        'org-1',
        mockSupabase,
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('code')
    })
  })

  describe('workspace_destroy', () => {
    it('destroys the workspace and returns success', async () => {
      mockDestroy.mockResolvedValueOnce(undefined)

      const result = await workspaceToolHandlers.workspace_destroy(
        { workspace_id: 'sb-abc' },
        'org-1',
        mockSupabase,
      )

      expect(result.success).toBe(true)
      expect(result.data).toMatchObject({ message: expect.stringContaining('sb-abc') })
      expect(mockDestroy).toHaveBeenCalledWith('sb-abc')
    })

    it('returns error when workspace_id is missing', async () => {
      const result = await workspaceToolHandlers.workspace_destroy(
        {},
        'org-1',
        mockSupabase,
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('workspace_id')
    })

    it('returns error when provider.destroy fails', async () => {
      mockDestroy.mockRejectedValueOnce(new Error('sandbox already dead'))

      const result = await workspaceToolHandlers.workspace_destroy(
        { workspace_id: 'sb-abc' },
        'org-1',
        mockSupabase,
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('sandbox already dead')
    })
  })

  describe('workspace_upload', () => {
    it('uploads a file successfully', async () => {
      mockUploadFile.mockResolvedValueOnce(undefined)

      const result = await workspaceToolHandlers.workspace_upload(
        { workspace_id: 'sb-abc', path: '/tmp/data.csv', content: 'a,b,c' },
        'org-1',
        mockSupabase,
      )

      expect(result.success).toBe(true)
      expect(result.data).toMatchObject({ path: '/tmp/data.csv' })
      expect(mockUploadFile).toHaveBeenCalledWith('sb-abc', '/tmp/data.csv', 'a,b,c')
    })
  })

  describe('workspace_download', () => {
    it('downloads a file successfully', async () => {
      mockDownloadFile.mockResolvedValueOnce('result data')

      const result = await workspaceToolHandlers.workspace_download(
        { workspace_id: 'sb-abc', path: '/tmp/output.txt' },
        'org-1',
        mockSupabase,
      )

      expect(result.success).toBe(true)
      expect(result.data).toMatchObject({ path: '/tmp/output.txt', content: 'result data' })
    })
  })
})
