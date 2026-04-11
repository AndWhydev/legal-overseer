export type TaskStatus = 'pending' | 'claimed' | 'working' | 'paused' | 'completed' | 'failed' | 'cancelled'
export type TaskType = 'agent_tool' | 'cua_browser' | 'workspace_compute' | 'standard'
export type StepStatus = 'pending' | 'working' | 'completed' | 'failed' | 'skipped'

export interface RetryPolicy {
  strategy: 'exponential' | 'fixed'
  base_delay_ms: number
  max_delay_ms: number
}

export interface ExecutionTask {
  id: string
  org_id: string
  thread_id: string | null
  task_type: TaskType
  task_name: string
  task_payload: Record<string, unknown>
  status: TaskStatus
  priority: number
  current_step: number
  total_steps: number | null
  progress_pct: number
  progress_message: string
  result: Record<string, unknown> | null
  error_message: string | null
  error_stack: string | null
  retry_count: number
  max_retries: number
  retry_policy: RetryPolicy
  worker_id: string | null
  heartbeat_at: string | null
  claimed_at: string | null
  started_at: string | null
  completed_at: string | null
  cancelled_at: string | null
  cancelled_by: string | null
  partial_result: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface ExecutionStep {
  id: string
  task_id: string
  step_number: number
  step_name: string
  status: StepStatus
  input: Record<string, unknown> | null
  output: Record<string, unknown> | null
  error_message: string | null
  started_at: string | null
  completed_at: string | null
  duration_ms: number | null
  created_at: string
}

export interface CreateTaskParams {
  org_id: string
  thread_id?: string | null
  task_type: TaskType
  task_name: string
  task_payload?: Record<string, unknown>
  priority?: number
  total_steps?: number
  max_retries?: number
  retry_policy?: Partial<RetryPolicy>
  steps?: Array<{ step_name: string; input?: Record<string, unknown> }>
}

export const DEFAULT_RETRY_POLICIES: Record<TaskType, RetryPolicy> = {
  agent_tool: { strategy: 'exponential', base_delay_ms: 1000, max_delay_ms: 30000 },
  cua_browser: { strategy: 'exponential', base_delay_ms: 5000, max_delay_ms: 60000 },
  workspace_compute: { strategy: 'exponential', base_delay_ms: 3000, max_delay_ms: 30000 },
  standard: { strategy: 'exponential', base_delay_ms: 1000, max_delay_ms: 30000 },
}
