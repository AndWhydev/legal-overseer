/**
 * Date helpers shared by the question-set urgency checks and the
 * jurisdiction limitation-period engine.
 *
 * Clients answer date questions in free text, so parsing is lenient:
 * we accept ISO (YYYY-MM-DD), Australian dd/mm/yyyy, and most formats
 * the JS Date constructor understands. When a date can't be parsed we
 * return null and callers treat urgency as "unknown / not flagged".
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Parse a client-supplied date string. Returns null when unparseable. */
export function parseClientDate(value: string | undefined | null): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  // Australian dd/mm/yyyy or dd-mm-yyyy.
  const auMatch = trimmed.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (auMatch) {
    const day = Number.parseInt(auMatch[1], 10);
    const month = Number.parseInt(auMatch[2], 10);
    let year = Number.parseInt(auMatch[3], 10);
    if (year < 100) year += year < 50 ? 2000 : 1900;
    const d = new Date(year, month - 1, day);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Whole days from `from` until `to` (negative when `to` is in the past). */
export function daysBetween(from: Date, to: Date): number {
  const startOfDay = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((startOfDay(to) - startOfDay(from)) / DAY_MS);
}

/** Days from `triggerDate` until now (how long ago the trigger was). */
export function daysSince(triggerDate: Date, now: Date = new Date()): number {
  return daysBetween(triggerDate, now);
}

/** Add a number of months to a date (calendar months). */
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  d.setMonth(d.getMonth() + months);
  return d;
}

/** Add a number of years to a date. */
export function addYears(date: Date, years: number): Date {
  const d = new Date(date.getTime());
  d.setFullYear(d.getFullYear() + years);
  return d;
}

/** Add whole days to a date. */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}
