/**
 * Matter-type classifier.
 *
 * Two layers:
 *   1. Keyword matching — free and instant. Covers the common phrasings
 *      a prospective client uses in their first message.
 *   2. Haiku classification — only when the keywords are ambiguous or
 *      empty. Cheap, single-turn, privilege-redacted.
 *
 * When both layers return `unknown`, the caller asks the client to
 * describe their matter in their own words.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { createSafeLogger } from '../../governance/index.js';
import { redactForExternalModel } from '../../compliance/privilege.js';
import type { MatterType } from './types.js';
import { SUPPORTED_MATTER_TYPES } from './question-sets/index.js';

const logger = createSafeLogger('IntakeClassifier');

/**
 * Keyword → matter type rules. Order matters: more specific phrases are
 * listed before broader ones so a "selling my house" beats the generic
 * "house". Each rule is a set of substrings; if any matches the message
 * (case-insensitive), the matter type is a candidate.
 */
interface KeywordRule {
  matterType: MatterType;
  keywords: string[];
}

const KEYWORD_RULES: KeywordRule[] = [
  // Employment
  {
    matterType: 'workers-compensation',
    keywords: [
      'workers comp',
      'workers compensation',
      'injured at work',
      'workplace injury',
      'hurt at work',
      'injury at work',
      'work injury',
      'broken leg at work',
      'icare',
      'workcover',
    ],
  },
  {
    matterType: 'unfair-dismissal',
    keywords: [
      'unfair dismissal',
      'fired',
      'dismissed',
      'sacked',
      'let go',
      'redundancy',
      'made redundant',
      'terminated',
      'lost my job',
      'fair work',
    ],
  },
  // Motor / public liability
  {
    matterType: 'personal-injury-motor',
    keywords: [
      'car accident',
      'motor vehicle',
      'ctp',
      'crashed',
      'car crash',
      'rear ended',
      'hit by a car',
      'run over',
      'road accident',
    ],
  },
  {
    matterType: 'personal-injury-public-liability',
    keywords: [
      'slip and fall',
      'slipped',
      'tripped',
      'public liability',
      'fell at',
      'injured in a shop',
      'defective product',
      'dog bite',
    ],
  },
  // Conveyancing
  {
    matterType: 'conveyancing-sale',
    keywords: ['selling my house', 'selling my home', 'selling property', 'sell my house', 'sale of my property'],
  },
  {
    matterType: 'conveyancing-purchase',
    keywords: [
      'buying a house',
      'buying a home',
      'purchasing property',
      'purchasing a house',
      'conveyancing',
      'settlement',
      'buying property',
      'buying a unit',
      'buying an apartment',
      'contract of sale',
    ],
  },
  // Business
  {
    matterType: 'business-purchase',
    keywords: ['buying a business', 'purchasing a business', 'buy a business', 'business acquisition', 'share sale', 'asset sale'],
  },
  // Estates
  {
    matterType: 'will-and-estate',
    keywords: [
      'will',
      'estate',
      'deceased',
      'probate',
      'executor',
      'inheritance',
      'passed away',
      'letters of administration',
      'family provision',
    ],
  },
  // Debt
  {
    matterType: 'debt-recovery',
    keywords: [
      'owe me money',
      'owes me',
      'unpaid invoice',
      'debt',
      "haven't paid",
      'has not paid',
      'recover money',
      'chasing payment',
      'money owed',
    ],
  },
  // Family
  {
    matterType: 'family-law-children',
    keywords: ['custody', 'children arrangements', 'parenting', 'parenting plan', 'parenting order', 'see my kids', 'see my children', 'child arrangements'],
  },
  {
    matterType: 'family-law-property',
    keywords: ['separation', 'separated', 'divorce', 'property split', 'property settlement', 'de facto split', 'splitting assets'],
  },
  // Tenancy
  {
    matterType: 'residential-tenancy',
    keywords: ['lease', 'tenant', 'landlord', 'rental', 'bond', 'eviction', 'rent arrears', 'ncat', 'vcat', 'rented'],
  },
  // Defamation
  {
    matterType: 'defamation',
    keywords: ['defamation', 'defamed', 'lies about me', 'posted lies', 'reputation', 'slander', 'libel', 'said false things'],
  },
  // Criminal
  {
    matterType: 'criminal-defence',
    keywords: ['charged', 'court date', 'arrested', 'offence', 'police charged', 'criminal', 'bail', 'court attendance notice', 'drink driving', 'assault charge'],
  },
  // Commercial (broad — listed last)
  {
    matterType: 'commercial-dispute',
    keywords: ['breach of contract', 'commercial dispute', 'partnership dispute', 'shareholder dispute', 'misleading conduct', 'business dispute'],
  },
];

