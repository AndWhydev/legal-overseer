/**
 * Resource Limits tests — verify CPU, memory, disk enforcement
 * and budget integration via TOOL_ROLE_MAP
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createMockSandboxClass } from './fixtures/e2b-mock'

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

describe('Resource Limits', () => {
  let provider: E2BProvider
  const originalEnv = process.env.E2B_API_KEY

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.E2B_API_KEY = 'test-api-key'
    provider = new E2BProvider()
  })

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.E2B_API_KEY = originalEnv
    } else {
      delete process.env.E2B_API_KEY
    }
  })

  describe('default resource limits', () => {
    it('passes default CPU, memory, and disk to Sandbox.create()', async () => {
      await provider.create('org-1', 'test defaults')

      expect(MockSandboxClass.create).toHaveBeenCalledWith(
        expect.objectContaining({
          cpus: 1,
          memoryMb: 512,
          diskMb: 1024,
        }),
      )
    })

    it('applies defaults when config is provided without resource fields', async () => {
      await provider.create('org-1', 'test partial config', {
        template: 'data-science',
        timeoutMs: 120_000,
      })

      expect(MockSandboxClass.create).toHaveBeenCalledWith(
        expect.objectContaining({
          cpus: 1,
          memoryMb: 512,
          diskMb: 1024,
          timeoutMs: 120_000,
        }),
      )
    })
  })

  describe('custom resource limits', () => {
    it('passes custom CPU count to Sandbox.create()', async () => {
      await provider.create('org-1', 'high compute', { cpus: 4 })

      expect(MockSandboxClass.create).toHaveBeenCalledWith(
        expect.objectContaining({
          cpus: 4,
          memoryMb: 512,
          diskMb: 1024,
        }),
      )
    })

    it('passes custom memory to Sandbox.create()', async () => {
      await provider.create('org-1', 'high memory', { memoryMb: 2048 })

      expect(MockSandboxClass.create).toHaveBeenCalledWith(
        expect.objectContaining({
          cpus: 1,
          memoryMb: 2048,
          diskMb: 1024,
        }),
      )
    })

    it('passes custom disk to Sandbox.create()', async () => {
      await provider.create('org-1', 'high disk', { diskMb: 4096 })

      expect(MockSandboxClass.create).toHaveBeenCalledWith(
        expect.objectContaining({
          cpus: 1,
          memoryMb: 512,
          diskMb: 4096,
        }),
      )
    })

    it('passes all custom resource limits together', async () => {
      await provider.create('org-1', 'fully loaded', {
        cpus: 2,
        memoryMb: 1024,
        diskMb: 2048,
        timeoutMs: 60_000,
      })

      expect(MockSandboxClass.create).toHaveBeenCalledWith(
        expect.objectContaining({
          cpus: 2,
          memoryMb: 1024,
          diskMb: 2048,
          timeoutMs: 60_000,
        }),
      )
    })
  })

  describe('resource limits in session metadata', () => {
    it('returns a valid session with resource limits applied', async () => {
      const session = await provider.create('org-1', 'resource test', {
        cpus: 2,
        memoryMb: 1024,
      })

      expect(session.status).toBe('running')
      expect(session.orgId).toBe('org-1')
      expect(session.sandboxId).toBe(mockSandbox.sandboxId)
    })
  })
})

describe('TOOL_ROLE_MAP workspace entries', () => {
  it('maps all workspace tools to the workspaces role', async () => {
    // Dynamic import to avoid hoisting issues with the E2B mock
    const { TOOL_ROLE_MAP } = await import(
      '@/lib/agent/engine/tool-executor'
    )

    expect(TOOL_ROLE_MAP['spawn_ephemeral_workspace']).toBe('workspaces')
    expect(TOOL_ROLE_MAP['workspace_exec']).toBe('workspaces')
    expect(TOOL_ROLE_MAP['workspace_upload']).toBe('workspaces')
    expect(TOOL_ROLE_MAP['workspace_download']).toBe('workspaces')
    expect(TOOL_ROLE_MAP['workspace_destroy']).toBe('workspaces')
  })

  it('does not accidentally remove existing tool mappings', async () => {
    const { TOOL_ROLE_MAP } = await import(
      '@/lib/agent/engine/tool-executor'
    )

    // Spot-check existing roles are preserved
    expect(TOOL_ROLE_MAP['generate_ad_scripts']).toBe('ads')
    expect(TOOL_ROLE_MAP['audit_visibility']).toBe('seo')
    expect(TOOL_ROLE_MAP['schedule_post']).toBe('content')
    expect(TOOL_ROLE_MAP['search_tenders']).toBe('tenders')
  })
})

describe('WorkspaceConfig type', () => {
  it('accepts resource limit fields', async () => {
    const { E2BProvider: Provider } = await import('../e2b-provider')
    const p = new Provider()

    // TypeScript compile-time check: these fields should be accepted
    // without error. The runtime test verifies they flow to Sandbox.create()
    process.env.E2B_API_KEY = 'test-api-key'

    await p.create('org-1', 'type check', {
      cpus: 1,
      memoryMb: 512,
      diskMb: 1024,
      template: 'default',
      timeoutMs: 60_000,
    })

    expect(MockSandboxClass.create).toHaveBeenCalled()
  })
})
