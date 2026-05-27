/**
 * Brief generator.
 *
 * Turns the structured intake context into a lawyer-ready brief:
 *   1. Searches AustLII with the context's queries → 3-5 relevant cases.
 *   2. Identifies applicable legislation (Opus, with a fallback list).
 *   3. Writes a plain-English fact summary (Sonnet).
 *   4. Drafts recommended first steps (Sonnet).
 *   5. Computes the cost-estimate range.
 *   6. Assembles the ClientBrief and persists it.
 *   7. Creates the matter via the existing matter-creation flow.
 *   8. Enqueues the brief for mandatory lawyer review.
 *   9. Emails the responsible lawyer.
 *
 * Every model call is best-effort: if the model is unavailable the
 * brief still assembles from deterministic fallbacks, because a brief
 * that is late or thin is far better than no brief before the call.
 *
 * Australian English throughout.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { createSafeLogger } from '../../governance/index.js';
import { redactForExternalModel } from '../../compliance/privilege.js';
import { wrapWithDisclaimer } from '../../compliance/disclaimer.js';
import { enqueueForReview } from '../../compliance/reviewGate.js';
import { appendLegalAudit } from '../../compliance/audit.js';
import { searchAustLiiMulti } from '../../integrations/austlii/index.js';
import { createMatter } from '../../db/repositories/matters.js';
import { sendNotification } from '../../email/notifier.js';
import type { ClientBrief, RelevantCase, MatterType } from './types.js';
import type { IntakeContext } from './context-builder.js';
import { buildContext } from './context-builder.js';
import { getIntakeSession, updateIntakeSession, saveClientBrief } from './repo.js';
import { fallbackLegislation, standardCostRange } from './jurisdiction/jurisdiction-rules.js';

const logger = createSafeLogger('IntakeBriefGenerator');

const MATTER_TYPE_LABEL: Record<MatterType, string> = {
  'unfair-dismissal': 'Unfair Dismissal',
  'workers-compensation': 'Workers Compensation',
  'family-law-property': 'Family Law — Property',
  'family-law-children': 'Family Law — Children',
  'conveyancing-purchase': 'Conveyancing — Purchase',
  'conveyancing-sale': 'Conveyancing — Sale',
  'will-and-estate': 'Wills & Estates',
  'debt-recovery': 'Debt Recovery',
  'personal-injury-motor': 'Personal Injury — Motor Vehicle',
  'personal-injury-public-liability': 'Personal Injury — Public Liability',
  'commercial-dispute': 'Commercial Dispute',
  'residential-tenancy': 'Residential Tenancy',
  'business-purchase': 'Business Purchase',
  defamation: 'Defamation',
  'criminal-defence': 'Criminal Defence',
  unknown: 'General Enquiry',
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Run a single-turn model call and return the raw text (empty on failure). */
async function runModel(model: string, prompt: string, maxBudgetUsd: number): Promise<string> {
  let raw = '';
  try {
    for await (const msg of query({ prompt, options: { model, maxTurns: 1, maxBudgetUsd } })) {
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
    logger.warn(`model call failed (${model}): ${err instanceof Error ? err.message : String(err)}`);
  }
  return raw;
}

async function researchCases(ctx: IntakeContext): Promise<RelevantCase[]> {
  const queries = ctx.searchQueries.length ? ctx.searchQueries : [ctx.matterType.replace(/-/g, ' ')];
  let resp;
  try {
    resp = await searchAustLiiMulti(queries, 5);
  } catch (err) {
    logger.warn(`AustLII search failed: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
  return resp.results.slice(0, 5).map((r) => ({
    citation: r.citation || r.title,
    court: r.database ?? 'AustLII',
    summary: r.snippet.slice(0, 240),
    relevance: `Surfaced by AustLII search for a ${ctx.matterType.replace(/-/g, ' ')} matter${ctx.state !== 'unknown' ? ` in ${ctx.state}` : ''}.`,
  }));
}

async function identifyLegislation(ctx: IntakeContext): Promise<string[]> {
  const facts = Object.entries(ctx.structuredFacts)
    .map(([q, a]) => `- ${q}: ${a}`)
    .join('\n')
    .slice(0, 2500);
  const redacted = redactForExternalModel(facts, { matterId: null });
  const prompt = `Given this ${ctx.matterType} matter in ${ctx.state} with these facts:
${redacted.text}

List the specific Australian legislation sections that directly apply. Format each item as: Act name s.section — what it does. Maximum 8 items. Australian English. Return one item per line, no preamble.`;

  const raw = await runModel('claude-opus-4-7', prompt, 0.1);
  const lines = raw
    .split('\n')
    .map((l) => l.replace(/^[-*\d.)\s]+/, '').trim())
    .filter((l) => l.length > 0 && /s\.|act|regulation|code/i.test(l))
    .slice(0, 8);
  return lines.length ? lines : fallbackLegislation(ctx.matterType);
}

async function summariseFacts(ctx: IntakeContext): Promise<string> {
  const facts = Object.entries(ctx.structuredFacts)
    .map(([q, a]) => `- ${q}: ${a}`)
    .join('\n')
    .slice(0, 3000);
  const redacted = redactForExternalModel(facts, { matterId: null });
  const prompt = `Write a plain English summary of this legal matter for a lawyer to read before their first client consultation. 3 to 4 paragraphs. Include: what happened, when, who is involved, what the client wants, and any urgency. Tone: professional, factual, no jargon. Australian English.

Matter type: ${ctx.matterType}
State: ${ctx.state}
Facts:
${redacted.text}`;

  const raw = await runModel('claude-sonnet-4-6', prompt, 0.08);
  if (raw.trim()) return raw.trim();

  // Deterministic fallback.
  const factText = Object.entries(ctx.structuredFacts)
    .map(([q, a]) => `${q} — ${a}`)
    .join('. ');
  return `${ctx.session.clientName || 'The client'} has made contact regarding a ${ctx.matterType.replace(/-/g, ' ')} matter${ctx.state !== 'unknown' ? ` in ${ctx.state}` : ''}. The facts gathered at intake: ${factText}.`;
}

async function recommendFirstSteps(ctx: IntakeContext): Promise<string[]> {
  const facts = Object.entries(ctx.structuredFacts)
    .map(([q, a]) => `- ${q}: ${a}`)
    .join('\n')
    .slice(0, 2500);
  const redacted = redactForExternalModel(facts, { matterId: null });
  const prompt = `Based on this ${ctx.matterType} matter in ${ctx.state} with these facts, what are the 4 to 6 most important first steps a lawyer should take at the first consultation? Be specific. Not generic. Australian English. Return one step per line, no preamble.

Facts:
${redacted.text}`;

  const raw = await runModel('claude-sonnet-4-6', prompt, 0.08);
  const steps = raw
    .split('\n')
    .map((l) => l.replace(/^[-*\d.)\s]+/, '').trim())
    .filter((l) => l.length > 8)
    .slice(0, 6);
  if (steps.length) return steps;

  return [
    'Confirm the client’s identity and complete conflict-of-interest and AML checks.',
    `Confirm the matter type (${ctx.matterType.replace(/-/g, ' ')}) and the relevant state (${ctx.state}).`,
    ctx.limitation
      ? `Diarise the limitation deadline: ${ctx.limitation.periodDescription}`
      : 'Confirm any limitation period that may apply.',
    'Collect and preserve all documents and correspondence relevant to the matter.',
    'Provide a costs disclosure and engagement letter for signature.',
  ];
}

function buildRiskFlags(ctx: IntakeContext, brief: Pick<ClientBrief, 'urgencyFlag' | 'daysUntilLimitationPeriod'>): string[] {
  const flags: string[] = [];
  if (ctx.limitation) {
    if (ctx.limitation.critical) {
      flags.push(`CRITICAL: limitation period expires in ${ctx.limitation.daysRemaining} day(s) — ${ctx.limitation.periodDescription}`);
    } else if (ctx.limitation.urgent) {
      flags.push(`URGENT: limitation period within 14 days (${ctx.limitation.daysRemaining} day(s)) — ${ctx.limitation.periodDescription}`);
    } else if (ctx.limitation.daysRemaining <= 0) {
      flags.push(`Limitation period appears to have passed — ${ctx.limitation.periodDescription}`);
    }
  }
  if (
    brief.daysUntilLimitationPeriod !== undefined &&
    brief.daysUntilLimitationPeriod <= 14 &&
    brief.daysUntilLimitationPeriod >= 0 &&
    flags.length === 0
  ) {
    flags.push(`Deadline within 14 days (${brief.daysUntilLimitationPeriod} day(s)).`);
  }
  if (ctx.session.urgencyReason && ctx.session.urgencyFlag) {
    flags.push(ctx.session.urgencyReason);
  }
  if (ctx.state === 'unknown') {
    flags.push('Jurisdiction not yet confirmed — state-specific rules may change the analysis.');
  }
  return flags;
}

/** Render the brief as Markdown for the review queue. */
export function renderBriefMarkdown(brief: ClientBrief, court: string): string {
  const cases = brief.relevantCases.length
    ? brief.relevantCases
        .map((c) => `- **${c.citation}** (${c.court}) — ${c.summary}\n  _Relevance: ${c.relevance}_`)
        .join('\n')
    : '_No directly relevant authority surfaced — confirm with targeted research._';

  const legislation = brief.applicableLegislation.length
    ? brief.applicableLegislation.map((l) => `- ${l}`).join('\n')
    : '_To be confirmed._';

  const steps = brief.recommendedFirstSteps.map((s, i) => `${i + 1}. ${s}`).join('\n');
  const risks = brief.riskFlags.length ? brief.riskFlags.map((r) => `- ${r}`).join('\n') : '- None identified at intake.';
  const transcript = brief.fullTranscript.map((t) => `- **${t.question}**\n  ${t.answer}`).join('\n');

  return `# Client Intake Brief — ${MATTER_TYPE_LABEL[brief.matterType]}

**Client:** ${brief.clientName} <${brief.clientEmail}>
**Matter type:** ${MATTER_TYPE_LABEL[brief.matterType]}
**State / jurisdiction:** ${brief.state}
**Forum:** ${court}
${brief.urgencyFlag ? `\n> ⚠️ **URGENT** — ${brief.urgencyReason ?? 'time-critical deadline'}${brief.daysUntilLimitationPeriod !== undefined ? ` (${brief.daysUntilLimitationPeriod} day(s) remaining)` : ''}\n` : ''}
## Limitation period

${brief.limitationPeriod || '_Not determined._'}

## Fact summary

${brief.factSummary}

## Applicable legislation

${legislation}

## Relevant authority

${cases}

## Recommended first steps

${steps}

## Risk flags

${risks}

## Estimated cost range

${brief.estimatedCostRange}

## Full intake transcript

${transcript}
`;
}

export interface GenerateBriefResult {
  brief: ClientBrief;
  briefId: string;
  matterId: string;
  reviewId: string;
}

function lawyerEmail(): string | undefined {
  return (
    process.env.INTAKE_DEFAULT_LAWYER_EMAIL ||
    process.env.INTAKE_LAWYER_EMAIL ||
    process.env.ADMIN_EMAIL ||
    undefined
  );
}

function firmName(): string {
  return process.env.INTAKE_FIRM_NAME || 'the firm';
}

/**
 * Generate the brief for a session, create the matter, enqueue for
 * review, and notify the lawyer. Marks the session complete.
 */
export async function generateBrief(sessionId: string): Promise<GenerateBriefResult> {
  const session = getIntakeSession(sessionId);
  if (!session) throw new Error(`intake session ${sessionId} not found`);

  const ctx = await buildContext(session, { withQueries: true });

  // Run the (independent) model + research steps concurrently.
  const [relevantCases, applicableLegislation, factSummary, recommendedFirstSteps] = await Promise.all([
    researchCases(ctx),
    identifyLegislation(ctx),
    summariseFacts(ctx),
    recommendFirstSteps(ctx),
  ]);

  const daysUntilLimitationPeriod = ctx.limitation?.daysRemaining;
  const urgencyFlag = Boolean(session.urgencyFlag) || Boolean(ctx.limitation?.urgent);
  const urgencyReason =
    session.urgencyReason ?? (ctx.limitation?.urgent ? ctx.limitation.periodDescription : undefined);

  const brief: ClientBrief = {
    sessionId: session.id,
    clientName: session.clientName,
    clientEmail: session.clientEmail,
    matterType: session.matterType,
    state: ctx.state,
    urgencyFlag,
    urgencyReason,
    daysUntilLimitationPeriod,
    factSummary,
    structuredFacts: ctx.structuredFacts,
    applicableLegislation,
    limitationPeriod: ctx.limitation?.periodDescription ?? 'Not determined.',
    relevantCases,
    recommendedFirstSteps,
    estimatedCostRange: standardCostRange(session.matterType),
    riskFlags: [],
    fullTranscript: ctx.transcript,
    generatedAt: new Date(),
  };
  brief.riskFlags = buildRiskFlags(ctx, brief);

  // 7. Create the matter.
  const matter = createMatter({
    title: `${MATTER_TYPE_LABEL[session.matterType]} — ${session.clientName || session.clientEmail}`,
    client_name: session.clientName || session.clientEmail,
    client_email: session.clientEmail,
    matter_type: session.matterType,
    jurisdiction: ctx.state === 'unknown' ? process.env.DEFAULT_JURISDICTION || 'NSW' : ctx.state,
    responsible_lawyer_email: lawyerEmail() ?? null,
    notes: `Created from intake session ${session.id}.`,
  });

  // 8. Enqueue the brief for mandatory lawyer review.
  const markdown = wrapWithDisclaimer(renderBriefMarkdown(brief, ctx.court));
  const review = enqueueForReview({
    matterId: matter.id,
    matterNumber: matter.matter_number,
    skillId: 'client-intake',
    outputKind: 'matter_management',
    title: `Intake brief — ${MATTER_TYPE_LABEL[session.matterType]} — ${session.clientName || session.clientEmail}`,
    bodyMarkdown: markdown,
    metadata: {
      sessionId: session.id,
      matterType: session.matterType,
      state: ctx.state,
      urgencyFlag,
      daysUntilLimitationPeriod: daysUntilLimitationPeriod ?? null,
    },
  });

  // 6. Persist the brief.
  const saved = saveClientBrief(brief, { matterId: matter.id, reviewId: review.id });

  // Mark the session complete + linked.
  updateIntakeSession(session.id, {
    status: 'complete',
    completedAt: new Date(),
    briefGenerated: true,
    matterId: matter.id,
    state: ctx.state,
    urgencyFlag,
    urgencyReason,
  });

  appendLegalAudit({
    matterId: matter.id,
    actorId: 'system:client-intake',
    action: 'intake.brief_generated',
    detail: `Brief for ${MATTER_TYPE_LABEL[session.matterType]} (${ctx.state}) from session ${session.id}`,
    refTable: 'client_briefs',
    refId: saved.id,
    metadata: { urgencyFlag, daysUntilLimitationPeriod: daysUntilLimitationPeriod ?? null },
  });

  // 9. Email the responsible lawyer.
  await notifyLawyer(brief, matter.id, matter.matter_number, relevantCases.length, recommendedFirstSteps.length);

  logger.info(`Generated intake brief ${saved.id} → matter ${matter.matter_number}`);
  return { brief, briefId: saved.id, matterId: matter.id, reviewId: review.id };
}

async function notifyLawyer(
  brief: ClientBrief,
  matterId: string,
  matterNumber: string,
  caseCount: number,
  stepCount: number,
): Promise<void> {
  const to = lawyerEmail();
  if (!to) {
    logger.warn('No lawyer email configured; skipping intake brief notification.');
    return;
  }

  const dashboard = process.env.DASHBOARD_URL || 'http://localhost:3000';
  const urgentTag = brief.urgencyFlag ? ' [URGENT]' : '';
  const subject = `New matter ready — ${brief.clientName || brief.clientEmail} — ${MATTER_TYPE_LABEL[brief.matterType]}${urgentTag}`;

  const urgentBlock = brief.urgencyFlag
    ? `<p style="color:#b00020"><b>URGENT:</b> ${escapeHtml(brief.urgencyReason ?? 'time-critical deadline')}${
        brief.daysUntilLimitationPeriod !== undefined ? ` — ${brief.daysUntilLimitationPeriod} day(s) remaining` : ''
      }</p>`
    : '';

  const html = `
    <h1>New matter ready for review</h1>
    <p>${escapeHtml(brief.clientName || brief.clientEmail)} has completed their intake questionnaire. A brief has been prepared for your review.</p>
    <table style="border-collapse:collapse">
      <tr><td><b>Matter</b></td><td>${escapeHtml(matterNumber)}</td></tr>
      <tr><td><b>Matter type</b></td><td>${escapeHtml(MATTER_TYPE_LABEL[brief.matterType])}</td></tr>
      <tr><td><b>State</b></td><td>${escapeHtml(brief.state)}</td></tr>
      <tr><td><b>Limitation period</b></td><td>${escapeHtml(brief.limitationPeriod)}</td></tr>
    </table>
    ${urgentBlock}
    <h2>Key facts</h2>
    <p style="white-space:pre-wrap">${escapeHtml(brief.factSummary)}</p>
    <p><b>Relevant cases found:</b> ${caseCount} &middot; <b>Recommended first steps:</b> ${stepCount}</p>
    <p>Review the full brief in your dashboard: <a href="${escapeHtml(dashboard)}/matter/${escapeHtml(matterId)}">${escapeHtml(dashboard)}/matter/${escapeHtml(matterId)}</a></p>
  `;

  await sendNotification(subject, html, to);
}
