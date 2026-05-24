/**
 * Matter Drafting skill — public surface.
 *
 * Drafts letters, memos, contracts, court documents from a brief.
 * Output always ends with the AI disclaimer block.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { createSafeLogger } from '../../governance/index.js';
import { wrapWithDisclaimer } from '../../compliance/disclaimer.js';
import { pickBestPrecedent } from '../../precedents/index.js';
import { pickBestTemplate } from '../../templates/index.js';
import { getSkillDefinition } from '../registry.js';
import type { DocumentType, DraftedDocument } from './types.js';

export type { DocumentType, DraftedDocument } from './types.js';

const logger = createSafeLogger('MatterDrafting');

const MODEL_MAP = {
  haiku: 'claude-haiku-4-5',
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-7',
} as const;

export interface MatterDraftingInput {
  matterId: string | null;
  documentType: DocumentType;
  title: string;
  audience: string;
  /** Full brief: facts, parties, desired outcome, prior correspondence. */
  brief: string;
  /** Optional template snippets the lawyer wants reused. */
  templateHints?: string;
  modelTier?: 'haiku' | 'sonnet' | 'opus';
}

export interface MatterDraftingOutput {
  document: DraftedDocument;
  costUsd?: number;
}

const PLACEHOLDER_REGEX = /\[CONFIRM:[^\]]+\]/gi;

export async function runMatterDrafting(
  input: MatterDraftingInput,
): Promise<MatterDraftingOutput> {
  const skill = getSkillDefinition('matter_drafting');
  const model = MODEL_MAP[input.modelTier ?? skill.defaultModel];

  // Consult the firm's precedent library first; fall back to built-in
  // templates if there's nothing in the library that matches.
  const precedent = pickBestPrecedent({ documentType: input.documentType });
  const fallbackTemplate = precedent ? null : pickBestTemplate({ documentType: input.documentType });

  const precedentBlock = precedent
    ? `\n## Firm precedent (PREFER THIS over generic templates)
Title: ${precedent.title}
Category: ${precedent.category}

\`\`\`
${precedent.body_markdown.slice(0, 8000)}
\`\`\`
`
    : fallbackTemplate
      ? `\n## Built-in template (use as a starting point)
Title: ${fallbackTemplate.title}

\`\`\`
${fallbackTemplate.body_markdown.slice(0, 8000)}
\`\`\`
`
      : '';

  const userPrompt = `${skill.systemPrompt}

---

Matter id: ${input.matterId ?? '(ad-hoc)'}
Document type: ${input.documentType}
Title: ${input.title}
Audience: ${input.audience}

Brief:
${input.brief}

${input.templateHints ? `Template hints:\n${input.templateHints}\n\n` : ''}${precedentBlock}

Produce the full document body in Markdown. Use [CONFIRM: ...]
placeholders wherever a fact must be checked. End with the AI
disclaimer block.`;

  logger.info(`Drafting ${input.documentType}: ${input.title}`);

  let body = '';
  let costUsd: number | undefined;
  try {
    for await (const msg of query({
      prompt: userPrompt,
      options: {
        model,
        maxTurns: 2,
        maxBudgetUsd: skill.maxBudgetUsd,
        allowedTools: skill.tools,
      },
    })) {
      if (typeof msg === 'object' && msg !== null && 'type' in msg && (msg as { type?: string }).type === 'result') {
        const m = msg as { result?: string; total_cost_usd?: number };
        body = m.result ?? body;
        costUsd = m.total_cost_usd ?? costUsd;
      }
    }
  } catch (err) {
    logger.error(`Drafting failed: ${err instanceof Error ? err.message : String(err)}`);
    body = `DRAFTING FAILED: ${err instanceof Error ? err.message : String(err)}`;
  }

  const placeholders = Array.from(new Set(body.match(PLACEHOLDER_REGEX) ?? []));

  const document: DraftedDocument = {
    matterId: input.matterId,
    documentType: input.documentType,
    title: input.title,
    audience: input.audience,
    bodyMarkdown: wrapWithDisclaimer(body),
    placeholders,
    unverified: true,
    generatedAt: new Date().toISOString(),
  };

  return { document, costUsd };
}
