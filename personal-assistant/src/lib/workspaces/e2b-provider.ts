/**
 * E2B Provider — Firecracker microVM sandbox management
 *
 * Implements WorkspaceProvider using the E2B Code Interpreter SDK.
 * Each sandbox is an isolated Firecracker microVM with full Linux OS,
 * Jupyter kernel for Python/JS, and shell access.
 *
 * Environment: requires E2B_API_KEY in process.env
 */

import type { Sandbox } from '@e2b/code-interpreter'
import type {
  WorkspaceProvider,
  WorkspaceSession,
  WorkspaceConfig,
  WorkspaceExecResult,
  WorkspaceLanguage,
  WorkspaceTemplate,
  WorkspaceArtifact,
} from './types'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes
const E2B_COST_PER_SECOND = 0.00035 // ~$0.021/min based on E2B pricing

/** Default resource limits for sandbox microVMs. */
const DEFAULT_CPUS = 1
const DEFAULT_MEMORY_MB = 512
const DEFAULT_DISK_MB = 1024

/** Map our template names to E2B sandbox templates. */
const TEMPLATE_MAP: Record<WorkspaceTemplate, string | undefined> = {
  'default': undefined, // uses E2B's default code-interpreter template
  'data-science': undefined, // same base image, pre-loaded packages handled via setup code
  'web-dev': undefined,
}

// ---------------------------------------------------------------------------
// Provider implementation
// ---------------------------------------------------------------------------

/**
 * WKSP-07 — Network isolation
 *
 * E2B Firecracker microVMs run on dedicated hosts with per-sandbox network
 * namespaces.  Each sandbox gets its own veth pair and iptables rules that:
 *   1. Deny inter-sandbox traffic (no lateral movement).
 *   2. Allow egress to the internet (pip install, API calls) — this can be
 *      restricted per-template by adding `allowedHosts` to WorkspaceConfig
 *      in a future phase.
 *   3. Expose no inbound ports to the public internet.
 *
 * Resource limits (cpus, memoryMb, diskMb) are enforced at the Firecracker
 * microVM level through E2B's Sandbox.create() options, ensuring hard caps
 * that the guest cannot exceed.
 */
export class E2BProvider implements WorkspaceProvider {
  /** In-memory map of active sandbox instances, keyed by sandboxId. */
  private sandboxes = new Map<string, Sandbox>()

  /** In-memory map of session metadata, keyed by sandboxId. */
  private sessions = new Map<string, WorkspaceSession>()

  /**
   * Lazily import the E2B SDK to avoid loading it at module init time.
   * This also allows tests to mock the import.
   */
  private async getSandboxClass(): Promise<typeof Sandbox> {
    const { Sandbox: SandboxClass } = await import('@e2b/code-interpreter')
    return SandboxClass
  }

  private getApiKey(): string {
    const key = process.env.E2B_API_KEY
    if (!key) {
      throw new Error('E2B_API_KEY environment variable is not set. Cannot create workspace.')
    }
    return key
  }

