import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createMockSandbox, createMockSandboxClass } from './fixtures/e2b-mock'

// Mock the E2B SDK import
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

describe('E2BProvider', () => {
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

  describe('create()', () => {
    it('creates a sandbox and returns a WorkspaceSession', async () => {
      const session = await provider.create('org-1', 'data analysis')

      expect(MockSandboxClass.create).toHaveBeenCalledTimes(1)
      expect(session.orgId).toBe('org-1')
      expect(session.purpose).toBe('data analysis')
      expect(session.status).toBe('running')
      expect(session.template).toBe('default')
      expect(session.sandboxId).toBe(mockSandbox.sandboxId)
      expect(session.id).toMatch(/^ws-/)
      expect(session.startedAt).toBeTruthy()
      expect(session.totalSeconds).toBe(0)
      expect(session.costUsd).toBe(0)
    })

    it('passes template option to E2B', async () => {
      await provider.create('org-1', 'web app test', { template: 'web-dev' })

      expect(MockSandboxClass.create).toHaveBeenCalledTimes(1)
    })

    it('passes custom timeout to E2B', async () => {
      await provider.create('org-1', 'quick test', { timeoutMs: 60_000 })

      expect(MockSandboxClass.create).toHaveBeenCalledWith(
        expect.objectContaining({ timeoutMs: 60_000 }),
      )
    })

    it('throws when E2B_API_KEY is not set', async () => {
      delete process.env.E2B_API_KEY

      await expect(provider.create('org-1', 'test')).rejects.toThrow('E2B_API_KEY')
    })
  })

  describe('exec()', () => {
    it('executes Python code via runCode', async () => {
      const session = await provider.create('org-1', 'test')

      mockSandbox.runCode.mockResolvedValueOnce({
        results: [],
        logs: { stdout: ['42'], stderr: [] },
        error: undefined,
      })

      const result = await provider.exec(session.sandboxId, 'print(42)', 'python')

      expect(mockSandbox.runCode).toHaveBeenCalledWith('print(42)', expect.objectContaining({
        language: 'python',
      }))
      expect(result.stdout).toBe('42')
      expect(result.stderr).toBe('')
      expect(result.exitCode).toBe(0)
      expect(result.error).toBeUndefined()
    })

    it('executes JavaScript code via runCode with language=javascript', async () => {
      const session = await provider.create('org-1', 'test')

      mockSandbox.runCode.mockResolvedValueOnce({
        results: [],
        logs: { stdout: ['hello'], stderr: [] },
        error: undefined,
      })

      await provider.exec(session.sandboxId, 'console.log("hello")', 'javascript')

      expect(mockSandbox.runCode).toHaveBeenCalledWith('console.log("hello")', expect.objectContaining({
        language: 'javascript',
      }))
    })

    it('executes shell commands via commands.run', async () => {
      const session = await provider.create('org-1', 'test')

      mockSandbox.commands.run.mockResolvedValueOnce({
        stdout: '/home/user\n',
        stderr: '',
        exitCode: 0,
      })

      const result = await provider.exec(session.sandboxId, 'pwd', 'shell')

      expect(mockSandbox.commands.run).toHaveBeenCalledWith('pwd', expect.objectContaining({
        timeoutMs: 60_000,
      }))
      expect(result.stdout).toBe('/home/user\n')
      expect(result.exitCode).toBe(0)
    })

    it('returns error when execution fails', async () => {
      const session = await provider.create('org-1', 'test')

      mockSandbox.runCode.mockResolvedValueOnce({
        results: [],
        logs: { stdout: [], stderr: ['Traceback...'] },
        error: { name: 'NameError', value: "name 'x' is not defined", traceback: '' },
      })

      const result = await provider.exec(session.sandboxId, 'print(x)', 'python')

      expect(result.exitCode).toBe(1)
      expect(result.error).toContain('NameError')
      expect(result.stderr).toBe('Traceback...')
    })

    it('throws when sandbox not found', async () => {
      await expect(
        provider.exec('nonexistent-sandbox', 'print(1)', 'python'),
      ).rejects.toThrow('not found')
    })

    it('extracts image artifacts from results', async () => {
      const session = await provider.create('org-1', 'test')

      mockSandbox.runCode.mockResolvedValueOnce({
        results: [
          { png: 'base64pngdata', text: '<Figure>' },
        ],
        logs: { stdout: [], stderr: [] },
        error: undefined,
      })

      const result = await provider.exec(session.sandboxId, 'import matplotlib', 'python')

      expect(result.artifacts).toHaveLength(1)
      expect(result.artifacts![0]).toMatchObject({
        type: 'image',
        name: 'output-0.png',
        content: 'base64pngdata',
        mimeType: 'image/png',
      })
    })
  })

  describe('destroy()', () => {
    it('kills the sandbox and removes from tracking', async () => {
      const session = await provider.create('org-1', 'test')
      const sandboxId = session.sandboxId

      await provider.destroy(sandboxId)

      expect(mockSandbox.kill).toHaveBeenCalledTimes(1)

      // After destroy, exec should fail with not found
      await expect(
        provider.exec(sandboxId, 'print(1)', 'python'),
      ).rejects.toThrow('not found')
    })

    it('handles destroying an unknown sandbox gracefully', async () => {
      // Should not throw
      await provider.destroy('unknown-sandbox-id')
    })
  })

  describe('file operations', () => {
    it('uploadFile writes to sandbox.files', async () => {
      const session = await provider.create('org-1', 'test')

      await provider.uploadFile(session.sandboxId, '/tmp/data.csv', 'a,b,c')

      expect(mockSandbox.files.write).toHaveBeenCalledWith('/tmp/data.csv', 'a,b,c')
    })

    it('downloadFile reads from sandbox.files', async () => {
      const session = await provider.create('org-1', 'test')

      mockSandbox.files.read.mockResolvedValueOnce('file content here')

      const content = await provider.downloadFile(session.sandboxId, '/tmp/output.txt')

      expect(content).toBe('file content here')
      expect(mockSandbox.files.read).toHaveBeenCalledWith('/tmp/output.txt')
    })

    it('listFiles returns file names', async () => {
      const session = await provider.create('org-1', 'test')

      const files = await provider.listFiles(session.sandboxId, '/tmp')

      expect(files).toEqual(['file1.txt', 'dir1'])
      expect(mockSandbox.files.list).toHaveBeenCalledWith('/tmp')
    })

    it('throws when sandbox not found for file operations', async () => {
      await expect(provider.uploadFile('bad-id', '/tmp/x', 'y')).rejects.toThrow('not found')
      await expect(provider.downloadFile('bad-id', '/tmp/x')).rejects.toThrow('not found')
      await expect(provider.listFiles('bad-id', '/tmp')).rejects.toThrow('not found')
    })
  })
})
