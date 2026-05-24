/**
 * Legal Research skill — public surface.
 *
 * Produces a research memorandum and runs each cited authority through
 * the AustLII verifier (src/compliance/citationVerifier.ts). The memo
 * is returned with citations annotated [VERIFIED] / [UNVERIFIED] so a
 * reviewer can see at a glance what the system could confirm.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { createSafeLogger } from '../../governance/index.js';
import { wrapWithDisclaimer } from '../../compliance/disclaimer.js';
import { verifyCitations } from '../../compliance/citationVerifier.js';
import { getSkillDefinition } from '../registry.js';
import type { Citation, ResearchMemo } from './types.js';

export type { ResearchMemo, Citation } from './types.js';

const logger = createSafeLogger('LegalResearch');

const MODEL_MAP = {
  haiku: 'claude-haiku-4-5',
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-7',
} as const;

export interface LegalResearchInput {
  matterId: string | null;
  question: string;
  facts?: string;
  jurisdiction?: string;
  modelTier?: 'haiku' | 'sonnet' | 'opus';
}

export interface LegalResearchOutput {
  memo: ResearchMemo;
  memoMarkdown: string;
  costUsd?: number;
}

function fallback(input: LegalResearchInput, raw: string): ResearchMemo {
  return {
    matterId: input.matterId,
    questionPresented: input.question,
    shortAnswer: 'Model returned malformed JSON; raw text preserved for reviewer.',
    applicableLaw: '',
    analysis: raw.slice(0, 4000),
    conclusion: 'Review required.',
    citations: [],
    unverified: true,
    generatedAt: new Date().toISOString(),
  };
}

export async function runLegalResearch(
  input: LegalResearchInput,
): Promise<LegalResearchOutput> {
  const skill = getSkillDefinition('legal_research');
  const model = MODEL_MAP[input.modelTier ?? skill.defaultModel];

  const userPrompt = `${skill.systemPrompt}

---

Matter id: ${input.matterId ?? '(ad-hoc)'}
Jurisdiction: ${input.jurisdiction ?? 'Commonwealth of Australia / state of matter'}

Question:
${input.question}

${input.facts ? `Facts:\n${input.facts}\n\n` : ''}

Produce the memorandum as JSON with shape:
{
  "questionPresented": "...",
  "shortAnswer": "...",
  "applicableLaw": "...",
  "analysis": "...",
  "conclusion": "...",
  "citations": [
    { "text": "Citation as it appears", "url": "https://www.austlii.edu.au/..." }
  ]
}`;

  logger.info(`Researching: ${input.question.slice(0, 80)}`);

  let raw = '';
  let costUsd: number | undefined;
  try {
    for await (const msg of query({
      prompt: userPrompt,
      options: {
        model,
        maxTurns: 4,
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
    logger.error(`Research failed: ${err instanceof Error ? err.message : String(err)}`);
    const memo = fallback(input, '');
    return { memo, memoMarkdown: wrapWithDisclaimer('Legal research FAILED.'), costUsd };
  }

  let memo: ResearchMemo;
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    memo = fallback(input, raw);
  } else {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as Partial<ResearchMemo> & {
        citations?: Array<Pick<Citation, 'text' | 'url'>>;
      };
      const citationsRaw: Citation[] = (parsed.citations ?? []).map((c) => ({
        text: c.text,
        url: c.url ?? null,
        verified: false,
        verificationNote: null,
      }));

      memo = {
        matterId: input.matterId,
        questionPresented: parsed.questionPresented ?? input.question,
        shortAnswer: parsed.shortAnswer ?? '',
        applicableLaw: parsed.applicableLaw ?? '',
        analysis: parsed.analysis ?? '',
        conclusion: parsed.conclusion ?? '',
        citations: citationsRaw,
        unverified: true,
        generatedAt: new Date().toISOString(),
      };
    } catch (err) {
      logger.warn(`Could not parse memo JSON: ${err instanceof Error ? err.message : String(err)}`);
      memo = fallback(input, raw);
    }
  }

  // Verify every citation against AustLII (best effort; the verifier
  // returns the same array with `verified` + `verificationNote` set).
  memo.citations = await verifyCitations(memo.citations);

  const md = renderMemoMarkdown(memo);
  return { memo, memoMarkdown: wrapWithDisclaimer(md), costUsd };
}

function renderMemoMarkdown(m: ResearchMemo): string {
  const citations = m.citations.length
    ? m.citations
        .map((c) => {
          const tag = c.verified ? '[VERIFIED]' : '[UNVERIFIED]';
          const url = c.url ? ` — ${c.url}` : '';
          const note = c.verificationNote ? `  \n  _${c.verificationNote}_` : '';
          return `- ${tag} ${c.text}${url}${note}`;
        })
        .join('\n')
    : '_(no citations)_';

  return `# Legal Research Memorandum

**Matter:** ${m.matterId ?? '(ad-hoc)'}
**Generated:** ${m.generatedAt}

## Question presented

${m.questionPresented}

## Short answer

${m.shortAnswer}

## Applicable law

${m.applicableLaw}

## Analysis

${m.analysis}

## Conclusion

${m.conclusion}

## Citations

${citations}
`;
}
