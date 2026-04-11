// ---------------------------------------------------------------------------
// Browser automation types for Stagehand / Browserbase integration
// ---------------------------------------------------------------------------

/** Status lifecycle for a browser automation task. */
export type BrowserTaskStatus =
  | 'pending'
  | 'running'
  | 'navigating'
  | 'acting'
  | 'extracting'
  | 'completed'
  | 'failed'
  | 'cancelled'

/** Parameters for spawning a browser automation task. */
export interface BrowserTaskParams {
  /** Natural-language goal the browser agent should accomplish. */
  instruction: string

  /** Starting URL to navigate to (optional -- agent may navigate itself). */
  startUrl?: string

  /** Maximum number of agent steps before aborting. */
  maxSteps?: number

  /** Zod-serialisable JSON schema for structured extraction output. */
  outputSchema?: Record<string, unknown>

  /** Whether to return a session replay link. */
  includeReplay?: boolean
}

/** Atomic browser action recorded during execution. */
export interface BrowserAction {
  /** Sequential step index (0-based). */
  stepIndex: number

  /** What the agent did (act / observe / extract / navigate). */
  type: 'act' | 'observe' | 'extract' | 'navigate'

  /** Natural-language description of the action. */
  description: string

  /** ISO-8601 timestamp. */
  timestamp: string

  /** Whether this individual action succeeded. */
  success: boolean

  /** Optional detail / error message. */
  detail?: string
}

/** Evidence bundle captured during a browser automation task (CUA-09). */
export interface BrowserEvidence {
  /** Browserbase session replay URL for post-hoc review. */
  sessionReplayUrl: string

  /** Ordered log of every action the agent performed. */
  actionLog: BrowserAction[]

  /** Total number of actions performed. */
  actionCount: number

  /** Wall-clock duration in seconds. */
  durationSeconds: number
}

/** Result returned when a browser task completes (or fails). */
export interface BrowserTaskResult {
  /** Final status. */
  status: BrowserTaskStatus

  /** Structured data extracted (if any). */
  extractedData?: unknown

  /** Summary message from the agent. */
  message?: string

  /** Ordered log of actions performed. */
  actions: BrowserAction[]

  /** Browserbase session ID (for replay / debugging). */
  sessionId?: string

  /** Browserbase session replay URL. */
  replayUrl?: string

  /** Token usage from the underlying LLM. */
  usage?: {
    inputTokens: number
    outputTokens: number
    reasoningTokens?: number
  }

  /** Total wall-clock duration in milliseconds. */
  durationMs?: number

  /** Error message when status === 'failed'. */
  error?: string

  /** Evidence bundle for audit trail and debugging (CUA-09). */
  evidence: BrowserEvidence
}

/** Configuration passed to the Stagehand constructor. */
export interface StagehandConfig {
  /** Browserbase API key. */
  apiKey: string

  /** Browserbase project ID. */
  projectId: string

  /** Execution environment. */
  env: 'BROWSERBASE' | 'LOCAL'

  /** LLM model to use for browser actions. */
  modelName?: string

  /** LLM provider client options (e.g. apiKey for the model provider). */
  modelClientOptions?: Record<string, unknown>

  /** Enable action-level caching. */
  enableCaching?: boolean

  /** Logging verbosity (0 = silent, 1 = info, 2 = debug). */
  verbose?: number
}
