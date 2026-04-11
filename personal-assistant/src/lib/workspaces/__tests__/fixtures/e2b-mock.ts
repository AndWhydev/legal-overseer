/**
 * E2B SDK mock fixtures for unit testing
 */

import { vi } from 'vitest'

export interface MockSandbox {
  sandboxId: string
  runCode: ReturnType<typeof vi.fn>
  commands: {
    run: ReturnType<typeof vi.fn>
  }
  files: {
    read: ReturnType<typeof vi.fn>
    write: ReturnType<typeof vi.fn>
    list: ReturnType<typeof vi.fn>
  }
  kill: ReturnType<typeof vi.fn>
}

export function createMockSandbox(overrides: Partial<MockSandbox> = {}): MockSandbox {
  return {
    sandboxId: overrides.sandboxId ?? `sandbox-${Math.random().toString(36).slice(2, 8)}`,
    runCode: overrides.runCode ?? vi.fn().mockResolvedValue({
      results: [],
      logs: { stdout: ['hello world'], stderr: [] },
      error: undefined,
      text: 'hello world',
    }),
    commands: {
      run: overrides.commands?.run ?? vi.fn().mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      }),
    },
    files: {
      read: overrides.files?.read ?? vi.fn().mockResolvedValue('file content'),
      write: overrides.files?.write ?? vi.fn().mockResolvedValue(undefined),
      list: overrides.files?.list ?? vi.fn().mockResolvedValue([
        { name: 'file1.txt', type: 'file' },
        { name: 'dir1', type: 'dir' },
      ]),
    },
    kill: overrides.kill ?? vi.fn().mockResolvedValue(undefined),
  }
}

/**
 * Creates a mock Sandbox class that can be used to mock the E2B SDK import.
 * Returns both the class and the sandbox instance for assertions.
 */
export function createMockSandboxClass(sandbox?: MockSandbox) {
  const instance = sandbox ?? createMockSandbox()
  const MockSandboxClass = {
    create: vi.fn().mockResolvedValue(instance),
  }
  return { MockSandboxClass, instance }
}
