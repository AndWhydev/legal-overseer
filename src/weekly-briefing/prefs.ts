/**
 * Per-user briefing preferences.
 */

import { getDatabase } from '../db/connection.js';

export interface BriefingPreferences {
  user_id: string;
  weekly_enabled: boolean;
  section_matters: boolean;
  section_deadlines: boolean;
  section_overdue: boolean;
  section_regulatory: boolean;
  section_precedents: boolean;
  practice_areas: string[];
  updated_at: string;
}

interface RawPrefs {
  user_id: string;
  weekly_enabled: number;
  section_matters: number;
  section_deadlines: number;
  section_overdue: number;
  section_regulatory: number;
  section_precedents: number;
  practice_areas: string | null;
  updated_at: string;
}

function rowToPrefs(r: RawPrefs): BriefingPreferences {
  let pa: string[] = [];
  if (r.practice_areas) {
    try { pa = JSON.parse(r.practice_areas) as string[]; } catch { pa = []; }
  }
  return {
    user_id: r.user_id,
    weekly_enabled: r.weekly_enabled === 1,
    section_matters: r.section_matters === 1,
    section_deadlines: r.section_deadlines === 1,
    section_overdue: r.section_overdue === 1,
    section_regulatory: r.section_regulatory === 1,
    section_precedents: r.section_precedents === 1,
    practice_areas: pa,
    updated_at: r.updated_at,
  };
}

export function getBriefingPreferences(userId: string): BriefingPreferences {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM briefing_preferences WHERE user_id = ?').get(userId) as RawPrefs | undefined;
  if (row) return rowToPrefs(row);
  // Default: everything on, no practice-area filter.
  return {
    user_id: userId,
    weekly_enabled: true,
    section_matters: true,
    section_deadlines: true,
    section_overdue: true,
    section_regulatory: true,
    section_precedents: true,
    practice_areas: [],
    updated_at: new Date().toISOString(),
  };
}

export interface SetBriefingPrefsInput {
  user_id: string;
  weekly_enabled?: boolean;
  section_matters?: boolean;
  section_deadlines?: boolean;
  section_overdue?: boolean;
  section_regulatory?: boolean;
  section_precedents?: boolean;
  practice_areas?: string[];
}

export function setBriefingPreferences(input: SetBriefingPrefsInput): BriefingPreferences {
  const db = getDatabase();
  const current = getBriefingPreferences(input.user_id);
  const merged: BriefingPreferences = {
    ...current,
    ...input,
    practice_areas: input.practice_areas ?? current.practice_areas,
    updated_at: new Date().toISOString(),
  };
  db.prepare(
    `INSERT INTO briefing_preferences
       (user_id, weekly_enabled, section_matters, section_deadlines,
        section_overdue, section_regulatory, section_precedents,
        practice_areas, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       weekly_enabled = excluded.weekly_enabled,
       section_matters = excluded.section_matters,
       section_deadlines = excluded.section_deadlines,
       section_overdue = excluded.section_overdue,
       section_regulatory = excluded.section_regulatory,
       section_precedents = excluded.section_precedents,
       practice_areas = excluded.practice_areas,
       updated_at = excluded.updated_at`,
  ).run(
    merged.user_id,
    merged.weekly_enabled ? 1 : 0,
    merged.section_matters ? 1 : 0,
    merged.section_deadlines ? 1 : 0,
    merged.section_overdue ? 1 : 0,
    merged.section_regulatory ? 1 : 0,
    merged.section_precedents ? 1 : 0,
    JSON.stringify(merged.practice_areas),
    merged.updated_at,
  );
  return merged;
}