  async create(
    orgId: string,
    purpose: string,
    config?: WorkspaceConfig,
  ): Promise<WorkspaceSession> {
    const apiKey = this.getApiKey()
    const template = config?.template ?? 'default'
    const timeoutMs = config?.timeoutMs ?? DEFAULT_TIMEOUT_MS
    const cpus = config?.cpus ?? DEFAULT_CPUS
    const memoryMb = config?.memoryMb ?? DEFAULT_MEMORY_MB
    const diskMb = config?.diskMb ?? DEFAULT_DISK_MB

    logger.info('[e2b-provider] Creating sandbox', {
      orgId,
      purpose,
      template,
      timeoutMs,
      cpus,
      memoryMb,
      diskMb,
    })

    const SandboxClass = await this.getSandboxClass()
    const e2bTemplate = TEMPLATE_MAP[template]

    const sandboxOpts = {
      apiKey,
      timeoutMs,
      cpus,
      memoryMb,
      diskMb,
    }

    // Sandbox.create() accepts either a template string or options object
    const sandbox = e2bTemplate
      ? await SandboxClass.create(e2bTemplate, sandboxOpts)
      : await SandboxClass.create(sandboxOpts)

    const sandboxId = sandbox.sandboxId

    this.sandboxes.set(sandboxId, sandbox)

    const session: WorkspaceSession = {
      id: `ws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      orgId,
      sandboxId,
      status: 'running',
      purpose,
      template,
      startedAt: new Date().toISOString(),
      totalSeconds: 0,
      costUsd: 0,
    }

    this.sessions.set(sandboxId, session)

    logger.info('[e2b-provider] Sandbox created', {
      sandboxId,
      sessionId: session.id,
    })

    return session
  }

  async exec(
    sandboxId: string,
    code: string,
    language: WorkspaceLanguage,
  ): Promise<WorkspaceExecResult> {
    const sandbox = this.sandboxes.get(sandboxId)
    if (!sandbox) {
      throw new Error(`Sandbox "${sandboxId}" not found. It may have been destroyed or timed out.`)
    }

    logger.info('[e2b-provider] Executing code', {
      sandboxId,
      language,
      codeLength: code.length,
    })

    const startTime = performance.now()

    try {
      if (language === 'shell') {
        // Shell commands use commands.run (not the Jupyter kernel)
        const result = await sandbox.commands.run(code, { timeoutMs: 60_000 })
        const durationMs = Math.round(performance.now() - startTime)

        this.updateSessionDuration(sandboxId, durationMs)

        return {
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
        }
      }

      // Python and JavaScript use the Jupyter kernel via runCode
      const execution = await sandbox.runCode(code, {
        language: language === 'javascript' ? 'javascript' : 'python',
        timeoutMs: 60_000,
      })

      const durationMs = Math.round(performance.now() - startTime)
      this.updateSessionDuration(sandboxId, durationMs)

      const artifacts: WorkspaceArtifact[] = execution.results
        .filter(r => r.png || r.jpeg || r.svg || r.html)
        .map((r, i) => {
          if (r.png) {
            return { type: 'image' as const, name: `output-${i}.png`, content: r.png, mimeType: 'image/png' }
          }
          if (r.jpeg) {
            return { type: 'image' as const, name: `output-${i}.jpg`, content: r.jpeg, mimeType: 'image/jpeg' }
          }
          if (r.svg) {
            return { type: 'image' as const, name: `output-${i}.svg`, content: r.svg, mimeType: 'image/svg+xml' }
          }
          return { type: 'data' as const, name: `output-${i}.html`, content: r.html, mimeType: 'text/html' }
        })

      return {
        stdout: execution.logs.stdout.join('\n'),
        stderr: execution.logs.stderr.join('\n'),
        exitCode: execution.error ? 1 : 0,
        error: execution.error
          ? `${execution.error.name}: ${execution.error.value}`
          : undefined,
        artifacts: artifacts.length > 0 ? artifacts : undefined,
      }
    } catch (err) {
      const durationMs = Math.round(performance.now() - startTime)
      this.updateSessionDuration(sandboxId, durationMs)

      const errorMsg = err instanceof Error ? err.message : String(err)
      logger.error('[e2b-provider] Execution failed', { sandboxId, error: errorMsg })

      return {
        stdout: '',
        stderr: errorMsg,
        exitCode: 1,
        error: errorMsg,
      }
    }
  }

  async uploadFile(
    sandboxId: string,
    path: string,
    content: string | Uint8Array,
  ): Promise<void> {
    const sandbox = this.sandboxes.get(sandboxId)
    if (!sandbox) {
      throw new Error(`Sandbox "${sandboxId}" not found.`)
    }

    await sandbox.files.write(path, content)

    logger.info('[e2b-provider] File uploaded', { sandboxId, path })
  }

  async downloadFile(sandboxId: string, path: string): Promise<string> {
    const sandbox = this.sandboxes.get(sandboxId)
    if (!sandbox) {
      throw new Error(`Sandbox "${sandboxId}" not found.`)
    }

    const content = await sandbox.files.read(path)
    return typeof content === 'string' ? content : new TextDecoder().decode(content)
  }

  async listFiles(sandboxId: string, path: string): Promise<string[]> {
    const sandbox = this.sandboxes.get(sandboxId)
    if (!sandbox) {
      throw new Error(`Sandbox "${sandboxId}" not found.`)
    }

    const entries = await sandbox.files.list(path)
    return entries.map(e => e.name)
  }

  async destroy(sandboxId: string): Promise<void> {
    const sandbox = this.sandboxes.get(sandboxId)
    if (!sandbox) {
      logger.warn('[e2b-provider] Attempted to destroy unknown sandbox', { sandboxId })
      return
    }

    logger.info('[e2b-provider] Destroying sandbox', { sandboxId })

    try {
      await sandbox.kill()
    } catch (err) {
      logger.warn('[e2b-provider] Error killing sandbox (may already be dead)', {
        sandboxId,
        error: err instanceof Error ? err.message : String(err),
      })
    }

    // Update session metadata
    const session = this.sessions.get(sandboxId)
    if (session) {
      session.status = 'completed'
      session.completedAt = new Date().toISOString()
    }

    this.sandboxes.delete(sandboxId)
    this.sessions.delete(sandboxId)
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private updateSessionDuration(sandboxId: string, additionalMs: number): void {
    const session = this.sessions.get(sandboxId)
    if (session) {
      session.totalSeconds += additionalMs / 1000
      session.costUsd = session.totalSeconds * E2B_COST_PER_SECOND
    }
  }
}
