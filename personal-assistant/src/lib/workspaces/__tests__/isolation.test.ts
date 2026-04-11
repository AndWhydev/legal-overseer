/**
 * Isolation tests — verify that workspace sandboxes are independent
 *
 * Each sandbox must get a unique ID, maintain independent state,
 * and destroy without affecting sibling sandboxes.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createMockSandbox, createMockSandboxClass } from './fixtures/e2b-mock'

// Create two distinct mock sandboxes to verify isolation
const sandbox1 = createMockSandbox({ sandboxId: 'sandbox-aaa111' })
const sandbox2 = createMockSandbox({ sandboxId: 'sandbox-bbb222' })

let createCallCount = 0
const MockSandboxClass = {
  create: vi.fn().mockImplementation(() => {
    createCallCount++
    return Promise.resolve(createCallCount % 2 === 1 ? sandbox1 : sandbox2)
  }),
}

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

describe('Workspace Isolation', () => {
  const originalEnv = process.env.E2B_API_KEY

  beforeEach(() => {
    vi.clearAllMocks()
    createCallCount = 0
    process.env.E2B_API_KEY = 'test-api-key'
  })

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.E2B_API_KEY = originalEnv
    } else {
      delete process.env.E2B_API_KEY
    }
  })

  it('assigns unique sandbox IDs to each workspace', async () => {
    const provider = new E2BProvider()

    const session1 = await provider.create('org-1', 'task A')
    const session2 = await provider.create('org-1', 'task B')

    expect(session1.sandboxId).toBe('sandbox-aaa111')
    expect(session2.sandboxId).toBe('sandbox-bbb222')
    expect(session1.sandboxId).not.toBe(session2.sandboxId)
  })

  it('assigns unique session IDs to each workspace', async () => {
    const provider = new E2BProvider()

    const session1 = await provider.create('org-1', 'task A')
    const session2 = await provider.create('org-1', 'task B')

    expect(session1.id).not.toBe(session2.id)
    expect(session1.id).toMatch(/^ws-/)
    expect(session2.id).toMatch(/^ws-/)
  })

  it('maintains independent state per sandbox', async () => {
    const provider = new E2BProvider()

    const session1 = await provider.create('org-1', 'analysis')
    const session2 = await provider.create('org-1', 'testing')

    // Execute in sandbox1 — should call sandbox1.runCode
    sandbox1.runCode.mockResolvedValueOnce({
      results: [],
      logs: { stdout: ['result-from-1'], stderr: [] },
      error: undefined,
    })

    const result1 = await provider.exec(session1.sandboxId, 'print("1")', 'python')
    expect(result1.stdout).toBe('result-from-1')
    expect(sandbox1.runCode).toHaveBeenCalledTimes(1)
    expect(sandbox2.runCode).not.toHaveBeenCalled()

    // Execute in sandbox2 — should call sandbox2.runCode, not sandbox1
    sandbox2.runCode.mockResolvedValueOnce({
      results: [],
      logs: { stdout: ['result-from-2'], stderr: [] },
      error: undefined,
    })

    const result2 = await provider.exec(session2.sandboxId, 'print("2")', 'python')
    expect(result2.stdout).toBe('result-from-2')
    expect(sandbox2.runCode).toHaveBeenCalledTimes(1)
  })

  it('destroying one sandbox does not affect the other', async () => {
    const provider = new E2BProvider()

    const session1 = await provider.create('org-1', 'task A')
    const session2 = await provider.create('org-1', 'task B')

    // Destroy sandbox1
    await provider.destroy(session1.sandboxId)
    expect(sandbox1.kill).toHaveBeenCalledTimes(1)

    // sandbox2 should still be usable
    sandbox2.runCode.mockResolvedValueOnce({
      results: [],
      logs: { stdout: ['still alive'], stderr: [] },
      error: undefined,
    })

    const result = await provider.exec(session2.sandboxId, 'print("alive")', 'python')
    expect(result.stdout).toBe('still alive')

    // sandbox1 should be gone
    await expect(
      provider.exec(session1.sandboxId, 'print("dead")', 'python'),
    ).rejects.toThrow('not found')
  })

  it('isolates sandboxes across different orgs', async () => {
    const provider = new E2BProvider()

    const sessionOrg1 = await provider.create('org-alpha', 'org1 work')
    const sessionOrg2 = await provider.create('org-beta', 'org2 work')

    expect(sessionOrg1.orgId).toBe('org-alpha')
    expect(sessionOrg2.orgId).toBe('org-beta')
    expect(sessionOrg1.sandboxId).not.toBe(sessionOrg2.sandboxId)
  })
})
