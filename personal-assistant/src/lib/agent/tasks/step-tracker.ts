import type { SupabaseClient } from '@supabase/supabase-js'
import type { ExecutionStep } from './types'

/**
 * Batch-insert steps for a task. Steps are numbered 1..N in insertion order.
 */
export async function createSteps(
  supabase: SupabaseClient,
  taskId: string,
  steps: Array<{ step_name: string; input?: Record<string, unknown> }>,
): Promise<ExecutionStep[]> {
  const rows = steps.map((s, i) => ({
    task_id: taskId,
    step_number: i + 1,
    step_name: s.step_name,
    status: 'pending' as const,
    input: s.input ?? null,
  }))

  const { data, error } = await supabase
    .from('execution_steps')
    .insert(rows)
    .select()

  if (error) throw new Error(`createSteps failed: ${error.message}`)
  return data as ExecutionStep[]
}

/**
 * Transition a step from pending -> working and update parent task's
 * current_step, progress_message, and heartbeat_at.
 */
export async function startStep(
  supabase: SupabaseClient,
  taskId: string,
  stepNumber: number,
): Promise<ExecutionStep | null> {
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('execution_steps')
    .update({ status: 'working', started_at: now })
    .eq('task_id', taskId)
    .eq('step_number', stepNumber)
    .eq('status', 'pending')
    .select()
    .single()

  if (error || !data) return null

  const steps = await getStepsForTask(supabase, taskId)
  const totalCount = steps.length

  await supabase.from('execution_tasks').update({
    current_step: stepNumber,
    progress_message: `Running step ${stepNumber}/${totalCount}: ${data.step_name}`,
    heartbeat_at: now,
  }).eq('id', taskId)

  return data as ExecutionStep
}

/**
 * Transition a step from working -> completed, sets output and duration,
 * and recalculates parent task's progress_pct.
 */
export async function completeStep(
  supabase: SupabaseClient,
  taskId: string,
  stepNumber: number,
  output: Record<string, unknown>,
): Promise<ExecutionStep | null> {
  const now = new Date().toISOString()

  // Fetch the step to compute duration
  const { data: existing } = await supabase
    .from('execution_steps')
    .select('started_at, step_name')
    .eq('task_id', taskId)
    .eq('step_number', stepNumber)
    .single()

  const durationMs =
    existing?.started_at ? Date.now() - new Date(existing.started_at).getTime() : null

  const { data, error } = await supabase
    .from('execution_steps')
    .update({
      status: 'completed',
      output,
      completed_at: now,
      duration_ms: durationMs,
    })
    .eq('task_id', taskId)
    .eq('step_number', stepNumber)
    .eq('status', 'working')
    .select()
    .single()

  if (error || !data) return null

  // Recalculate parent progress
  const steps = await getStepsForTask(supabase, taskId)
  const completedCount = steps.filter(s => s.status === 'completed').length
  const totalCount = steps.length
  const progressPct = Math.round((completedCount / totalCount) * 100)
  const nextStep = steps.find(s => s.status === 'pending')

  await supabase.from('execution_tasks').update({
    current_step: stepNumber,
    progress_pct: progressPct,
    progress_message: nextStep
      ? `Step ${stepNumber}/${totalCount} done. Next: ${nextStep.step_name}`
      : `All ${totalCount} steps complete`,
    heartbeat_at: now,
  }).eq('id', taskId)

  return data as ExecutionStep
}

/**
 * Transition a step from working -> failed and set error_message.
 */
export async function failStep(
  supabase: SupabaseClient,
  taskId: string,
  stepNumber: number,
  errorMessage: string,
): Promise<ExecutionStep | null> {
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('execution_steps')
    .update({
      status: 'failed',
      error_message: errorMessage,
      completed_at: now,
    })
    .eq('task_id', taskId)
    .eq('step_number', stepNumber)
    .eq('status', 'working')
    .select()
    .single()

  if (error || !data) return null
  return data as ExecutionStep
}

/**
 * Transition a step from pending -> skipped.
 */
export async function skipStep(
  supabase: SupabaseClient,
  taskId: string,
  stepNumber: number,
): Promise<ExecutionStep | null> {
  const { data, error } = await supabase
    .from('execution_steps')
    .update({ status: 'skipped' })
    .eq('task_id', taskId)
    .eq('step_number', stepNumber)
    .eq('status', 'pending')
    .select()
    .single()

  if (error || !data) return null
  return data as ExecutionStep
}

/**
 * Fetch all steps for a task ordered by step_number ascending.
 */
export async function getStepsForTask(
  supabase: SupabaseClient,
  taskId: string,
): Promise<ExecutionStep[]> {
  const { data, error } = await supabase
    .from('execution_steps')
    .select('*')
    .eq('task_id', taskId)
    .order('step_number', { ascending: true })

  if (error) throw new Error(`getStepsForTask failed: ${error.message}`)
  return (data ?? []) as ExecutionStep[]
}
