/**
 * Intake agent — manages the conversational flow with the client.
 *
 * Responsibilities:
 *   - Acknowledge first contact and classify the matter.
 *   - Walk the client through the matter-type question set, one
 *     question at a time, inserting follow-ups when conditions are met.
 *   - Recalculate urgency after every answer and alert the lawyer
 *     immediately when a deadline is within 7 days.
 *   - Trigger brief generation once the questionnaire is complete.
 *   - Sweep stale sessions: a 24-hour reminder, then abandonment +
 *     firm notification at 48 hours.
 *
 * The agent is channel-agnostic: it returns a structured reply. Email
 * delivery helpers are provided here; the web portal renders the
 * returned question directly. Australian English throughout.
 */

import { createSafeLogger } from '../../governance/index.js';
import { sendNotification } from '../../email/notifier.js';
import type { IntakeQuestion, IntakeSession, MatterType, UrgencyResult } from './types.js';
import { getQuestionSet } from './question-sets/index.js';
import { normaliseState } from './jurisdiction/jurisdiction-rules.js';
import {
  createIntakeSession,
  getIntakeSession,
  getActiveSessionByEmail,
  updateIntakeSession,
  saveAnswer,
  listIntakeSessions,
} from './repo.js';
import { classifyMatter, CLARIFY_QUESTION } from './classifier.js';
import { generateBrief } from './brief-generator.js';

const logger = createSafeLogger('IntakeAgent');

const FOLLOW_UP_AFTER_MS = 24 * 60 * 60 * 1000;
const ABANDON_AFTER_MS = 48 * 60 * 60 * 1000;

/** What the agent wants the channel to send next. */
export interface AgentReply {
  sessionId: string;
  /** True when the questionnaire is finished and a brief was generated. */
  done: boolean;
  /** Free-text message (acknowledgement, clarify request, completion note). */
  message: string;
  /** The next question to ask, when one is pending. */
  question?: IntakeQuestion;
  /** Progress for the portal bar. */
  progress?: { answered: number; total: number };
  /** True when an urgent deadline was detected on this turn. */
  urgentAlertSent?: boolean;
  /** Matter id, once a brief has been generated. */
  matterId?: string;
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
  return process.env.INTAKE_FIRM_NAME || 'our firm';
}

function firmSlug(): string {
  return process.env.INTAKE_FIRM_SLUG || 'firm';
}

function portalUrl(sessionId: string): string {
  const base = process.env.DASHBOARD_URL || 'http://localhost:3000';
  return `${base}/intake/${sessionId}`;
}

/** SMS is available only when Twilio credentials are present. */
export function isSmsConfigured(): boolean {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
}

/** Does an answer satisfy a question's follow-up condition? */
function matchesFollowUp(question: IntakeQuestion, answer: string): boolean {
  if (!question.followUpIf) return false;
  const want = question.followUpIf.answer.trim().toLowerCase();
  const got = (answer ?? '').trim().toLowerCase();
  if (!got) return false;
  if (question.type === 'yes-no') {
    return got.startsWith(want.charAt(0));
  }
  return got === want || got.includes(want);
}

interface NextStep {
  question: IntakeQuestion;
  answered: number;
  total: number;
}

/**
 * Find the next unanswered question for a session, accounting for
 * follow-ups whose conditions are currently met. Returns null when the
 * questionnaire is complete.
 */
export function nextQuestion(session: IntakeSession): NextStep | null {
  const set = getQuestionSet(session.matterType);
  if (!set) return null;
  const answers = session.answers;

  // Compute the currently-applicable step list (base + met follow-ups).
  const steps: IntakeQuestion[] = [];
  for (const q of set.questions) {
    steps.push(q);
    if (q.followUpIf && answers[q.id] !== undefined && matchesFollowUp(q, answers[q.id])) {
      steps.push(q.followUpIf.question);
    }
  }

  const total = steps.length;
  let answered = 0;
  let pending: IntakeQuestion | null = null;
  for (const q of steps) {
    if (answers[q.id] !== undefined && answers[q.id] !== '') {
      answered += 1;
    } else if (!pending) {
      pending = q;
    }
  }

  if (!pending) return null;
  return { question: pending, answered, total };
}

