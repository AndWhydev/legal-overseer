/**
 * Client intake intelligence layer — public surface.
 *
 * This layer sits before matter creation. A prospective client makes
 * contact; the agent classifies the matter, runs the matching question
 * set for the matter type and Australian jurisdiction, calculates any
 * limitation-period urgency, researches AustLII, and hands the lawyer a
 * structured brief before the first consultation.
 *
 * Entry points:
 *   - startIntake() / submitAnswer()   — drive the conversation
 *   - generateBrief()                  — assemble the lawyer brief
 *   - dispatchIntakeFollowUps()        — 24h reminder / 48h abandonment
 */

export * from './types.js';
export {
  startIntake,
  submitAnswer,
  nextQuestion,
  formatQuestion,
  deliverReplyByEmail,
  dispatchIntakeFollowUps,
  isSmsConfigured,
  getActiveSessionByEmail,
  type AgentReply,
  type SweepResult,
} from './intake-agent.js';
export { classifyMatter, classifyByKeywords, classifyByModel, CLARIFY_QUESTION } from './classifier.js';
export { buildContext, type IntakeContext } from './context-builder.js';
export { generateBrief, renderBriefMarkdown, type GenerateBriefResult } from './brief-generator.js';
export {
  getLimitationPeriod,
  type LimitationPeriod,
} from './jurisdiction/limitation-periods.js';
export { getRelevantCourt } from './jurisdiction/court-registry.js';
export {
  normaliseState,
  fallbackLegislation,
  standardCostRange,
} from './jurisdiction/jurisdiction-rules.js';
export {
  QUESTION_SETS,
  SUPPORTED_MATTER_TYPES,
  getQuestionSet,
} from './question-sets/index.js';
export {
  createIntakeSession,
  getIntakeSession,
  listIntakeSessions,
  updateIntakeSession,
  getBriefBySession,
  getBriefByMatter,
} from './repo.js';
