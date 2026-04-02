/**
 * Meeting Intelligence — Intelligence Workflow
 *
 * Uses the ORCHESTRATOR WDK pattern to extract structured intelligence
 * from meeting transcripts.
 *
 * The orchestrator coordinates:
 *
 * PLANNER: Classifies the meeting type (sales / project / internal / support)
 *   and determines which analysis tasks to dispatch.
 *
 * WORKERS (execute concurrently):
 *   Worker 1: Extract decisions made during the meeting
 *   Worker 2: Extract action items with owners and due dates
 *   Worker 3: Extract commitments and promises between participants
 *   Worker 4: Assess relationship dynamics between participants
 *
 * SYNTHESIS: Combine all worker outputs into a comprehensive meeting
 *   intelligence report with an executive summary.
 *
 * @module intelligence/workflows/meeting-intel
 */

import { z } from 'zod'
import { runOrchestratorWorkflow } from '@/lib/workflows/patterns'
import type {
  WorkflowResult,
  WorkflowConfig,
  MeetingIntelResult,
  MeetingClassification,
  MeetingDecision,
  MeetingActionItem,
  MeetingCommitment,
  RelationshipDynamics,
} from './types'

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

/** Schema for the orchestrator's plan */
const meetingPlanSchema = z.object({
  classification: z.object({
    type: z
      .enum(['sales', 'project', 'internal', 'support'])
      .describe('Meeting type classification'),
    confidence: z.number().min(0).max(1).describe('Classification confidence'),
    keyTopics: z
      .array(z.string())
      .describe('Key topics discussed in the meeting'),
  }),
  tasks: z.array(
    z.object({
      id: z.string().describe('Unique task identifier'),
      type: z
        .enum(['decisions', 'action_items', 'commitments', 'dynamics'])
        .describe('Worker type to dispatch'),
      description: z
        .string()
        .describe('What this worker should extract'),
      priority: z
        .enum(['high', 'medium', 'low'])
        .describe('Priority of this extraction task'),
    }),
  ),
})

type MeetingPlan = z.infer<typeof meetingPlanSchema>
type MeetingTask = MeetingPlan['tasks'][number]

/** Schema for worker outputs — a union structure that handles all worker types */
const workerOutputSchema = z.object({
  taskType: z
    .string()
    .describe('Type of extraction performed'),

  decisions: z
    .array(
      z.object({
        decision: z.string(),
        decidedBy: z.array(z.string()),
        context: z.string(),
        impact: z.enum(['low', 'medium', 'high']),
      }),
    )
    .optional()
    .describe('Decisions extracted (for decisions worker)'),

  actionItems: z
    .array(
      z.object({
        action: z.string(),
        owner: z.string(),
        dueDate: z.string().optional(),
        priority: z.enum(['low', 'medium', 'high']),
        status: z.enum(['new', 'in_progress', 'blocked']),
      }),
    )
    .optional()
    .describe('Action items extracted (for action_items worker)'),

  commitments: z
    .array(
      z.object({
        commitment: z.string(),
        madeBy: z.string(),
        madeTo: z.string(),
        deadline: z.string().optional(),
        type: z.enum([
          'deliverable',
          'timeline',
          'budget',
          'resource',
          'other',
        ]),
      }),
    )
    .optional()
    .describe('Commitments extracted (for commitments worker)'),

  dynamics: z
    .object({
      overallTone: z.enum(['positive', 'neutral', 'tense', 'negative']),
      dynamics: z.array(z.string()),
      influenceNotes: z.array(z.string()),
      participantEngagement: z.array(
        z.object({
          participant: z.string(),
          engagementLevel: z.enum(['high', 'medium', 'low']),
          role: z.string(),
        }),
      ),
    })
    .optional()
    .describe('Relationship dynamics (for dynamics worker)'),
})

type WorkerOutput = z.infer<typeof workerOutputSchema>

// ---------------------------------------------------------------------------
// Main Workflow
// ---------------------------------------------------------------------------

/**
 * Run the meeting intelligence workflow.
 *
 * Uses the ORCHESTRATOR pattern to:
 * 1. Plan: Classify the meeting and determine extraction tasks
 * 2. Workers: Concurrently extract decisions, action items, commitments,
 *    and relationship dynamics
 * 3. Synthesize: Combine all extractions into a comprehensive report
 *
 * @param transcript - Full meeting transcript text
 * @param participants - List of participant names
 * @param config - Workflow config with orgId, supabase client, and dryRun flag
 * @returns WorkflowResult containing typed MeetingIntelResult
 */
