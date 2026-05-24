/**
 * Reminders module — public surface.
 *
 * The dispatcher runs on a cron schedule (default 07:30) and on
 * demand via `runReminderSweep()`. The dashboard /calendar surface
 * uses the repo helpers to render send history + snooze/dismiss
 * controls.
 */

export {
  REMINDER_OFFSETS,
  recordReminder,
  getReminderById,
  hasReminderBeenSent,
  listRemindersForDeadline,
  listRecentReminders,
  snoozeDeadline,
  isDeadlineSnoozed,
  dismissReminder,
  dismissDeadline,
  type DeadlineReminderRow,
  type ReminderOffset,
  type RecordReminderInput,
} from './repo.js';

export {
  runReminderSweep,
  initReminderScheduler,
  stopReminderScheduler,
  DEFAULT_REMINDER_CRON,
  type ReminderRunResult,
} from './dispatcher.js';
