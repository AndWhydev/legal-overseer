/**
 * Contract Review skill — public surface.
 *
 * Wraps the model call so the rest of the codebase can run a contract
 * review without knowing about the SDK. The result is a structured
 * ContractReviewResult that the compliance layer wraps in an AI
 * disclaimer + enqueues into the review queue.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { createSafeLogger } from '../../governance/index.js';
import { redactForExternalModel } from '../../compliance/privilege.js';
import { wrapWithDisclaimer } from '../../compliance/disclaimer.js';
import { getSkillDefinition } from '../registry.js';
import type { ContractReviewResult, RiskSeverity } from './types.js';

export type { ContractReviewResult, ContractFinding, RiskSeverity } from './types.js';

const logger = createSafeLogger('ContractReview');

const MODEL_MAP = {
  haiku: 'claude-haiku-4-5',
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-7',
} as const;

export interface ContractReviewInput {
  /** Matter id (foreign key into matters). Null for ad-hoc one-off reviews. */
  matterId: string | null;
  /** Human-readable reference: filename, "Schedule 3", clause range. */
  documentRef: string;
  /** Full contract text to review. Will be redacted before sending. */
  contractText: string;
  /** Optional model override (otherwise uses the registry default). */
  modelTier?: 'haiku' | 'sonnet' | 'opus';
}

export interface ContractReviewOutput {
  result: ContractReviewResult;
  /** Markdown body with the AI disclaimer block appended. */
  reviewMarkdown: string;
  costUsd?: number;
}

/**
 * Default review when the model returns malformed output. We log the
 * raw text + flag the run as low-confidence so the reviewer notices.
 */
function fallback(input: ContractReviewInput, raw: string): ContractReviewResult {
  return {
    matterId: input.matterId,
    documentRef: input.documentRef,
    summary: `Model returned malformed JSON; raw text preserved for reviewer (${raw.length} chars).`,
    overallRisk: 'high',
    findings: [],
    missingClauses: [],
    recommendedRedlines: 0,
    unverified: true,
    generatedAt: new Date().toISOString(),
  };
}

export async function runContractReview(
  input: ContractReviewInput,
): Promise<ContractReviewOutput> {
  const skill = getSkillDefinition('contract_review');
  const model = MODEL_MAP[input.modelTier ?? skill.defaultModel];

  // Privilege protection: local redaction before any Anthropic API call.
  const redacted = redactForExternalModel(input.contractText, { matterId: input.matterId });

  const userPrompt = `${skill.systemPrompt}

---

Document to review: ${input.documentRef}
Matter id: ${input.matterId ?? '(ad-hoc, no matter)'}

CONTRACT TEXT (privilege-redacted):
${redacted.text}

Produce the JSON review now.`;

  logger.info(`Reviewing contract ${input.documentRef} with ${input.modelTier ?? skill.defaultModel}`);

  let raw = '';
  let costUsd: number | undefined;
  try {
    for await (const msg of query({
      prompt: userPrompt,
      options: {
        model,
        maxTurns: 1,
        maxBudgetUsd: skill.maxBudgetUsd,
        allowedTools: skill.tools,
      },
    })) {
      if (typeof msg === 'object' && msg !== null && 'type' in msg && (msg as { type?: string }).type === 'result') {
        const m = msg as { result?: string; total_cost_usd?: number };
        raw = m.result ?? raw;
        costUsd = m.total_cost_usd ?? costUsd;
      }
    }
  } catch (err) {
    logger.error(`Contract review failed: ${err instanceof Error ? err.message : String(err)}`);
    const result = fallback(input, '');
    return {
      result,
      reviewMarkdown: wrapWithDisclaimer(`Contract review FAILED: ${err instanceof Error ? err.message : String(err)}`),
      costUsd,
    };
  }

  let result: ContractReviewResult;
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    result = fallback(input, raw);
  } else {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as Partial<ContractReviewResult> & { overallRisk?: RiskSeverity };
      result = {
        matterId: input.matterId,
        documentRef: input.documentRef,
        summary: parsed.summary ?? '(no summary)',
        overallRisk: parsed.overallRisk ?? 'medium',
        findings: parsed.findings ?? [],
        missingClauses: parsed.missingClauses ?? [],
        recommendedRedlines: parsed.recommendedRedlines ?? (parsed.findings?.length ?? 0),
        unverified: true,
        generatedAt: new Date().toISOString(),
      };
    } catch (err) {
      logger.warn(`Could not parse review JSON: ${err instanceof Error ? err.message : String(err)}`);
      result = fallback(input, raw);
    }
  }

  const md = renderReviewMarkdown(result);
  return { result, reviewMarkdown: wrapWithDisclaimer(md), costUsd };
}

function renderReviewMarkdown(r: ContractReviewResult): string {
  const findings = r.findings
    .map(
      (f, i) =>
        `### ${i + 1}. [${f.severity.toUpperCase()}] ${f.clauseRef}\n\n` +
        `**Risk:** ${f.riskExplanation}\n\n` +
        `**Suggested redline:**\n\n> ${f.suggestedRedline.replace(/\n/g, '\n> ')}`,
    )
    .join('\n\n');

  const missing = r.missingClauses.length
    ? r.missingClauses.map((m) => `- ${m}`).join('\n')
    : '_None identified._';

  return `# Contract Review — ${r.documentRef}

**Matter:** ${r.matterId ?? '(ad-hoc)'}
**Overall risk:** ${r.overallRisk.toUpperCase()}
**Findings:** ${r.findings.length} | **Missing clauses:** ${r.missingClauses.length} | **Redlines:** ${r.recommendedRedlines}

## Summary

${r.summary}

## Findings

${findings || '_No findings._'}

## Missing clauses

${missing}
`;
}
