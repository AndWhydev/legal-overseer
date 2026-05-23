/**
 * Memory module for the BitBit overseer.
 *
 * - lessons.ts:  generation + recall of one-line lessons per worker cycle
 * - playbook.ts: periodic rewrite of per-project PLAYBOOK.md from lessons
 *
 * The lessons table itself lives at db/repositories/lessons.ts.
 */

export {
  generateLessonFromTask,
  recallLessonsForPrompt,
  formatLessonsForPrompt,
} from './lessons.js';

export {
  rewriteProjectPlaybook,
  getPlaybookStatus,
  type RewriteResult,
} from './playbook.js';
