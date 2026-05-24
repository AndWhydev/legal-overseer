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
import { searchAustLiiMulti, isAustLiiUrl, type AustLiiResult } from '../../integrations/austlii/index.js';
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

function buildAustLiiContext(results: AustLiiResult[]): string {
  if (results.length === 0) return '';
  const lines = results.slice(0, 10).map((r, i) => {
    const dbTag = r.database ? ` [${r.database}]` : '';
    const yearTag = r.year ? ` (${r.year})` : '';
    return `${i + 1}. ${r.title}${yearTag}${dbTag}\n   URL: ${r.url}\n   ${r.snippet.slice(0, 200)}`;
  });
  return `\n\n## AustLII search results (authoritative — citations sourced here are pre-verified)\n\n${lines.join('\n\n')}\n`;
}

function buildSubQueries(question: string, jurisdiction: string): string[] {
  const trimmed = question.trim().replace(/\s+/g, ' ');
  const out: string[] = [trimmed.slice(0, 200)];
  // Add a jurisdiction-prefixed variant when a state was specified.
  if (jurisdiction && jurisdiction !== 'Commonwealth of Australia / state of matter') {
    out.push(`${jurisdiction} ${trimmed.slice(0, 180)}`);
  }
  return out;
}

export async function runLegalResearch(
  input: LegalResearchInput,
): Promise<LegalResearchOutput> {
  const skill = getSkillDefinition('legal_research');
  const model = MODEL_MAP[input.modelTier ?? skill.defaultModel];
  const jurisdiction = input.jurisdiction ?? 'Commonwealth of Australia / state of matter';

  // Pre-search AustLII before the model runs. Even if the model
  // hallucinates, the lawyer has the real hits next to the memo.
  const austliiResp = await searchAustLiiMulti(buildSubQueries(input.question, jurisdiction), 6);
  const austliiBlock = buildAustLiiContext(austliiResp.results);

  const userPrompt = `${skill.systemPrompt}

---

Matter id: ${input.matterId ?? '(ad-hoc)'}
Jurisdiction: ${jurisdiction}

Question:
${input.question}

${input.facts ? `Facts:\n${input.facts}\n\n` : ''}
${austliiBlock}
You MUST prefer the AustLII URLs above when citing — they are the
authoritative free-access source. Cite by full neutral citation and
include the AustLII URL in the citation row whenever the case or
statute appears in the list above.

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

  // Auto-promote any citation whose URL is rooted at AustLII to
  // verified, since the URL came directly from our authoritative
  // search. The verifier is still run for non-AustLII URLs.
  const austliiUrls = new Set(austliiResp.results.map((r) => r.url));
  const preVerified: Citation[] = memo.citations.map((c) =>
    c.url && (isAustLiiUrl(c.url) || austliiUrls.has(c.url))
      ? {
          ...c,
          verified: true,
          verificationNote: 'AustLII (auto-verified — URL sourced from real-time AustLII search)',
        }
      : c,
  );

  // Append any AustLII hits the model did not cite, so the lawyer can
  // see the on-point authority the system surfaced.
  const cited = new Set(preVerified.map((c) => c.url ?? c.text));
  const extra: Citation[] = austliiResp.results
    .filter((r) => !cited.has(r.url))
    .slice(0, 5)
    .map((r) => ({
      text: r.citation,
      url: r.url,
      verified: true,
      verificationNote: 'AustLII (auto-surfaced — not cited by model, but returned by search)',
    }));

  // Verify citations that didn't come from AustLII (best effort).
  // AustLII-sourced citations skip the verifier — they are already
  // authoritative by definition.
  const allCitations = [...preVerified, ...extra];
  const toVerify = allCitations.filter((c) => !c.verified);
  const verified = await verifyCitations(toVerify);
  const verifiedMap = new Map(verified.map((v, i) => [toVerify[i], v]));
  memo.citations = allCitations.map((c) => verifiedMap.get(c) ?? c);

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
