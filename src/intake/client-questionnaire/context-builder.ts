/**
 * Context builder.
 *
 * Takes a completed (or near-complete) IntakeSession and assembles the
 * structured context the brief generator needs: parsed facts, the
 * confirmed state, the limitation period, the relevant court, the key
 * triggers, and a set of AustLII search queries.
 *
 * Australian English throughout.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { createSafeLogger } from '../../governance/index.js';
import { redactForExternalModel } from '../../compliance/privilege.js';
import type { IntakeSession, IntakeQuestion, AustralianState, MatterType } from './types.js';
import { getQuestionSet } from './question-sets/index.js';
import { parseClientDate } from './date-utils.js';
import {
  getLimitationPeriod,
  type LimitationPeriod,
} from './jurisdiction/limitation-periods.js';
import { getRelevantCourt } from './jurisdiction/court-registry.js';
import { normaliseState } from './jurisdiction/jurisdiction-rules.js';

const logger = createSafeLogger('IntakeContextBuilder');

export interface IntakeContext {
  session: IntakeSession;
  matterType: MatterType;
  state: AustralianState;
  /** Question text → answer, for the lawyer-facing summary. */
  structuredFacts: Record<string, string>;
  /** Raw answers keyed by question id. */
  rawAnswers: Record<string, string>;
  limitation: LimitationPeriod | null;
  court: string;
  /** Headline numeric value detected (purchase price / amount / value). */
  keyValue: number | null;
  /** The parsed limitation-trigger date, if any. */
  triggerDate: Date | null;
  /** AustLII search queries (≤10 words each). */
  searchQueries: string[];
  /** Full ordered transcript: question text + answer. */
  transcript: Array<{ question: string; answer: string }>;
}

/** Flatten a question set, including nested follow-up questions. */
export function flattenQuestions(questions: IntakeQuestion[]): IntakeQuestion[] {
  const out: IntakeQuestion[] = [];
  for (const q of questions) {
    out.push(q);
    if (q.followUpIf) out.push(q.followUpIf.question);
  }
  return out;
}

const MONEY_KEYS = ['purchase_price', 'amount_owed', 'value', 'amount', 'average_weekly_earnings'];

function detectKeyValue(answers: Record<string, string>): number | null {
  for (const key of MONEY_KEYS) {
    const raw = answers[key];
    if (raw) {
      const n = Number.parseFloat(raw.replace(/[^0-9.]/g, ''));
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return null;
}

/** Resolve the state from the session, falling back to the answers. */
function resolveState(session: IntakeSession): AustralianState {
  if (session.state && session.state !== 'unknown') return session.state;
  const candidate =
    session.answers.state ??
    session.answers.court_and_state ??
    session.answers.location ??
    '';
  return normaliseState(candidate);
}

/** Find the first parseable limitation-trigger date in the answers. */
function resolveTriggerDate(session: IntakeSession, questions: IntakeQuestion[]): Date | null {
  for (const q of questions) {
    if (q.limitationPeriodTrigger) {
      const parsed = parseClientDate(session.answers[q.id]);
      if (parsed) return parsed;
    }
  }
  return null;
}

async function generateSearchQueries(
  matterType: MatterType,
  state: AustralianState,
  structuredFacts: Record<string, string>,
): Promise<string[]> {
  const factLines = Object.entries(structuredFacts)
    .map(([q, a]) => `- ${q}: ${a}`)
    .join('\n')
    .slice(0, 3000);
  const redacted = redactForExternalModel(factLines, { matterId: null });

  const prompt = `Given these facts about a ${matterType} matter in ${state}:
${redacted.text}

Write 3 specific AustLII search queries that would find the most relevant Australian case law. Each query under 10 words. Return as a JSON array of strings only, no other text.`;

  let raw = '';
  try {
    for await (const msg of query({
      prompt,
      options: { model: 'claude-sonnet-4-6', maxTurns: 1, maxBudgetUsd: 0.05 },
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
    logger.warn(`AustLII query generation failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  const match = raw.match(/\[[\s\S]*\]/);
  if (match) {
    try {
      const arr = JSON.parse(match[0]) as unknown[];
      const queries = arr
        .filter((q): q is string => typeof q === 'string')
        .map((q) => q.trim())
        .filter(Boolean)
        .slice(0, 3);
      if (queries.length) return queries;
    } catch {
      /* fall through to fallback */
    }
  }

  // Fallback: build queries from the matter type + state without a model.
  const subject = matterType.replace(/-/g, ' ');
  const stateWord = state === 'unknown' ? 'Australia' : state;
  return [`${subject} ${stateWord}`, `${subject} limitation period`, `${subject} damages`];
}

/**
 * Build the context object for a session. Pass `withQueries: false` to
 * skip the model call (e.g. in tests or offline mode).
 */
export async function buildContext(
  session: IntakeSession,
  opts: { withQueries?: boolean } = {},
): Promise<IntakeContext> {
  const withQueries = opts.withQueries ?? true;
  const questionSet = getQuestionSet(session.matterType);
  const allQuestions = questionSet ? flattenQuestions(questionSet.questions) : [];

  const structuredFacts: Record<string, string> = {};
  const transcript: Array<{ question: string; answer: string }> = [];
  for (const q of allQuestions) {
    const answer = session.answers[q.id];
    if (answer !== undefined && answer !== '') {
      structuredFacts[q.text] = answer;
      transcript.push({ question: q.text, answer });
    }
  }

  const state = resolveState(session);
  const triggerDate = resolveTriggerDate(session, allQuestions);
  const keyValue = detectKeyValue(session.answers);
  const limitation = triggerDate
    ? getLimitationPeriod(session.matterType, state, triggerDate)
    : null;
  const court = getRelevantCourt(session.matterType, state, keyValue ?? undefined);

  const searchQueries = withQueries
    ? await generateSearchQueries(session.matterType, state, structuredFacts)
    : [];

  return {
    session,
    matterType: session.matterType,
    state,
    structuredFacts,
    rawAnswers: session.answers,
    limitation,
    court,
    keyValue,
    triggerDate,
    searchQueries,
    transcript,
  };
}