/** Render a question into client-facing text (with choices / hints). */
export function formatQuestion(question: IntakeQuestion): string {
  let text = question.text;
  if (question.type === 'choice' && question.choices?.length) {
    text += `\n\nPlease choose one: ${question.choices.join(' · ')}`;
  } else if (question.type === 'yes-no') {
    text += '\n\n(Yes or No)';
  } else if (question.type === 'date') {
    text += '\n\n(Please use a date, e.g. 14/03/2026)';
  }
  return text;
}

/**
 * Begin an intake from a client's first contact.
 *
 * Classifies the matter, creates the session, and returns the opening
 * acknowledgement plus the first question (or a clarifying request when
 * the matter type cannot be determined).
 */
export async function startIntake(input: {
  clientEmail: string;
  clientName: string;
  initialMessage: string;
  firmSlug?: string;
}): Promise<AgentReply> {
  const classification = await classifyMatter(input.initialMessage);
  const session = createIntakeSession({
    clientEmail: input.clientEmail,
    clientName: input.clientName,
    firmSlug: input.firmSlug ?? firmSlug(),
    matterType: classification.matterType,
  });

  const acknowledgement = `Thanks for contacting ${firmName()}. One of our lawyers will be in touch soon. To make sure they have everything they need before your call, I have a few quick questions. This usually takes about 5 minutes.`;

  if (classification.matterType === 'unknown') {
    updateIntakeSession(session.id, { lastQuestionSentAt: new Date() });
    return {
      sessionId: session.id,
      done: false,
      message: `${acknowledgement}\n\n${CLARIFY_QUESTION}`,
    };
  }

  return openQuestionnaire(session.id, acknowledgement);
}

/** Load the question set and return the first question for a session. */
function openQuestionnaire(sessionId: string, prefaceMessage?: string): AgentReply {
  const session = getIntakeSession(sessionId);
  if (!session) throw new Error(`intake session ${sessionId} not found`);
  const set = getQuestionSet(session.matterType);
  const step = nextQuestion(session);
  updateIntakeSession(session.id, { lastQuestionSentAt: new Date() });

  const opening = set?.openingMessage?.replace(/\[Firm Name\]/g, firmName());
  const message = [prefaceMessage, opening].filter(Boolean).join('\n\n');

  if (!step) {
    return { sessionId: session.id, done: false, message, progress: { answered: 0, total: 0 } };
  }
  return {
    sessionId: session.id,
    done: false,
    message,
    question: step.question,
    progress: { answered: step.answered, total: step.total },
  };
}

/**
 * Record a client's answer and advance the questionnaire.
 *
 * When the matter type is still unknown, the answer is treated as the
 * client's description of their matter and re-classified.
 */
export async function submitAnswer(sessionId: string, answer: string): Promise<AgentReply> {
  const session = getIntakeSession(sessionId);
  if (!session) throw new Error(`intake session ${sessionId} not found`);
  if (session.status !== 'in-progress') {
    return { sessionId, done: session.status === 'complete', message: 'This intake has already been completed.' };
  }

  // Still unclassified — use the answer as the matter description.
  if (session.matterType === 'unknown') {
    const classification = await classifyMatter(answer);
    if (classification.matterType === 'unknown') {
      updateIntakeSession(session.id, { lastQuestionSentAt: new Date() });
      return {
        sessionId,
        done: false,
        message: `Thanks. I still want to make sure we point you to the right specialist. ${CLARIFY_QUESTION}`,
      };
    }
    updateIntakeSession(session.id, { matterType: classification.matterType });
    return openQuestionnaire(session.id);
  }

  const set = getQuestionSet(session.matterType);
  if (!set) throw new Error(`no question set for ${session.matterType}`);

  const current = nextQuestion(session);
  if (!current) {
    // Already complete — generate the brief if not done.
    return finishIntake(session.id);
  }

  // Save the answer.
  let updated = saveAnswer(session.id, current.question.id, answer.trim()) ?? session;

  // Capture state when the state question is answered.
  if (current.question.id === 'state') {
    updated = updateIntakeSession(updated.id, { state: normaliseState(answer) }) ?? updated;
  }

  // Recalculate urgency and alert the lawyer if a deadline is < 7 days.
  const urgency = set.urgencyCheck(updated.answers);
  const urgentAlertSent = await applyUrgency(updated, urgency);
  updated = getIntakeSession(updated.id) ?? updated;

  const step = nextQuestion(updated);
  updateIntakeSession(updated.id, {
    currentQuestionIndex: step ? step.answered : current.total,
    lastQuestionSentAt: new Date(),
  });

  if (!step) {
    const finished = await finishIntake(updated.id);
    return { ...finished, urgentAlertSent };
  }

  return {
    sessionId: updated.id,
    done: false,
    message: '',
    question: step.question,
    progress: { answered: step.answered, total: step.total },
    urgentAlertSent,
  };
}

