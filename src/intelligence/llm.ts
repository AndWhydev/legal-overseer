/**
 * Shared Claude Agent SDK helper for intelligence features.
 *
 * All intelligence features must:
 *   - redact privileged content locally before the model call,
 *   - go through the AI disclaimer + review queue,
 *   - log billing per matter and append a legal audit entry.
 *
 * This helper centralises the call so each feature only writes the
 * prompt and consumes a string answer + cost.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { createSafeLogger } from '../governance/index.js';
import { redactForExternalModel } from '../compliance/privilege.js';
import type { ModelTier } from '../skills/types.js';

const logger = createSafeLogger('IntelligenceLLM');

const MODEL_MAP: Record<ModelTier, string> = {
  haiku: 'claude-haiku-4-5',
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-7',
};

export interface LlmCallInput {
  /** Prompt to send (will not be redacted — the caller has already
   *  redacted any privileged context). */
  prompt: string;
  /** Model tier to use. */
  model: ModelTier;
  /** Hard budget cap. */
  maxBudgetUsd?: number;
  /** Optional system prompt override. */
  systemPrompt?: string;
}

export interface LlmCallResult {
  text: string;
  costUsd: number | undefined;
  ok: boolean;
  error?: string;
}

/**
 * Single-turn Claude call. The caller is responsible for privilege
 * redaction; this helper does not redact again.
 */
export async function callLlm(input: LlmCallInput): Promise<LlmCallResult> {
  const model = MODEL_MAP[input.model];
  let text = '';
  let costUsd: number | undefined;
  try {
    for await (const msg of query({
      prompt: input.prompt,
      options: {
        model,
        maxTurns: 1,
        maxBudgetUsd: input.maxBudgetUsd ?? 3.0,
        allowedTools: [],
        ...(input.systemPrompt ? { systemPrompt: input.systemPrompt } : {}),
      },
    })) {
      if (typeof msg === 'object' && msg !== null && 'type' in msg) {
        const m = msg as { type: string; result?: string; total_cost_usd?: number };
        if (m.type === 'result') {
          text = m.result ?? text;
          costUsd = m.total_cost_usd ?? costUsd;
        }
      }
    }
    return { text, costUsd, ok: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error(`llm call failed: ${errorMessage}`);
    return { text: '', costUsd, ok: false, error: errorMessage };
  }
}

/**
 * Convenience helper that redacts before calling.
 */
export async function callLlmWithRedaction(
  matterId: string | null,
  promptHeader: string,
  privilegedText: string,
  model: ModelTier,
  maxBudgetUsd?: number,
): Promise<LlmCallResult & { redactionCount: number }> {
  const redacted = redactForExternalModel(privilegedText, { matterId });
  const fullPrompt = `${promptHeader}\n\n--- PRIVILEGE-REDACTED CONTENT ---\n${redacted.text}\n--- END ---`;
  const result = await callLlm({ prompt: fullPrompt, model, maxBudgetUsd });
  return { ...result, redactionCount: redacted.redactions.length };
}

/** Extract first JSON object from a string. Returns null if none. */
export function extractJson<T = unknown>(raw: string): T | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
}
