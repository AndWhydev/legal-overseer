import type { SupabaseClient } from '@supabase/supabase-js'
import { writeToDeadLetterQueue } from '@/lib/agent/dlq'
import { DEFAULT_RETRY_POLICIES } from './types'
import type { CreateTaskParams, ExecutionStep, ExecutionTask } from './types'

export async function createTask(
  supabase: SupabaseClient,
  params: CreateTaskParams,
): Promise<ExecutionTask> {
  const retryPolicy = {
    ...DEFAULT_RETRY_POLICIES[params.task_type],
    ...params.retry_policy,
  }

  const { data, error } = await supabase
    .from('execution_tasks')
    .insert({
      org_id: params.org_id,
      thread_id: params.thread_id ?? null,
      task_type: params.task_type,
      task_name: params.task_name,
      task_payload: params.task_payload ?? {},
      priority: params.priority ?? 1,
      total_steps: params.total_steps ?? null,
      max_retries: params.max_retries ?? 3,
      retry_policy: retryPolicy,
    })
    .select()
    .single<ExecutionTask>()

  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to create task')
  }

  if (params.steps && params.steps.length > 0) {
    const stepRows = params.steps.map((s, i) => ({
      task_id: data.id,
      step_number: i + 1,
      step_name: s.step_name,
      input: s.input ?? null,
    }))
    const { error: stepsError } = await supabase.from('execution_steps').insert(stepRows)
    if (stepsError) {
      throw new Error(stepsError.message)
    }
  }

  return data
}

export async function claimTask(
  supabase: SupabaseClient,
  taskId: string,
  workerId: string,
): Promise<ExecutionTask | null> {
  const { data, error } = await supabase
    .from('execution_tasks')
    .update({
      status: 'claimed',
      worker_id: workerId,
      claimed_at: new Date().toISOString(),
      heartbeat_at: new Date().toISOString(),
    })
    .eq('id', taskId)
    .eq('status', 'pending')
    .select()
    .single<ExecutionTask>()

  if (error) {
    throw new Error(error.message)
  }

  return data
}

export async function startTask(
  supabase: SupabaseClient,
  taskId: string,
): Promise<ExecutionTask | null> {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('execution_tasks')
    .update({
      status: 'working',
      started_at: now,
      heartbeat_at: now,
    })
    .eq('id', taskId)
    .eq('status', 'claimed')
    .select()
    .single<ExecutionTask>()

  if (error) {
    throw new Error(error.message)
  }

  return data
}

export async function updateProgress(
  supabase: SupabaseClient,
  taskId: string,
  updates: {
    current_step?: number
    progress_pct?: number
    progress_message?: string
    partial_result?: Record<string, unknown>
  },
): Promise<void> {
  const { error } = await supabase
    .from('execution_tasks')
    .update({
      ...updates,
      heartbeat_at: new Date().toISOString(),
    })
    .eq('id', taskId)

  if (error) {
    throw new Error(error.message)
  }
}

export async function completeTask(
  supabase: SupabaseClient,
  taskId: string,
  result: Record<string, unknown>,
): Promise<ExecutionTask | null> {
  const { data, error } = await supabase
    .from('execution_tasks')
    .update({
      status: 'completed',
      result,
      completed_at: new Date().toISOString(),
      progress_pct: 100,
      progress_message: 'Completed',
    })
    .eq('id', taskId)
    .eq('status', 'working')
    .select()
    .single<ExecutionTask>()

  if (error) {
    throw new Error(error.message)
  }

  return data
}

export async function failTask(
  supabase: SupabaseClient,
  taskId: string,
  errorInfo: { message: string; stack?: string },
): Promise<{ task: ExecutionTask; retrying: boolean }> {
  // First mark as failed
  const { data: failedTask, error: failError } = await supabase
    .from('execution_tasks')
    .update({
      status: 'failed',
      error_message: errorInfo.message,
      error_stack: errorInfo.stack ?? null,
    })
    .eq('id', taskId)
    .eq('status', 'working')
    .select()
    .single<ExecutionTask>()

  if (failError || !failedTask) {
    throw new Error(failError?.message ?? 'TASK_STATE_CONFLICT')
  }

  if (failedTask.retry_count < failedTask.max_retries) {
    // Retryable: transition back to pending
    await supabase
      .from('execution_tasks')
      .update({
        status: 'pending',
        worker_id: null,
        claimed_at: null,
        heartbeat_at: null,
        retry_count: failedTask.retry_count + 1,
      })
      .eq('id', taskId)
      .eq('status', 'failed')

    return { task: failedTask, retrying: true }
  }

  // Terminal failure: write to DLQ
  await writeToDeadLetterQueue(supabase, {
    orgId: failedTask.org_id,
    agentType: failedTask.task_type,
    errorMessage: errorInfo.message,
    errorStack: errorInfo.stack,
    payload: {
      taskId,
      taskName: failedTask.task_name,
      taskPayload: failedTask.task_payload,
    },
  })

  return { task: failedTask, retrying: false }
}

