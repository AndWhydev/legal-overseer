/**
 * 3.4 — Client satisfaction surveys.
 *
 * When a matter closes, schedule a survey 2 days later. Survey
 * delivered via email with a unique response token. Five questions:
 * overall, communication, value, NPS, free text. Responses scored by
 * matter / lawyer / practice area; negative responses (<3) flagged
 * to managing partner; perfect 5/5s flagged as testimonial candidates.
 */

import { randomBytes, randomUUID } from 'node:crypto';
import { getDatabase } from '../db/connection.js';
import { createSafeLogger } from '../governance/index.js';
import { appendLegalAudit } from '../compliance/audit.js';
import { getMatterById, listMatters } from '../db/repositories/matters.js';
import { sendNotification } from '../email/notifier.js';

const logger = createSafeLogger('Satisfaction');

export interface SatisfactionSurvey {
  id: string;
  matter_id: string;
  client_id: string | null;
  survey_token: string;
  sent_at: string;
  responded_at: string | null;
  overall_satisfaction: number | null;
  communication_quality: number | null;
  value_for_money: number | null;
  likelihood_to_recommend: number | null;
  open_feedback: string | null;
  flagged_for_review: number;
}

export interface ScheduleSurveyInput {
  matterId: string;
  clientId?: string;
}

export function scheduleSurvey(input: ScheduleSurveyInput): SatisfactionSurvey {
  const matter = getMatterById(input.matterId);
  if (!matter) throw new Error(`matter ${input.matterId} not found`);
  const db = getDatabase();
  const id = randomUUID();
  const token = randomBytes(24).toString('hex');
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO satisfaction_surveys (id, matter_id, client_id, survey_token, sent_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, matter.id, input.clientId ?? null, token, now);
  appendLegalAudit({
    matterId: matter.id,
    actorId: 'satisfaction-system',
    action: 'survey.scheduled',
    detail: matter.matter_number,
    refTable: 'satisfaction_surveys',
    refId: id,
  });
  return getSurvey(id) as SatisfactionSurvey;
}

export function getSurvey(id: string): SatisfactionSurvey | null {
  const db = getDatabase();
  return (
    (db.prepare('SELECT * FROM satisfaction_surveys WHERE id = ?').get(id) as
      | SatisfactionSurvey
      | undefined) ?? null
  );
}

export function getSurveyByToken(token: string): SatisfactionSurvey | null {
  const db = getDatabase();
  return (
    (db.prepare('SELECT * FROM satisfaction_surveys WHERE survey_token = ?').get(token) as
      | SatisfactionSurvey
      | undefined) ?? null
  );
}

export interface SubmitResponseInput {
  surveyToken: string;
  overallSatisfaction: number;
  communicationQuality: number;
  valueForMoney: number;
  likelihoodToRecommend: number;
  openFeedback?: string;
}

export function submitResponse(input: SubmitResponseInput): SatisfactionSurvey {
  const survey = getSurveyByToken(input.surveyToken);
  if (!survey) throw new Error('invalid survey token');
  if (survey.responded_at) throw new Error('already responded');
  const db = getDatabase();
  const now = new Date().toISOString();
  const flagged =
    input.overallSatisfaction < 3 || input.likelihoodToRecommend <= 6 ? 1 : 0;
  db.prepare(
    `UPDATE satisfaction_surveys
       SET responded_at = ?, overall_satisfaction = ?, communication_quality = ?,
           value_for_money = ?, likelihood_to_recommend = ?, open_feedback = ?,
           flagged_for_review = ?
     WHERE id = ?`,
  ).run(
    now,
    input.overallSatisfaction,
    input.communicationQuality,
    input.valueForMoney,
    input.likelihoodToRecommend,
    input.openFeedback ?? null,
    flagged,
    survey.id,
  );

  if (flagged) {
    const admin = process.env.ADMIN_EMAIL;
    if (admin) {
      sendNotification(
        `[Satisfaction alert] ${input.overallSatisfaction}/5 from matter ${survey.matter_id}`,
        `<p>Negative satisfaction response received.</p><ul><li>Overall: ${input.overallSatisfaction}/5</li><li>Communication: ${input.communicationQuality}/5</li><li>Value: ${input.valueForMoney}/5</li><li>NPS: ${input.likelihoodToRecommend}/10</li></ul><p>Open feedback: ${input.openFeedback ?? '(none)'}</p>`,
        admin,
      ).catch(() => undefined);
    }
  }
  if (input.overallSatisfaction === 5 && input.likelihoodToRecommend >= 9) {
    appendLegalAudit({
      matterId: survey.matter_id,
      actorId: 'satisfaction-system',
      action: 'survey.testimonial_candidate',
      detail: 'perfect score response — review for testimonial use',
      refTable: 'satisfaction_surveys',
      refId: survey.id,
    });
  }

  appendLegalAudit({
    matterId: survey.matter_id,
    actorId: 'survey-respondent',
    action: 'survey.responded',
    detail: `overall=${input.overallSatisfaction}/5, nps=${input.likelihoodToRecommend}`,
    refTable: 'satisfaction_surveys',
    refId: survey.id,
    metadata: { flagged: !!flagged },
  });

  return getSurvey(survey.id) as SatisfactionSurvey;
}

export interface SatisfactionStats {
  total: number;
  responded: number;
  averageOverall: number | null;
  averageNps: number | null;
  promoterCount: number;
  detractorCount: number;
  flaggedCount: number;
}

export function getSatisfactionStats(filters: { matterType?: string; lawyer?: string } = {}): SatisfactionStats {
  const db = getDatabase();
  const matters = listMatters().filter((m) => {
    if (filters.matterType && m.matter_type !== filters.matterType) return false;
    if (filters.lawyer && m.responsible_lawyer_email !== filters.lawyer) return false;
    return true;
  });
  const matterIds = matters.map((m) => m.id);
  if (!matterIds.length) {
    return { total: 0, responded: 0, averageOverall: null, averageNps: null, promoterCount: 0, detractorCount: 0, flaggedCount: 0 };
  }
  const placeholders = matterIds.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT * FROM satisfaction_surveys WHERE matter_id IN (${placeholders})`)
    .all(...matterIds) as SatisfactionSurvey[];
  const responded = rows.filter((r) => r.responded_at);
  const avgOverall = responded.length
    ? responded.reduce((s, r) => s + (r.overall_satisfaction ?? 0), 0) / responded.length
    : null;
  const avgNps = responded.length
    ? responded.reduce((s, r) => s + (r.likelihood_to_recommend ?? 0), 0) / responded.length
    : null;
  const promoters = responded.filter((r) => (r.likelihood_to_recommend ?? 0) >= 9).length;
  const detractors = responded.filter((r) => (r.likelihood_to_recommend ?? 10) <= 6).length;
  const flagged = responded.filter((r) => r.flagged_for_review === 1).length;
  return {
    total: rows.length,
    responded: responded.length,
    averageOverall: avgOverall,
    averageNps: avgNps,
    promoterCount: promoters,
    detractorCount: detractors,
    flaggedCount: flagged,
  };
}
