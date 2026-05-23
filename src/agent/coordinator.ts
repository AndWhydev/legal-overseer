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
import {
  runClaudeCodeWorker,
  type ClaudeCodeWorkerInput,
} from '../skills/claude-code-worker/index.js';
import {
  runBacklinkCampaign,
  type CampaignConfig,
  type CampaignRunResult,
} from '../skills/seo-backlinks/index.js';

const logger = createSafeLogger('Coordinator');

/**
 * Type guard to check if a value has the type property
 */
function hasType(msg: unknown): msg is { type: string } {
  return typeof msg === 'object' && msg !== null && 'type' in msg;
}

/**
 * Type guard to check if a message is a result type
 */
function isResultMessage(msg: unknown): msg is { type: 'result'; subtype: 'success' | 'error'; result?: string; total_cost_usd?: number } {
  return hasType(msg) && msg.type === 'result';
}

/**
 * Type guard to check if a message is a tool_progress type
 */
function isToolProgressMessage(msg: unknown): msg is { type: 'tool_progress'; tool_name: string } {
  return hasType(msg) && msg.type === 'tool_progress';
}

/**
 * Classifier prompt template
 *
 * Haiku classifies tasks to determine which skill should handle them.
 * This enables cost-effective routing (Haiku is ~10x cheaper than Sonnet).
 */
const CLASSIFIER_PROMPT = `Classify this task for the BitBit overseer.

Available skills:
- claude_code_worker: Dev work scoped to a registered project directory — code changes, refactors, bug fixes, running tests, anything that should be done by a headless \`claude -p\` worker inside a project. Any task that mentions a project_id, a project name, or a working directory routes here.
- rd_scout: Market research, Alibaba/1688 product scanning, trend analysis, competitor research, supplier discovery
- gatekeeper: Content QA, video review, style guide compliance, brand consistency, technical quality checks
- ops_officer: Invoice processing, supplier verification, payment preparation, expense tracking, anomaly detection
- seo_backlinks: Off-site SEO — backlink building, guest posts, directory submissions, link reports, anchor-text strategy. Any task that mentions a target domain/page plus keywords ("build backlinks for X", "submit articles to directories for keyword Y", "weekly backlink report") routes here.
- general: Anything that doesn't fit above categories (general questions, simple lookups, misc tasks)

Task to classify:
{TASK_PROMPT}

Respond with JSON only (no markdown, no explanation):
{
  "skillType": "claude_code_worker" | "rd_scout" | "gatekeeper" | "ops_officer" | "seo_backlinks" | "general",
  "complexity": "simple" | "standard" | "complex",
  "requiredTools": ["tool1", "tool2"],
  "reasoning": "brief explanation"
}`;

/**
 * Model mapping from tier to SDK model identifier
 */
const MODEL_MAP = {
  haiku: 'claude-haiku-4-5',
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-7',
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
      if (isResultMessage(msg) && msg.subtype === 'success') {
        result = msg.result || '';
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
    const validSkillTypes: SkillType[] = ['rd_scout', 'gatekeeper', 'ops_officer', 'claude_code_worker', 'seo_backlinks', 'general'];
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
  mcpServers?: Record<string, McpServerConfig>,
  workerInput?: ClaudeCodeWorkerInput,
  backlinkInput?: CampaignConfig,
): Promise<SkillExecutionResult> {
  // Claude Code Worker is a different execution model: spawn `claude -p` in
  // the project directory, don't go through the SDK query() at all.
  if (skillType === 'claude_code_worker') {
    return await executeClaudeCodeWorker(prompt, workerInput);
  }

  // SEO Backlinks is also procedural — run the pipeline rather than
  // round-tripping through the SDK, so a single Opus reasoning call
  // doesn't have to chain together discovery/generation/submission.
  if (skillType === 'seo_backlinks') {
    return await executeBacklinks(prompt, backlinkInput);
  }

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
      if (isToolProgressMessage(msg)) {
        if (!toolCalls.includes(msg.tool_name)) {
          toolCalls.push(msg.tool_name);
        }
      }

      // Capture final result
      if (isResultMessage(msg)) {
        if (msg.subtype === 'success') {
          output = msg.result || '';
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

/**
 * Execute a Claude Code Worker.
 *
 * Spawns headless `claude -p` in a registered project's directory. Result
 * is mapped onto the same SkillExecutionResult shape as the SDK-based
 * skills so the processor doesn't need to special-case it.
 *
 * @param prompt - Free-text task prompt
 * @param workerInput - Optional pre-built worker input (preferred when
 *   the caller already knows project_id, model_tier, etc.). If absent,
 *   we try to parse the prompt as a JSON ClaudeCodeWorkerInput.
 */
/**
 * Execute a backlink campaign pass.
 *
 * Caller supplies a structured CampaignConfig OR a JSON-encoded prompt
 * containing the same fields ({targetDomain, keywords, ...}). Output
 * is the CampaignRunResult serialised so it can land in tasks.output_json
 * the same shape as other skill results.
 */
async function executeBacklinks(
  prompt: string,
  backlinkInput?: CampaignConfig,
): Promise<SkillExecutionResult> {
  let config: CampaignConfig;
  if (backlinkInput) {
    config = backlinkInput;
  } else {
    try {
      const parsed = JSON.parse(prompt) as Partial<CampaignConfig>;
      if (!parsed.targetDomain || !Array.isArray(parsed.keywords) || parsed.keywords.length === 0) {
        throw new Error('seo_backlinks requires targetDomain and at least one keyword');
      }
      config = parsed as CampaignConfig;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        output: '',
        toolCalls: [],
        error: `seo_backlinks needs a CampaignConfig or a JSON prompt with targetDomain+keywords: ${msg}`,
      };
    }
  }

  let result: CampaignRunResult;
  try {
    result = await runBacklinkCampaign(config);
  } catch (err) {
    return {
      success: false,
      output: '',
      toolCalls: ['seo_backlinks.pipeline'],
      error: err instanceof Error ? err.message : String(err),
    };
  }

  return {
    success: result.errors.length === 0 || result.placements.length > 0,
    output: JSON.stringify(result),
    toolCalls: ['seo_backlinks.pipeline'],
  };
}

async function executeClaudeCodeWorker(
  prompt: string,
  workerInput?: ClaudeCodeWorkerInput,
): Promise<SkillExecutionResult> {
  let input: ClaudeCodeWorkerInput;

  if (workerInput) {
    input = workerInput;
  } else {
    try {
      const parsed = JSON.parse(prompt) as Partial<ClaudeCodeWorkerInput>;
      if (!parsed.project_id || !parsed.prompt) {
        throw new Error('worker input must include project_id and prompt');
      }
      input = parsed as ClaudeCodeWorkerInput;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        output: '',
        toolCalls: [],
        error: `claude_code_worker requires a workerInput or a JSON prompt with project_id+prompt: ${msg}`,
      };
    }
  }

  const result = await runClaudeCodeWorker(input);

  return {
    success: result.success,
    output: result.output,
    costUsd: result.costUsd,
    toolCalls: result.toolCalls,
    error: result.error,
  };
}
