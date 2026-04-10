import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WorkspaceExecResult } from '../types'

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

const mockSaveWorkspaceArtifact = vi.fn()

vi.mock('../workspace-store', () => ({
  saveWorkspaceArtifact: (...args: unknown[]) => mockSaveWorkspaceArtifact(...args),
}))

import {
  deliverWorkspaceOutput,
  storeInStorage,
  MAX_INLINE_CHARS,
} from '../output-delivery'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockSupabase(overrides?: {
  uploadError?: { message: string } | null
}) {
  return {
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({
          data: { path: 'test-path' },
          error: overrides?.uploadError ?? null,
        }),
      }),
    },
  } as unknown as import('@supabase/supabase-js').SupabaseClient
}

let artifactIdCounter = 0

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('deliverWorkspaceOutput', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    artifactIdCounter = 0
    mockSaveWorkspaceArtifact.mockImplementation(async () => ({
      id: `art-${++artifactIdCounter}`,
      workspaceId: 'ws-1',
      type: 'data',
      name: 'artifact',
    }))
  })

  it('returns short output without truncation', async () => {
    const supabase = createMockSupabase()
    const execResult: WorkspaceExecResult = {
      stdout: 'Hello, world!',
      stderr: '',
      exitCode: 0,
    }

    const result = await deliverWorkspaceOutput(supabase, 'ws-1', execResult)

    expect(result.inline).toBe('Hello, world!')
    expect(result.truncated).toBe(false)
    expect(result.storedArtifactIds).toEqual([])
    expect(mockSaveWorkspaceArtifact).not.toHaveBeenCalled()
  })

  it('truncates long output and stores full output as artifact', async () => {
    const supabase = createMockSupabase()
    const longOutput = 'x'.repeat(MAX_INLINE_CHARS + 5000)
    const execResult: WorkspaceExecResult = {
      stdout: longOutput,
      stderr: '',
      exitCode: 0,
    }

    const result = await deliverWorkspaceOutput(supabase, 'ws-1', execResult)

    expect(result.truncated).toBe(true)
    expect(result.inline.length).toBeLessThanOrEqual(MAX_INLINE_CHARS + 200) // truncation message adds some chars
    expect(result.inline).toContain('[Content truncated')
    expect(result.inline).toContain('chars omitted')
    expect(result.storedArtifactIds).toContain('art-1')

    // Full output artifact was saved
    expect(mockSaveWorkspaceArtifact).toHaveBeenCalledWith(
      supabase,
      'ws-1',
      expect.objectContaining({
        type: 'data',
        name: 'full-output.txt',
        mimeType: 'text/plain',
      }),
    )
  })

  it('stores execution artifacts', async () => {
    const supabase = createMockSupabase()
    const execResult: WorkspaceExecResult = {
      stdout: 'done',
      stderr: '',
      exitCode: 0,
      artifacts: [
        { type: 'image', name: 'chart.png', content: 'base64data', mimeType: 'image/png' },
        { type: 'data', name: 'results.json', content: '{"a":1}', mimeType: 'application/json' },
      ],
    }

    const result = await deliverWorkspaceOutput(supabase, 'ws-1', execResult)

    expect(result.storedArtifactIds).toHaveLength(2)
    expect(mockSaveWorkspaceArtifact).toHaveBeenCalledTimes(2)
  })

  it('formats error output correctly', async () => {
    const supabase = createMockSupabase()
    const execResult: WorkspaceExecResult = {
      stdout: '',
      stderr: 'Traceback (most recent call last)...',
      exitCode: 1,
      error: 'NameError: name "x" is not defined',
    }

    const result = await deliverWorkspaceOutput(supabase, 'ws-1', execResult)

    expect(result.inline).toContain('[ERROR] NameError')
    expect(result.inline).toContain('[stderr] Traceback')
    expect(result.truncated).toBe(false)
  })

  it('returns "(no output)" for empty result', async () => {
    const supabase = createMockSupabase()
    const execResult: WorkspaceExecResult = {
      stdout: '',
      stderr: '',
      exitCode: 0,
    }

    const result = await deliverWorkspaceOutput(supabase, 'ws-1', execResult)

    expect(result.inline).toBe('(no output)')
    expect(result.truncated).toBe(false)
    expect(result.storedArtifactIds).toEqual([])
  })

  it('includes artifact names in formatted output', async () => {
    const supabase = createMockSupabase()
    const execResult: WorkspaceExecResult = {
      stdout: 'processed',
      stderr: '',
      exitCode: 0,
      artifacts: [
        { type: 'image', name: 'plot.png', content: 'data', mimeType: 'image/png' },
      ],
    }

    const result = await deliverWorkspaceOutput(supabase, 'ws-1', execResult)

    expect(result.inline).toContain('[artifacts] plot.png')
  })
})

describe('storeInStorage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uploads content to Supabase Storage and returns path', async () => {
    const supabase = createMockSupabase()

    const path = await storeInStorage(supabase, 'ws-1', 'output.txt', 'file content')

    expect(path).toBe('ws-1/output.txt')
    expect(supabase.storage.from).toHaveBeenCalledWith('workspace-artifacts')
  })

  it('throws on upload error', async () => {
    const supabase = createMockSupabase({
      uploadError: { message: 'bucket not found' },
    })

    await expect(
      storeInStorage(supabase, 'ws-1', 'output.txt', 'content'),
    ).rejects.toThrow('Storage upload failed')
  })
})

describe('MAX_INLINE_CHARS', () => {
  it('equals 12,000', () => {
    expect(MAX_INLINE_CHARS).toBe(12_000)
  })
})