export async function cancelTask(
  supabase: SupabaseClient,
  taskId: string,
  cancelledBy: 'user' | 'system',
): Promise<ExecutionTask | null> {
  const now = new Date().toISOString()

  // Fetch current task to preserve partial_result and validate cancellable states
  const { data: current, error: fetchError } = await supabase
    .from('execution_tasks')
    .select('status, partial_result')
    .eq('id', taskId)
    .single<Pick<ExecutionTask, 'status' | 'partial_result'>>()

  if (fetchError || !current) {
    throw new Error(fetchError?.message ?? 'TASK_NOT_FOUND')
  }

  const cancellableStatuses = ['pending', 'claimed', 'working', 'paused']
  if (!cancellableStatuses.includes(current.status)) {
    throw new Error(`TASK_NOT_CANCELLABLE: status is ${current.status}`)
  }

  const { data, error } = await supabase
    .from('execution_tasks')
    .update({
      status: 'cancelled',
      cancelled_at: now,
      cancelled_by: cancelledBy,
    })
    .eq('id', taskId)
    .eq('status', current.status)
    .select()
    .single<ExecutionTask>()

  if (error) {
    throw new Error(error.message)
  }

  return data
}

export async function pauseTask(
  supabase: SupabaseClient,
  taskId: string,
): Promise<ExecutionTask | null> {
  const { data, error } = await supabase
    .from('execution_tasks')
    .update({ status: 'paused' })
    .eq('id', taskId)
    .eq('status', 'working')
    .select()
    .single<ExecutionTask>()

  if (error) {
    throw new Error(error.message)
  }

  return data
}

export async function resumeTask(
  supabase: SupabaseClient,
  taskId: string,
): Promise<ExecutionTask | null> {
  const { data, error } = await supabase
    .from('execution_tasks')
    .update({
      status: 'working',
      heartbeat_at: new Date().toISOString(),
    })
    .eq('id', taskId)
    .eq('status', 'paused')
    .select()
    .single<ExecutionTask>()

  if (error) {
    throw new Error(error.message)
  }

  return data
}

export async function sendHeartbeat(
  supabase: SupabaseClient,
  taskId: string,
): Promise<void> {
  const { error } = await supabase
    .from('execution_tasks')
    .update({ heartbeat_at: new Date().toISOString() })
    .eq('id', taskId)

  if (error) {
    throw new Error(error.message)
  }
}

export async function getTask(
  supabase: SupabaseClient,
  taskId: string,
): Promise<ExecutionTask | null> {
  const { data, error } = await supabase
    .from('execution_tasks')
    .select('*')
    .eq('id', taskId)
    .single<ExecutionTask>()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(error.message)
  }

  return data
}

export async function listTasks(
  supabase: SupabaseClient,
  orgId: string,
  filters?: { status?: string; task_type?: string },
): Promise<ExecutionTask[]> {
  let query = supabase
    .from('execution_tasks')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

  if (filters?.status) {
    query = query.eq('status', filters.status)
  }
  if (filters?.task_type) {
    query = query.eq('task_type', filters.task_type)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as ExecutionTask[]
}

export async function getTasksByThread(
  supabase: SupabaseClient,
  orgId: string,
  threadId: string,
): Promise<ExecutionTask[]> {
  const { data, error } = await supabase
    .from('execution_tasks')
    .select('*')
    .eq('org_id', orgId)
    .eq('thread_id', threadId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as ExecutionTask[]
}

export async function getActiveTasks(
  supabase: SupabaseClient,
  orgId: string,
): Promise<ExecutionTask[]> {
  const { data, error } = await supabase
    .from('execution_tasks')
    .select('*')
    .eq('org_id', orgId)
    .in('status', ['pending', 'claimed', 'working', 'paused'])
    .order('priority', { ascending: false })
    .order('created_at', { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as ExecutionTask[]
}

export async function getTaskWithSteps(
  supabase: SupabaseClient,
  taskId: string,
): Promise<{ task: ExecutionTask; steps: ExecutionStep[] } | null> {
  const { data: task, error: taskError } = await supabase
    .from('execution_tasks')
    .select('*')
    .eq('id', taskId)
    .single<ExecutionTask>()

  if (taskError) {
    if (taskError.code === 'PGRST116') return null
    throw new Error(taskError.message)
  }

  const { data: steps, error: stepsError } = await supabase
    .from('execution_steps')
    .select('*')
    .eq('task_id', taskId)
    .order('step_number', { ascending: true })

  if (stepsError) {
    throw new Error(stepsError.message)
  }

  return { task, steps: (steps ?? []) as ExecutionStep[] }
}

export async function deleteTask(
  supabase: SupabaseClient,
  taskId: string,
): Promise<ExecutionTask | null> {
  return cancelTask(supabase, taskId, 'user')
}