export interface ClassificationResult {
  matterType: MatterType;
  /** 'keyword' | 'model' | 'none' — how the type was determined. */
  source: 'keyword' | 'model' | 'none';
  /** Number of distinct keyword rules that matched (diagnostic). */
  keywordMatches: number;
}

/** The clarifying question asked when classification fails. */
export const CLARIFY_QUESTION =
  'To help us connect you with the right lawyer, could you tell us briefly what your legal matter is about?';

/** Layer 1 — keyword matching. Returns the best matter type, or unknown. */
export function classifyByKeywords(message: string): { matterType: MatterType; matches: number } {
  const text = ` ${message.toLowerCase()} `;
  const scores = new Map<MatterType, number>();

  for (const rule of KEYWORD_RULES) {
    for (const kw of rule.keywords) {
      if (text.includes(kw)) {
        scores.set(rule.matterType, (scores.get(rule.matterType) ?? 0) + 1);
      }
    }
  }

  if (scores.size === 0) return { matterType: 'unknown', matches: 0 };

  // Highest score wins. KEYWORD_RULES order breaks ties (earlier = more specific).
  let best: MatterType = 'unknown';
  let bestScore = 0;
  for (const rule of KEYWORD_RULES) {
    const score = scores.get(rule.matterType) ?? 0;
    if (score > bestScore) {
      bestScore = score;
      best = rule.matterType;
    }
  }
  return { matterType: best, matches: scores.size };
}

const MODEL_CATEGORIES = [...SUPPORTED_MATTER_TYPES, 'unknown'].join(', ');

/** Layer 2 — Haiku classification. Best-effort; returns unknown on failure. */
export async function classifyByModel(message: string): Promise<MatterType> {
  const redacted = redactForExternalModel(message.slice(0, 4000), { matterId: null });
  const prompt = `A person contacted a law firm with this message: ${redacted.text}
Classify their legal matter into one of these categories:
${MODEL_CATEGORIES}.
Reply with ONLY the category. No other text.`;

  let raw = '';
  try {
    for await (const msg of query({
      prompt,
      options: { model: 'claude-haiku-4-5', maxTurns: 1, maxBudgetUsd: 0.02 },
    })) {
      if (
        typeof msg === 'object' &&
        msg !== null &&
        'type' in msg &&
        (msg as { type?: string }).type === 'result'
      ) {
        raw = (msg as { result?: string }).result ?? raw;
      }
    }
  } catch (err) {
    logger.warn(`model classification failed: ${err instanceof Error ? err.message : String(err)}`);
    return 'unknown';
  }

  const cleaned = raw.trim().toLowerCase().replace(/[^a-z-]/g, '');
  const match = [...SUPPORTED_MATTER_TYPES, 'unknown' as MatterType].find((t) => t === cleaned);
  return match ?? 'unknown';
}

/**
 * Full classification. Tries keywords first; only calls the model when
 * keywords are ambiguous (no match, or several competing matches).
 */
export async function classifyMatter(message: string): Promise<ClassificationResult> {
  const kw = classifyByKeywords(message);

  // Confident keyword hit: a single dominant matter type.
  if (kw.matterType !== 'unknown' && kw.matches === 1) {
    return { matterType: kw.matterType, source: 'keyword', keywordMatches: kw.matches };
  }

  // Ambiguous or empty — ask the model.
  const modelType = await classifyByModel(message);
  if (modelType !== 'unknown') {
    return { matterType: modelType, source: 'model', keywordMatches: kw.matches };
  }

  // Fall back to the keyword guess if we had one, else unknown.
  if (kw.matterType !== 'unknown') {
    return { matterType: kw.matterType, source: 'keyword', keywordMatches: kw.matches };
  }

  return { matterType: 'unknown', source: 'none', keywordMatches: 0 };
}
