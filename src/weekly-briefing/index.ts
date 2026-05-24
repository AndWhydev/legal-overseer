/**
 * Weekly intelligence briefing — public surface.
 *
 * Schedules a Monday-08:00 per-lawyer email containing their open
 * matters, upcoming deadlines, overdue items, regulatory changes
 * relevant to their practice areas, and new precedents added in the
 * last week. Each lawyer can opt out per-section.
 */

export {
  runWeeklyBriefingSweep,
  initWeeklyBriefingScheduler,
  stopWeeklyBriefingScheduler,
  buildWeeklyBriefingHtml,
  WEEKLY_BRIEFING_CRON,
  type WeeklyBriefingResult,
  type WeeklyBriefing,
} from './scheduler.js';

export {
  getBriefingPreferences,
  setBriefingPreferences,
  type BriefingPreferences,
} from './prefs.js';