export async function runMeetingIntel(
  transcript: string,
  participants: string[],
  config: WorkflowConfig,
): Promise<WorkflowResult<MeetingIntelResult>> {
  const startTime = Date.now()
  let stepsCompleted = 0
  let tokensEstimate = 0

  try {
    const meetingInput = [
      `PARTICIPANTS: ${participants.join(', ')}`,
      '',
      'TRANSCRIPT:',
      transcript,
    ].join('\n')

    // -----------------------------------------------------------------------
    // Run the orchestrator workflow
    // -----------------------------------------------------------------------
    const orchestratorResult = await runOrchestratorWorkflow<
      MeetingPlan,
      MeetingTask,
      WorkerOutput
    >({
      input: meetingInput,

      // -- Planner --
      plannerSystem:
        'You are a meeting intelligence coordinator. Classify the meeting type and create extraction tasks for specialized workers. Always create exactly 4 tasks: one each for decisions, action_items, commitments, and dynamics extraction.',
      plannerPrompt:
        'Analyze this meeting transcript and create an extraction plan. Classify the meeting type and define tasks for each worker:\n\n{{input}}',
      planSchema: meetingPlanSchema,
      plannerModel: 'balanced',

      // -- Workers --
      getTasks: (plan: MeetingPlan) => plan.tasks,
      getTaskType: (task: MeetingTask) => task.type,

      workerSystemByType: {
        decisions:
          'You are a meeting analyst specializing in decision extraction. Carefully read the transcript and identify every decision that was made, who made or approved it, the context, and its impact level. Be thorough — even implicit decisions count (e.g., "let\'s go with option A").',
        action_items:
          'You are a meeting analyst specializing in action item extraction. Identify every action item, task, or follow-up mentioned in the transcript. For each, determine the owner (who is responsible), any mentioned deadline, priority level, and current status. Look for phrases like "I\'ll do", "can you", "we need to", "let\'s", "by Friday", etc.',
        commitments:
          'You are a meeting analyst specializing in commitment and promise extraction. Identify every commitment, promise, or obligation made during the meeting. Determine who made the commitment, who it was made to, any deadlines, and categorize the type (deliverable, timeline, budget, resource, or other). Look for phrases like "I promise", "we\'ll deliver", "you can count on", "I guarantee", etc.',
        dynamics:
          'You are a relationship dynamics analyst. Assess the interpersonal dynamics in this meeting: overall tone (positive/neutral/tense/negative), key dynamics between participants, who holds influence, and each participant\'s engagement level and role. Look for agreement/disagreement patterns, interruptions, enthusiasm, pushback, and leadership signals.',
      },

      workerSchema: workerOutputSchema,

      taskToWorkerPrompt: (task: MeetingTask, input: string) =>
        `${task.description}\n\nExtract ${task.type} from this meeting transcript. Set taskType to "${task.type}".\n\n${input}`,

      workerModel: 'balanced',

      // -- Synthesis --
      synthesis: {
        system:
          'You are a senior meeting intelligence analyst. Synthesize all extracted meeting data into a concise executive summary. Highlight the most important decisions, critical action items, key commitments, and notable relationship dynamics. The summary should be actionable and suitable for someone who missed the meeting.',
        prompt:
          'Create an executive summary synthesizing all meeting intelligence:\n\nMeeting Plan:\n{{plan}}\n\nExtracted Intelligence:\n{{results}}\n\nOriginal Transcript:\n{{input}}',
        model: 'balanced',
      },
    })

    // Count steps: 1 (planner) + workers + 1 (synthesis)
    stepsCompleted = 1 + orchestratorResult.workers.length + 1
    tokensEstimate = stepsCompleted * 1500

    // -----------------------------------------------------------------------
    // Assemble the final result from worker outputs
    // -----------------------------------------------------------------------

    const classification: MeetingClassification =
      orchestratorResult.plan.classification

    // Collect outputs from each worker
    let decisions: MeetingDecision[] = []
    let actionItems: MeetingActionItem[] = []
    let commitments: MeetingCommitment[] = []
    let relationshipDynamics: RelationshipDynamics = {
      overallTone: 'neutral',
      dynamics: [],
      influenceNotes: [],
      participantEngagement: participants.map((p) => ({
        participant: p,
        engagementLevel: 'medium' as const,
        role: 'participant',
      })),
    }

    for (const worker of orchestratorResult.workers) {
      if (!worker.output) continue
      const output = worker.output

      if (output.decisions && output.decisions.length > 0) {
        decisions = output.decisions as MeetingDecision[]
      }
      if (output.actionItems && output.actionItems.length > 0) {
        actionItems = output.actionItems as MeetingActionItem[]
      }
      if (output.commitments && output.commitments.length > 0) {
        commitments = output.commitments as MeetingCommitment[]
      }
      if (output.dynamics) {
        relationshipDynamics = output.dynamics as RelationshipDynamics
      }
    }

    const result: MeetingIntelResult = {
      classification,
      decisions,
      actionItems,
      commitments,
      relationshipDynamics,
      executiveSummary:
        orchestratorResult.summary ?? 'No executive summary generated.',
      participants,
    }

    return {
      success: true,
      data: result,
      metrics: {
        durationMs: Date.now() - startTime,
        tokensUsed: tokensEstimate,
        stepsCompleted,
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      data: {
        classification: {
          type: 'internal',
          confidence: 0,
          keyTopics: [],
        },
        decisions: [],
        actionItems: [],
        commitments: [],
        relationshipDynamics: {
          overallTone: 'neutral',
          dynamics: [],
          influenceNotes: [],
          participantEngagement: [],
        },
        executiveSummary: `Meeting intelligence extraction failed: ${message}`,
        participants,
      },
      metrics: {
        durationMs: Date.now() - startTime,
        tokensUsed: tokensEstimate,
        stepsCompleted,
      },
      error: message,
    }
  }
}