/**
 * Apply an urgency result to a session. Emails the lawyer once when a
 * deadline is within 7 days and the session was not already flagged.
 * Returns true when an alert was sent on this turn.
 */
async function applyUrgency(session: IntakeSession, urgency: UrgencyResult): Promise<boolean> {
  const within7 =
    urgency.urgent &&
    (urgency.daysRemaining === undefined || urgency.daysRemaining < 7);

  updateIntakeSession(session.id, {
    urgencyFlag: urgency.urgent,
    urgencyReason: urgency.reason,
  });

  if (within7 && !session.urgencyFlag) {
    await emailUrgentAlert(session, urgency);
    return true;
  }
  return false;
}

async function emailUrgentAlert(session: IntakeSession, urgency: UrgencyResult): Promise<void> {
  const to = lawyerEmail();
  if (!to) {
    logger.warn('Urgent intake detected but no lawyer email configured.');
    return;
  }
  const daysText =
    urgency.daysRemaining !== undefined ? `${urgency.daysRemaining} day(s)` : 'a very short time';
  const subject = `URGENT MATTER — ${session.clientName || session.clientEmail} — deadline in ${daysText}`;
  const html = `
    <h1 style="color:#b00020">Urgent matter — intake in progress</h1>
    <p><b>${session.clientName || session.clientEmail}</b> has a deadline in <b>${daysText}</b>.</p>
    <p><b>Reason:</b> ${urgency.reason}</p>
    <p><b>Matter type:</b> ${session.matterType} &middot; <b>State:</b> ${session.state}</p>
    <p>Intake is still in progress. The full brief will follow once the questionnaire is complete. Consider making contact now.</p>
    <p>Intake session: <code>${session.id}</code></p>
  `;
  await sendNotification(subject, html, to);
  logger.info(`Urgent intake alert emailed for session ${session.id}`);
}

/** Complete the questionnaire and generate the brief. */
async function finishIntake(sessionId: string): Promise<AgentReply> {
  const session = getIntakeSession(sessionId);
  if (!session) throw new Error(`intake session ${sessionId} not found`);

  if (session.briefGenerated) {
    return {
      sessionId,
      done: true,
      message: completionMessage(),
      matterId: session.matterId,
    };
  }

  let matterId: string | undefined;
  try {
    const result = await generateBrief(sessionId);
    matterId = result.matterId;
  } catch (err) {
    logger.error(`Brief generation failed for ${sessionId}: ${err instanceof Error ? err.message : String(err)}`);
    // Mark complete anyway so the client sees closure; the firm is
    // notified via the abandoned/escalation sweep and the audit log.
    updateIntakeSession(sessionId, { status: 'escalated', completedAt: new Date() });
    await notifyFirm(
      `Intake brief generation failed — ${session.clientName || session.clientEmail}`,
      `Intake session <code>${sessionId}</code> completed but the brief could not be generated automatically. Please review manually.`,
    );
    return { sessionId, done: true, message: completionMessage() };
  }

  return { sessionId, done: true, message: completionMessage(), matterId };
}

