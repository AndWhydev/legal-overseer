/**
 * Coordinator — Legal Overseer.
 *
 * Classifies an inbound task with Haiku (cheap), then routes to the
 * matching legal skill via the generic SDK loop. Skill-specific
 * structured runners (runContractReview, runLegalResearch, etc.) live
 * under src/skills/<skill>/index.ts and are called directly when the
 * caller already has structured input.
 *
 * Every successful run is wrapped by the processor in:
 *   - compliance.enqueueForReview  (mandatory human review gate)
 *   - compliance.recordAiRun       (billing transparency)
 *   - compliance.appendLegalAudit  (immutable audit trail)
 *
 * The coordinator does NOT call those itself so the bits stay
 * single-responsibility.
 */

import { query, type McpServerConfig } from '@anthropic-ai/claude-agent-sdk';
import { getSkillDefinition } from '../skills/registry.js';
import type { SkillType, TaskClassification } from '../skills/types.js';
import { createSafeLogger } from '../governance/index.js';

const logger = createSafeLogger('Coordinator');

function hasType(msg: unknown): msg is { type: string } {
  return typeof msg === 'object' && msg !== null && 'type' in msg;
}

function isResultMessage(msg: unknown): msg is { type: 'result'; subtype: 'success' | 'error'; result?: string; total_cost_usd?: number } {
  return hasType(msg) && msg.type === 'result';
}

function isToolProgressMessage(msg: unknown): msg is { type: 'tool_progress'; tool_name: string } {
  return hasType(msg) && msg.type === 'tool_progress';
}

const CLASSIFIER_PROMPT = `Classify this task for the Legal Overseer router.

Available legal skills:
- contract_review:    read a contract, flag unusual clauses, missing protections, liability risks
- legal_research:     research a legal question, produce a memo with case-law citations
- matter_drafting:    draft a letter, memo, contract, or court document from a brief
- matter_management:  identify deadlines / limitation periods / SLAs for a matter
- client_comms:       draft a client-facing update email or correspondence
- compliance_monitor: scan recent regulatory / legislative change relevant to a matter type
- general:            anything else (still gated behind human review)

Task to classify:
{TASK_PROMPT}

Respond with JSON only (no markdown, no explanation):
{
  "skillType": "contract_review|legal_research|matter_drafting|matter_management|client_comms|compliance_monitor|general",
  "complexity": "simple|standard|complex",
  "requiredTools": ["tool1"],
  "reasoning": "brief explanation"
}`;

const MODEL_MAP = {
  haiku: 'claude-haiku-4-5',
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-7',
} as const;

const VALID_SKILLS: readonly SkillType[] = [
  'contract_review',
  'legal_research',
  'matter_drafting',
  'matter_management',
  'client_comms',
  'compliance_monitor',
  'general',
];

export async function classifyTask(prompt: string): Promise<TaskClassification> {
  const classifierPrompt = CLASSIFIER_PROMPT.replace('{TASK_PROMPT}', prompt);
  let result = '';

  logger.info(`Classifying task: "${prompt.slice(0, 50)}${prompt.length > 50 ? '...' : ''}"`);

  try {
    for await (const msg of query({
      prompt: classifierPrompt,
      options: {
        model: MODEL_MAP.haiku,
        maxTurns: 1,
        maxBudgetUsd: 0.05,
      },
    })) {
      if (isResultMessage(msg) && msg.subtype === 'success') {
        result = msg.result || '';
      }
    }

    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in classifier response');
    const classification = JSON.parse(jsonMatch[0]) as TaskClassification;
    if (!VALID_SKILLS.includes(classification.skillType)) {
      throw new Error(`Invalid skill type: ${classification.skillType}`);
    }
    logger.info(`Classified as: ${classification.skillType} (${classification.complexity})`);
    return classification;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Classification failed: ${errorMessage}, defaulting to general`);
    return {
      skillType: 'general',
      complexity: 'simple',
      requiredTools: [],
      reasoning: `Classification failed: ${errorMessage}. Defaulting to general skill.`,
    };
  }
}

export interface SkillExecutionResult {
  success: boolean;
  output: string;
  costUsd?: number;
  toolCalls: string[];
  error?: string;
}

export async function executeWithSkill(
  prompt: string,
  skillType: SkillType,
  mcpServers?: Record<string, McpServerConfig>,
): Promise<SkillExecutionResult> {
  const skill = getSkillDefinition(skillType);
  const model = MODEL_MAP[skill.defaultModel];

  const fullPrompt = `${skill.systemPrompt}\n\n---\n\nTask:\n${prompt}`;
  const toolCalls: string[] = [];
  let output = '';
  let costUsd: number | undefined;

  const startTime = Date.now();
  logger.info(`Executing with skill: ${skill.name} (model: ${skill.defaultModel})`);

  try {
    for await (const msg of query({
      prompt: fullPrompt,
      options: {
        model,
        allowedTools: skill.tools,
        maxBudgetUsd: skill.maxBudgetUsd,
        maxTurns: 20,
        ...(mcpServers && { mcpServers }),
      },
    })) {
      if (isToolProgressMessage(msg)) {
        if (!toolCalls.includes(msg.tool_name)) toolCalls.push(msg.tool_name);
      }
      if (isResultMessage(msg)) {
        if (msg.subtype === 'success') output = msg.result || '';
        costUsd = msg.total_cost_usd;
      }
    }
    const duration = Date.now() - startTime;
    logger.info(`Skill execution completed in ${duration}ms, cost: $${costUsd?.toFixed(4) ?? 'unknown'}`);
    return { success: true, output, costUsd, toolCalls };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Skill execution failed after ${duration}ms: ${errorMessage}`);
    return { success: false, output: '', costUsd, toolCalls, error: errorMessage };
  }
}

export async function routeAndExecute(
  prompt: string,
  mcpServers?: Record<string, McpServerConfig>,
): Promise<SkillExecutionResult & { classification: TaskClassification }> {
  const classification = await classifyTask(prompt);
  const result = await executeWithSkill(prompt, classification.skillType, mcpServers);
  return { ...result, classification };
}
