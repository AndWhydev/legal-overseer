/**
 * Setup state — the first-run wizard's "have we shipped yet?" flag.
 */

import { getDatabase } from '../db/connection.js';

export interface SetupState {
  completed: boolean;
  completed_at: string | null;
  completed_by: string | null;
  firm_name: string | null;
  notes: string | null;
}

export function getSetupState(): SetupState {
  const db = getDatabase();
  const row = db.prepare(`SELECT * FROM setup_state WHERE id = 1`).get() as
    | (Omit<SetupState, 'completed'> & { completed: number })
    | undefined;
  if (!row) {
    return { completed: false, completed_at: null, completed_by: null, firm_name: null, notes: null };
  }
  return {
    completed: row.completed === 1,
    completed_at: row.completed_at,
    completed_by: row.completed_by,
    firm_name: row.firm_name,
    notes: row.notes,
  };
}

export function isSetupComplete(): boolean {
  return getSetupState().completed;
}

export function markSetupComplete(by: string, firmName?: string, notes?: string): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE setup_state
     SET completed = 1, completed_at = ?, completed_by = ?, firm_name = ?, notes = ?
     WHERE id = 1`,
  ).run(now, by, firmName ?? null, notes ?? null);
}
