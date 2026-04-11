/**
 * Workspace Types — Ephemeral sandbox environments for BitBit agents
 *
 * These types define the contract between the TAOR tool layer and the
 * underlying sandbox provider (E2B Firecracker microVMs).
 */

// ---------------------------------------------------------------------------
// Enums / union types
// ---------------------------------------------------------------------------

export type WorkspaceStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'timeout'

export type WorkspaceLanguage = 'python' | 'javascript' | 'shell'

export type WorkspaceTemplate = 'default' | 'data-science' | 'web-dev'

// ---------------------------------------------------------------------------
// Core interfaces
// ---------------------------------------------------------------------------

/** Tracks a single sandbox session from creation to teardown. */
export interface WorkspaceSession {
  id: string
  orgId: string
  taskId?: string
  sandboxId: string
  status: WorkspaceStatus
  purpose: string
  template: WorkspaceTemplate
  startedAt: string
  completedAt?: string
  totalSeconds: number
  costUsd: number
}

/** Options passed when creating a new workspace. */
export interface WorkspaceConfig {
  template?: WorkspaceTemplate
  timeoutMs?: number
  /** Number of vCPUs to allocate (default: 1). */
  cpus?: number
  /** Memory in megabytes (default: 512). */
  memoryMb?: number
  /** Disk in megabytes (default: 1024). */
  diskMb?: number
  metadata?: Record<string, unknown>
}

/** Result of executing code inside a workspace. */
export interface WorkspaceExecResult {
  stdout: string
  stderr: string
  exitCode: number
  error?: string
  artifacts?: WorkspaceArtifact[]
}

/** A file or data artifact produced during execution. */
export interface WorkspaceArtifact {
  type: 'file' | 'image' | 'chart' | 'data'
  name: string
  content?: string
  storagePath?: string
  mimeType?: string
  sizeBytes?: number
}

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

/**
 * Abstraction over the sandbox runtime (E2B, or future alternatives).
 * All methods are async and throw on failure.
 */
export interface WorkspaceProvider {
  /** Spin up a new sandbox and return its ID. */
  create(orgId: string, purpose: string, config?: WorkspaceConfig): Promise<WorkspaceSession>

  /** Execute code in the given language inside an existing sandbox. */
  exec(sandboxId: string, code: string, language: WorkspaceLanguage): Promise<WorkspaceExecResult>

  /** Upload a file into the sandbox filesystem. */
  uploadFile(sandboxId: string, path: string, content: string | Uint8Array): Promise<void>

  /** Download a file from the sandbox filesystem. */
  downloadFile(sandboxId: string, path: string): Promise<string>

  /** List files at a path inside the sandbox. */
  listFiles(sandboxId: string, path: string): Promise<string[]>

  /** Tear down the sandbox and release resources. */
  destroy(sandboxId: string): Promise<void>
}
