/**
 * Coordinator module for BitBit
 *
 * Implements the Coordinator pattern for task classification and routing.
 * Uses Haiku for cheap classification, then routes to appropriate skill
 * with the correct model tier.
 */

import { query, type McpServerConfig } from '@anthropic-ai/claude-agent-sdk';
import { getSkillDefinition } from '../skills/registry.js';
import type { SkillType, TaskClassification } from '../skills/types.js';
import { createSafeLogger } from '../governance/index.js';

const logger = createSafeLogger('Coordinator');

/**
 * Classifier prompt template
 *
 * Haiku classifies tasks to determine which skill should handle them.
 * This enables cost-effective routing (Haiku is ~10x cheaper than Sonnet).
 */
const CLASSIFIER_PROMPT = `Classify this task for CheekyGlo's agent system.

Available skills:
- rd_scout: Market research, Alibaba/1688 product scanning, trend analysis, competitor research, supplier discovery
- gatekeeper: Content QA, video review, style guide compliance, brand consistency, technical quality checks
- ops_officer: Invoice processing, supplier verification, payment preparation, expense tracking, anomaly detection
- general: Anything that doesn't fit above categories (general questions, simple lookups, misc tasks)

Task to classify:
{TASK_PROMPT}

Respond with JSON only (no markdown, no explanation):
{
  "skillType": "rd_scout" | "gatekeeper" | "ops_officer" | "general",
  "complexity": "simple" | "standard" | "complex",
  "requiredTools": ["tool1", "tool2"],
  "reasoning": "brief explanation"
}`;

/**
 * Model mapping from tier to SDK model identifier
 */
const MODEL_MAP = {
  haiku: 'claude-haiku-3-5-20241022',
  sonnet: 'claude-sonnet-4-20250514',
  opus: 'claude-opus-4-5-20250514',
} as const;

/**
 * Classify a task to determine routing
 *
 * Uses Haiku for fast, cheap classification. Returns the skill type
 * and complexity to guide model selection for execution.
 *
 * @param prompt - The task prompt to classify
 * @returns TaskClassification with skill type and metadata
 */
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
        maxBudgetUsd: 0.05, // Classification should be very cheap
      },
    })) {
      if (msg.type === 'result' && msg.subtype === 'success') {
        result = msg.result;
      }
    }

    // Parse the JSON response
    // Handle potential markdown code blocks
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in classifier response');
    }

    const classification = JSON.parse(jsonMatch[0]) as TaskClassification;

    // Validate the skill type
    const validSkillTypes: SkillType[] = ['rd_scout', 'gatekeeper', 'ops_officer', 'general'];
    if (!validSkillTypes.includes(classification.skillType)) {
      throw new Error(`Invalid skill type: ${classification.skillType}`);
    }

    logger.info(`Classified as: ${classification.skillType} (${classification.complexity})`);

    return classification;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Classification failed: ${errorMessage}, defaulting to general`);

    // Default to general if classification fails
    return {
      skillType: 'general',
      complexity: 'simple',
      requiredTools: [],
      reasoning: `Classification failed: ${errorMessage}. Defaulting to general skill.`,
    };
  }
}

/**
 * Result of skill-based execution
 */
export interface SkillExecutionResult {
  /** Whether execution succeeded */
  success: boolean;
  /** Output from the agent */
  output: string;
  /** Total cost in USD (if available) */
  costUsd?: number;
  /** Tools that were called */
  toolCalls: string[];
  /** Error message if failed */
  error?: string;
}

/**
 * Execute a task using a specific skill
 *
 * Runs the task with the skill's system prompt, tools, and model tier.
 * Respects the skill's cost guardrails (maxBudgetUsd).
 *
 * @param prompt - The task prompt to execute
 * @param skillType - The skill to use for execution
 * @param mcpServers - Optional MCP servers for tool access
 * @returns SkillExecutionResult with output and metadata
 */
export async function executeWithSkill(
  prompt: string,
  skillType: SkillType,
  mcpServers?: Record<string, McpServerConfig>
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
      // Track tool usage
      if (msg.type === 'tool_progress') {
        const toolName = msg.tool_name;
        if (!toolCalls.includes(toolName)) {
          toolCalls.push(toolName);
        }
      }

      // Capture final result
      if (msg.type === 'result') {
        if (msg.subtype === 'success') {
          output = msg.result;
        }
        costUsd = msg.total_cost_usd;
      }
    }

    const duration = Date.now() - startTime;
    logger.info(`Skill execution completed in ${duration}ms, cost: $${costUsd?.toFixed(4) || 'unknown'}`);

    return {
      success: true,
      output,
      costUsd,
      toolCalls,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error(`Skill execution failed after ${duration}ms: ${errorMessage}`);

    return {
      success: false,
      output: '',
      costUsd,
      toolCalls,
      error: errorMessage,
    };
  }
}

/**
 * Classify and execute a task in one call
 *
 * Convenience function that classifies the task and routes to the
 * appropriate skill automatically.
 *
 * @param prompt - The task prompt
 * @param mcpServers - Optional MCP servers for tool access
 * @returns SkillExecutionResult with classification info
 */
export async function routeAndExecute(
  prompt: string,
  mcpServers?: Record<string, McpServerConfig>
): Promise<SkillExecutionResult & { classification: TaskClassification }> {
  const classification = await classifyTask(prompt);
  const result = await executeWithSkill(prompt, classification.skillType, mcpServers);

  return {
    ...result,
    classification,
  };
}