function completionMessage(): string {
  return `Thank you. One of our lawyers will be in touch shortly. You will receive a confirmation by email.`;
}

// ─────────────────────────────────────────────────────────────────────
// Email delivery (used by the inbox wiring)
// ─────────────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Send an agent reply to the client by email, with the portal link. */
export async function deliverReplyByEmail(session: IntakeSession, reply: AgentReply): Promise<void> {
  const parts: string[] = [];
  if (reply.message) parts.push(`<p style="white-space:pre-wrap">${escapeHtml(reply.message)}</p>`);
  if (reply.question) {
    parts.push(`<p style="white-space:pre-wrap"><b>${escapeHtml(formatQuestion(reply.question))}</b></p>`);
    parts.push('<p>Simply reply to this email with your answer.</p>');
  }
  parts.push(
    `<p style="color:#666">You can also answer here: <a href="${escapeHtml(portalUrl(session.id))}">${escapeHtml(portalUrl(session.id))}</a></p>`,
  );
  const subject = reply.done
    ? `${firmName()} — thank you, your details are with our lawyers`
    : `${firmName()} — a few questions about your matter`;
  await sendNotification(subject, parts.join('\n'), session.clientEmail);
}

async function notifyFirm(subject: string, htmlBody: string): Promise<void> {
  const to = lawyerEmail();
  if (!to) return;
  await sendNotification(`[Intake] ${subject}`, htmlBody, to);
}

// ─────────────────────────────────────────────────────────────────────
// Stale-session sweep (call from a cron / overseer tick)
// ─────────────────────────────────────────────────────────────────────

export interface SweepResult {
  remindersSent: number;
  abandoned: number;
}

/**
 * Sweep in-progress sessions: send a single reminder after 24 hours of
 * inactivity, and mark a session abandoned (notifying the firm) after
 * 48 hours.
 */
export async function dispatchIntakeFollowUps(now: Date = new Date()): Promise<SweepResult> {
  const sessions = listIntakeSessions('in-progress');
  let remindersSent = 0;
  let abandoned = 0;

  for (const session of sessions) {
    const last = session.completedAt ?? session.startedAt;
    const idleMs = now.getTime() - last.getTime();

    if (idleMs >= ABANDON_AFTER_MS) {
      updateIntakeSession(session.id, { status: 'abandoned' });
      abandoned += 1;
      await notifyFirm(
        `Abandoned intake — ${session.clientName || session.clientEmail}`,
        `<p>${escapeHtml(session.clientName || session.clientEmail)} started an intake (${escapeHtml(session.matterType)}) but did not finish within 48 hours.</p><p>A human should follow up. Session: <code>${escapeHtml(session.id)}</code></p>`,
      );
      continue;
    }

    if (idleMs >= FOLLOW_UP_AFTER_MS) {
      // Send the reminder once.
      const row = getIntakeSession(session.id);
      if (row && !sessionFollowUpSent(session.id)) {
        await sendNotification(
          `${firmName()} — just a couple more questions`,
          `<p>We noticed you didn't finish answering our questions. It only takes a couple more minutes and helps our lawyers prepare for your call.</p><p>You can continue here: <a href="${escapeHtml(portalUrl(session.id))}">${escapeHtml(portalUrl(session.id))}</a></p>`,
          session.clientEmail,
        );
        markFollowUpSent(session.id);
        remindersSent += 1;
      }
    }
  }

  return { remindersSent, abandoned };
}

// follow_up_sent is tracked on the row; these helpers keep the SQL local.
import { getDatabase } from '../../db/connection.js';

function sessionFollowUpSent(id: string): boolean {
  const row = getDatabase()
    .prepare(`SELECT follow_up_sent FROM intake_sessions WHERE id = ?`)
    .get(id) as { follow_up_sent: number } | undefined;
  return row?.follow_up_sent === 1;
}

function markFollowUpSent(id: string): void {
  getDatabase().prepare(`UPDATE intake_sessions SET follow_up_sent = 1 WHERE id = ?`).run(id);
}

export { getActiveSessionByEmail };
