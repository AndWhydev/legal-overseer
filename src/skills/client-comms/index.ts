/**
 * Client Comms skill — public surface.
 *
 * Drafts client-facing emails (status update, document request, fee
 * disclosure, etc.). Output goes through the review queue before any
 * SMTP send happens.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { createSafeLogger } from '../../governance/index.js';
import { wrapWithDisclaimer } from '../../compliance/disclaimer.js';
import { getSkillDefinition } from '../registry.js';
import type { ClientEmailDraft } from './types.js';

export type { ClientEmailDraft } from './types.js';

const logger = createSafeLogger('ClientComms');

const MODEL_MAP = {
  haiku: 'claude-haiku-4-5',
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-7',
} as const;

export interface ClientCommsInput {
  matterId: string;
  matterNumber: string;
  toName: string;
  toAddress: string;
  /** What the lawyer wants the email to communicate. */
  purpose: string;
  /** Optional: recent matter events / context the email should reference. */
  contextSummary?: string;
  modelTier?: 'haiku' | 'sonnet' | 'opus';
}

export interface ClientCommsOutput {
  draft: ClientEmailDraft;
  costUsd?: number;
}

export async function runClientComms(
  input: ClientCommsInput,
): Promise<ClientCommsOutput> {
  const skill = getSkillDefinition('client_comms');
  const model = MODEL_MAP[input.modelTier ?? skill.defaultModel];

  const userPrompt = `${skill.systemPrompt}

---

Matter id: ${input.matterId}
Matter number: ${input.matterNumber}
Recipient: ${input.toName} <${input.toAddress}>

Purpose of email:
${input.purpose}

${input.contextSummary ? `Context summary:\n${input.contextSummary}\n\n` : ''}

Produce the email as JSON:
{
  "subject": "...",
  "body": "..."
}

Then end the body with the AI disclaimer block. Subject MUST start
with the matter number in square brackets, e.g. "[${input.matterNumber}] ...".`;

  logger.info(`Drafting client email for ${input.matterNumber}`);

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
    logger.error(`Client comms failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  let subject = `[${input.matterNumber}] Matter update`;
  let body = '';
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as { subject?: string; body?: string };
      subject = parsed.subject ?? subject;
      body = parsed.body ?? '';
    } catch (err) {
      logger.warn(`Could not parse email JSON: ${err instanceof Error ? err.message : String(err)}`);
      body = raw;
    }
  } else {
    body = raw;
  }

  const draft: ClientEmailDraft = {
    matterId: input.matterId,
    toName: input.toName,
    toAddress: input.toAddress,
    subject,
    bodyMarkdown: wrapWithDisclaimer(body),
    unverified: true,
    generatedAt: new Date().toISOString(),
  };

  return { draft, costUsd };
}
